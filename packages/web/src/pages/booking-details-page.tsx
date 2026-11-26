import type { CreateBookingRequest } from "@calendar/sdk";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { bookingsQuery, createBooking, detailsSlotsQuery, meetingTypesQuery } from "../api/queries";
import { type BookingDetailsForm, BookingDetailsView } from "../components/booking-details-view";
import {
  findSlotByStartAt,
  INVALID_START_NOTICE,
  normalizeDescription,
  noticePath,
  START_AT_PARAM,
} from "../lib/booking-details";
import { detectBrowserTimeZone } from "../lib/slots";

const CONFLICT_MESSAGE = "Это время уже занято. Пожалуйста, выберите другой слот.";
const INVALID_REQUEST_MESSAGE = "Проверьте имя, e-mail и описание: сервер отклонил запрос.";
const GENERIC_ERROR_MESSAGE = "Не удалось забронировать слот. Попробуйте ещё раз.";

type BookingDetailsPageProps = {
  guestTimeZone?: string;
};

export function BookingDetailsPage({
  guestTimeZone = detectBrowserTimeZone(),
}: BookingDetailsPageProps = {}) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BookingDetailsForm>({ status: "idle" });
  const meetingTypesResult = useQuery(meetingTypesQuery);
  const slotsResult = useQuery({
    ...detailsSlotsQuery(id ?? ""),
    enabled: id !== undefined,
  });
  const mutation = useMutation({ mutationFn: createBooking });

  const meetingType = meetingTypesResult.data?.meetingTypes.find((item) => item.id === id);
  const meetingTypeSummary =
    meetingType === undefined
      ? undefined
      : { name: meetingType.name, durationMinutes: meetingType.durationMinutes };
  const bookingPath = `/book/${id ?? ""}`;

  if (meetingTypesResult.isLoading || slotsResult.isLoading) {
    return (
      <BookingDetailsView
        backHref={bookingPath}
        meetingType={meetingTypeSummary}
        status="loading"
      />
    );
  }

  if (meetingTypesResult.isError || slotsResult.isError) {
    return (
      <BookingDetailsView
        backHref={bookingPath}
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
        status="error"
      />
    );
  }

  if (meetingType === undefined) {
    return (
      <BookingDetailsView backHref={bookingPath} message="Тип встречи не найден." status="error" />
    );
  }

  const slotList = slotsResult.data;

  if (slotList === undefined || !("slots" in slotList)) {
    return (
      <BookingDetailsView
        backHref={bookingPath}
        meetingType={meetingTypeSummary}
        message="Не удалось загрузить свободные слоты."
        status="error"
      />
    );
  }

  const lookup = findSlotByStartAt(searchParams.get(START_AT_PARAM), slotList.slots);

  if (lookup.status === "invalid") {
    return <Navigate replace to={noticePath(bookingPath, INVALID_START_NOTICE)} />;
  }

  const slot = lookup.slot;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const attendeeName = String(formData.get("attendeeName") ?? "").trim();
    const attendeeEmail = String(formData.get("attendeeEmail") ?? "").trim();
    const description = normalizeDescription(String(formData.get("description") ?? ""));

    const request: CreateBookingRequest = {
      meetingTypeId: id ?? "",
      startAt: slot.startAt,
      attendeeName,
      attendeeEmail,
    };

    if (description !== undefined) {
      request.description = description;
    }

    setForm({ status: "submitting" });

    try {
      const result = await mutation.mutateAsync(request);

      if ("code" in result) {
        const message =
          result.code === "slot_not_available"
            ? CONFLICT_MESSAGE
            : result.code === "meeting_type_not_found"
              ? "Тип встречи не найден."
              : INVALID_REQUEST_MESSAGE;

        setForm({ status: "error", message });
        return;
      }

      setForm({ status: "success", booking: result });
      const refreshBookings = queryClient.invalidateQueries({ queryKey: bookingsQuery.queryKey });
      refreshBookings.catch((error) => console.error("Refresh bookings failed", error));
    } catch (error) {
      console.error("Create booking failed", error);
      setForm({ status: "error", message: GENERIC_ERROR_MESSAGE });
    }
  }

  return (
    <BookingDetailsView
      backHref={bookingPath}
      form={form}
      guestTimeZone={guestTimeZone}
      meetingType={meetingTypeSummary}
      onSubmit={handleSubmit}
      slot={slot}
      status="ready"
    />
  );
}
