import type { Booking, MeetingType, Slot } from "@calendar/sdk";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { codePointLength } from "../lib/booking-details";
import { formatSlotDay, formatSlotTime } from "../lib/slots";

type MeetingTypeSummary = Pick<MeetingType, "name" | "durationMinutes">;

const MAX_DESCRIPTION_LENGTH = 1000;

export type BookingDetailsForm =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; booking: Booking }
  | { status: "error"; message: string };

export type BookingDetailsViewProps =
  | { status: "loading"; meetingType?: MeetingTypeSummary; backHref: string }
  | {
      status: "error";
      meetingType?: MeetingTypeSummary;
      backHref: string;
      message: string;
    }
  | {
      status: "ready";
      meetingType?: MeetingTypeSummary;
      backHref: string;
      slot: Slot;
      guestTimeZone: string;
      form: BookingDetailsForm;
      onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
    };

function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-4xl p-6">{children}</main>;
}

function MeetingTypeHeading({ meetingType }: { meetingType?: MeetingTypeSummary }) {
  if (meetingType === undefined) {
    return null;
  }

  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {meetingType.name} · {meetingType.durationMinutes} мин
    </p>
  );
}

function SuccessContent({ booking, guestTimeZone }: { booking: Booking; guestTimeZone: string }) {
  return (
    <section
      aria-label="Подтверждение бронирования"
      className="mt-6 space-y-2 rounded-md border border-border p-4"
    >
      <h2 className="text-lg font-semibold">Вы записаны</h2>
      <p>
        {booking.meetingTypeName} · {formatSlotDay(booking.startAt, guestTimeZone)},{" "}
        {formatSlotTime(booking.startAt, guestTimeZone)}
      </p>
      <p className="text-sm text-muted-foreground">
        {booking.attendeeName}, {booking.attendeeEmail}
      </p>
      {booking.description ? (
        <p className="whitespace-pre-line text-sm">Описание: {booking.description}</p>
      ) : null}
    </section>
  );
}

function BookingForm({
  slot,
  guestTimeZone,
  submitting,
  onSubmit,
}: {
  slot: Slot;
  guestTimeZone: string;
  submitting: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [description, setDescription] = useState("");
  const descriptionLength = codePointLength(description);
  const descriptionTooLong = descriptionLength > MAX_DESCRIPTION_LENGTH;

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (descriptionTooLong) {
      event.preventDefault();
      return;
    }

    onSubmit?.(event);
  }

  return (
    <form className="mt-6 grid gap-4 rounded-md border border-border p-4" onSubmit={handleSubmit}>
      <p className="text-sm font-medium" role="note">
        Выбрано: {formatSlotDay(slot.startAt, guestTimeZone)},{" "}
        {formatSlotTime(slot.startAt, guestTimeZone)}
      </p>
      <label className="grid gap-1 text-sm font-medium">
        Имя
        <input
          className="rounded-md border border-border bg-background px-3 py-2"
          maxLength={200}
          name="attendeeName"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        E-mail
        <input
          className="rounded-md border border-border bg-background px-3 py-2"
          maxLength={254}
          name="attendeeEmail"
          required
          type="email"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Описание (необязательно)
        <textarea
          aria-describedby="booking-description-hint"
          className="rounded-md border border-border bg-background px-3 py-2"
          id="booking-description"
          name="description"
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          value={description}
        />
      </label>
      <span
        className="text-xs text-muted-foreground"
        id="booking-description-hint"
        role={descriptionTooLong ? "alert" : undefined}
      >
        {descriptionTooLong
          ? `Описание длиннее ${MAX_DESCRIPTION_LENGTH} символов: сейчас ${descriptionLength}`
          : `До ${MAX_DESCRIPTION_LENGTH} символов`}
      </span>
      <button
        className="justify-self-start rounded-md border border-border bg-background px-4 py-2 hover:bg-muted disabled:opacity-50"
        disabled={submitting || descriptionTooLong}
        type="submit"
      >
        {submitting ? "Бронирование..." : "Забронировать"}
      </button>
    </form>
  );
}

function ReadyContent(props: Extract<BookingDetailsViewProps, { status: "ready" }>) {
  if (props.form.status === "success") {
    return <SuccessContent booking={props.form.booking} guestTimeZone={props.guestTimeZone} />;
  }

  return (
    <>
      <BookingForm
        guestTimeZone={props.guestTimeZone}
        onSubmit={props.onSubmit}
        slot={props.slot}
        submitting={props.form.status === "submitting"}
      />
      {props.form.status === "error" ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm" role="alert">
            {props.form.message}
          </p>
          <Link className="inline-block underline" to={props.backHref}>
            Выбрать другое время
          </Link>
        </div>
      ) : null}
    </>
  );
}

const getContent = (props: BookingDetailsViewProps) => {
  switch (props.status) {
    case "loading":
      return <p className="mt-6 text-muted-foreground">Загрузка...</p>;
    case "error":
      return <p className="mt-6 text-muted-foreground">{props.message}</p>;
    case "ready":
      return <ReadyContent {...props} />;
  }
};

export function BookingDetailsView(props: BookingDetailsViewProps) {
  return (
    <Page>
      <h1 className="text-2xl font-bold">Данные для записи</h1>
      <MeetingTypeHeading meetingType={props.meetingType} />
      {getContent(props)}
      <Link className="mt-6 inline-block underline" to={props.backHref}>
        Назад к выбору времени
      </Link>
    </Page>
  );
}
