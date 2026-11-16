import type { Slot } from "@calendar/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { bookingsQuery, createBooking, meetingTypesQuery, slotsQuery } from "../api/queries";
import { BookingSlotsView, type BookingFormState } from "../components/booking-slots-view";
import { detectBrowserTimeZone, groupSlotsByDay, slotDayKey } from "../lib/slots";

const CONFLICT_MESSAGE = "Это время уже занято. Пожалуйста, выберите другой слот.";
const INVALID_MESSAGE = "Проверьте имя и e-mail: сервер отклонил запрос.";
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

  const slotsData = slotsResult.data;
  const slotGroups =
    slotsData !== undefined && "slots" in slotsData
      ? groupSlotsByDay(slotsData.slots, guestTimeZone)
      : [];
  const availableDayKeys = slotGroups.map((group) => group.key);
  const firstAvailableDayKey = availableDayKeys[0];

  useEffect(() => {
    if (firstAvailableDayKey === undefined) {
      if (selectedDayKey !== undefined) {
        setSelectedDayKey(undefined);
      }
      if (selectedSlot !== undefined) {
        setSelectedSlot(undefined);
      }
      return;
    }

    if (selectedDayKey === undefined || !availableDayKeys.includes(selectedDayKey)) {
      setSelectedDayKey(firstAvailableDayKey);
      if (selectedSlot !== undefined) {
        setSelectedSlot(undefined);
        setFormState({ status: "idle" });
      }
    }
  }, [availableDayKeys, firstAvailableDayKey, selectedDayKey, selectedSlot]);

  function handleSelectDay(dayKey: string): void {
    setSelectedDayKey(dayKey);
    setSelectedSlot(undefined);
    setFormState({ status: "idle" });
  }

  function handleSelectSlot(slot: Slot): void {
    setSelectedSlot(slot);
    setSelectedDayKey(slotDayKey(slot.startAt, guestTimeZone));
    setFormState({ status: "idle" });
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

    setFormState({ status: "submitting" });

    try {
      const result = await mutation.mutateAsync({
        meetingTypeId: id,
        startAt: selectedSlot.startAt,
        attendeeName,
        attendeeEmail,
      });

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

  if (slotsData === undefined || !("slots" in slotsData)) {
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
      slots={slotsData.slots}
      status="ready"
      timezone={slotsData.timezone}
      windowEnd={slotsData.windowEnd}
      windowStart={slotsData.windowStart}
    />
  );
}
