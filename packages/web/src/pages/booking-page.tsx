import type { CreateBookingRequest, Slot } from "@calendar/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { bookingsQuery, createBooking, meetingTypesQuery, slotsQuery } from "../api/queries";
import { BookingSlotsView, type BookingFormState } from "../components/booking-slots-view";
import { detectBrowserTimeZone, guestDayKey } from "../lib/slots";

const CONFLICT_MESSAGE = "Это время уже занято. Пожалуйста, выберите другой слот.";
const INVALID_MESSAGE = "Проверьте имя, e-mail и описание: сервер отклонил запрос.";
const GENERIC_ERROR_MESSAGE = "Не удалось забронировать слот. Попробуйте ещё раз.";

type BookingPageProps = {
  guestTimeZone?: string;
};

export function BookingPage({ guestTimeZone = detectBrowserTimeZone() }: BookingPageProps = {}) {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [selectedSlot, setSelectedSlot] = useState<Slot>();
  const [selectedDayKey, setSelectedDayKey] = useState<string>();
  const [formState, setFormState] = useState<BookingFormState>({ status: "idle" });
  const meetingTypesResult = useQuery(meetingTypesQuery);
  const slotsResult = useQuery({
    ...slotsQuery(id ?? ""),
    enabled: id !== undefined,
  });
  const mutation = useMutation({ mutationFn: createBooking });

  const meetingType = meetingTypesResult.data?.meetingTypes.find((item) => item.id === id);
  const meetingTypeSummary =
    meetingType === undefined
      ? undefined
      : { name: meetingType.name, durationMinutes: meetingType.durationMinutes };

  function handleSelectSlot(slot: Slot): void {
    setSelectedSlot(slot);
    setFormState({ status: "idle" });
  }

  function handleSelectDay(dayKey: string): void {
    if (selectedSlot !== undefined && guestDayKey(selectedSlot.startAt, guestTimeZone) !== dayKey) {
      setSelectedSlot(undefined);
      setFormState({ status: "idle" });
    }

    setSelectedDayKey(dayKey);
  }

  async function refreshSlots(): Promise<void> {
    if (id !== undefined) {
      await queryClient.invalidateQueries({ queryKey: slotsQuery(id).queryKey });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (id === undefined || selectedSlot === undefined) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const attendeeName = String(formData.get("attendeeName") ?? "").trim();
    const attendeeEmail = String(formData.get("attendeeEmail") ?? "").trim();
    const rawDescription = String(formData.get("description") ?? "");
    const description = rawDescription.trim() === "" ? undefined : rawDescription;

    const request: CreateBookingRequest = {
      meetingTypeId: id,
      startAt: selectedSlot.startAt,
      attendeeName,
      attendeeEmail,
    };

    if (description !== undefined) {
      request.description = description;
    }

    setFormState({ status: "submitting" });

    try {
      const result = await mutation.mutateAsync(request);

      if ("code" in result) {
        if (result.code === "slot_not_available") {
          setSelectedSlot(undefined);
          setFormState({ status: "error", message: CONFLICT_MESSAGE });
          await refreshSlots();
          return;
        }

        if (result.code === "meeting_type_not_found") {
          setFormState({ status: "error", message: "Тип встречи не найден." });
          return;
        }

        setFormState({ status: "error", message: INVALID_MESSAGE });
        return;
      }

      setSelectedSlot(undefined);
      setFormState({ status: "success", booking: result });
      await queryClient.invalidateQueries({ queryKey: bookingsQuery.queryKey });
      await refreshSlots();
    } catch (error) {
      console.error("Create booking failed", error);
      setFormState({ status: "error", message: GENERIC_ERROR_MESSAGE });
    }
  }

  if (meetingTypesResult.isLoading || slotsResult.isLoading) {
    return <BookingSlotsView status="loading" meetingType={meetingTypeSummary} />;
  }

  if (meetingTypesResult.isError || slotsResult.isError) {
    return (
      <BookingSlotsView
        status="error"
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
      />
    );
  }

  if (meetingType === undefined) {
    return <BookingSlotsView status="error" message="Тип встречи не найден." />;
  }

  const slots = slotsResult.data;

  if (slots === undefined || !("slots" in slots)) {
    return (
      <BookingSlotsView
        status="error"
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
      />
    );
  }

  return (
    <BookingSlotsView
      booking={formState}
      guestTimeZone={guestTimeZone}
      meetingType={meetingTypeSummary}
      onSelectDay={handleSelectDay}
      onSelectSlot={handleSelectSlot}
      onSubmit={handleSubmit}
      selectedDayKey={selectedDayKey}
      selectedSlot={selectedSlot}
      slots={slots.slots}
      status="ready"
      timezone={slots.timezone}
      windowStart={slots.windowStart}
      windowEnd={slots.windowEnd}
    />
  );
}
