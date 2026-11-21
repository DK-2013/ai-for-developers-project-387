import type { CreateBookingRequest, Slot } from "@calendar/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { bookingsQuery, createBooking, meetingTypesQuery, slotsQuery } from "../api/queries";
import { BookingSlotsView } from "../components/booking-slots-view";
import {
  type GuestSelection,
  initialSelection,
  reconcile,
  selectDay,
  selectSlot,
  submitFailed,
  submitStarted,
  submitSucceeded,
} from "../lib/booking-selection";
import { detectBrowserTimeZone } from "../lib/slots";

const CONFLICT_MESSAGE = "Это время уже занято. Пожалуйста, выберите другой слот.";
const INVALID_MESSAGE = "Проверьте имя, e-mail и описание: сервер отклонил запрос.";
const GENERIC_ERROR_MESSAGE = "Не удалось забронировать слот. Попробуйте ещё раз.";

type BookingPageProps = {
  guestTimeZone?: string;
};

export function BookingPage({ guestTimeZone = detectBrowserTimeZone() }: BookingPageProps = {}) {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [rawSelection, setSelection] = useState(initialSelection);
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
  const slotList = slotsData !== undefined && "slots" in slotsData ? slotsData : undefined;
  const offeredSlots = slotList?.slots;

  function withOfferedSlots(current: GuestSelection): GuestSelection {
    return offeredSlots !== undefined ? reconcile(current, offeredSlots, guestTimeZone) : current;
  }

  const selection = withOfferedSlots(rawSelection);

  function updateSelection(change: (current: GuestSelection) => GuestSelection): void {
    setSelection((current) => change(withOfferedSlots(current)));
  }

  function handleSelectSlot(slot: Slot): void {
    updateSelection((current) => selectSlot(current, slot, guestTimeZone));
  }

  function handleSelectDay(dayKey: string): void {
    updateSelection((current) => selectDay(current, dayKey, guestTimeZone));
  }

  async function refreshSlots(): Promise<void> {
    if (id !== undefined) {
      await queryClient.invalidateQueries({ queryKey: slotsQuery(id).queryKey });
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const selectedSlot = selection.selectedSlot;

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

    updateSelection((current) => submitStarted(current));

    try {
      const result = await mutation.mutateAsync(request);

      if ("code" in result) {
        if (result.code === "slot_not_available") {
          updateSelection((current) =>
            submitFailed(current, { reason: "slot_taken", message: CONFLICT_MESSAGE }),
          );
          await refreshSlots();
          return;
        }

        if (result.code === "meeting_type_not_found") {
          updateSelection((current) =>
            submitFailed(current, { reason: "rejected", message: "Тип встречи не найден." }),
          );
          return;
        }

        updateSelection((current) =>
          submitFailed(current, { reason: "rejected", message: INVALID_MESSAGE }),
        );
        return;
      }

      updateSelection((current) => submitSucceeded(current, result));
      await queryClient.invalidateQueries({ queryKey: bookingsQuery.queryKey });
      await refreshSlots();
    } catch (error) {
      console.error("Create booking failed", error);
      updateSelection((current) =>
        submitFailed(current, { reason: "rejected", message: GENERIC_ERROR_MESSAGE }),
      );
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

  if (slotList === undefined) {
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
      guestTimeZone={guestTimeZone}
      meetingType={meetingTypeSummary}
      onSelectDay={handleSelectDay}
      onSelectSlot={handleSelectSlot}
      onSubmit={handleSubmit}
      selection={selection}
      slots={slotList.slots}
      status="ready"
      timezone={slotList.timezone}
      windowStart={slotList.windowStart}
      windowEnd={slotList.windowEnd}
    />
  );
}
