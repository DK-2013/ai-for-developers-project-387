import type { Booking, MeetingType, Slot } from "@calendar/sdk";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  formatSlotDay,
  formatSlotTime,
  WEEKDAY_LABELS,
  type BookingCalendar,
  type BookingDay,
} from "../lib/slots";

type MeetingTypeSummary = Pick<MeetingType, "name" | "durationMinutes">;

export type BookingFormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; booking: Booking }
  | { status: "error"; message: string };

export type BookingSlotsViewProps =
  | { status: "loading"; meetingType?: MeetingTypeSummary }
  | { status: "error"; meetingType?: MeetingTypeSummary; message: string }
  | {
      status: "ready";
      meetingType?: MeetingTypeSummary;
      timezone: string;
      guestTimeZone: string;
      calendar: BookingCalendar;
      selectedDayKey?: string;
      onSelectDay?: (dayKey: string) => void;
      selectedSlot?: Slot;
      onSelectSlot?: (slot: Slot) => void;
      booking: BookingFormState;
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
    </section>
  );
}

function BookingForm({
  slot,
  guestTimeZone,
  state,
  onSubmit,
}: {
  slot: Slot;
  guestTimeZone: string;
  state: BookingFormState;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const submitting = state.status === "submitting";

  return (
    <form className="mt-6 grid gap-4 rounded-md border border-border p-4" onSubmit={onSubmit}>
      <p className="text-sm font-medium">
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
      <button
        className="justify-self-start rounded-md border border-border bg-background px-4 py-2 hover:bg-muted disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Бронирование..." : "Забронировать"}
      </button>
    </form>
  );
}

function TimeZoneReference({ timezone }: { timezone: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Время в вашем часовом поясе. Часовой пояс владельца: {timezone}.
    </p>
  );
}

function DayButton({
  day,
  selected,
  onSelectDay,
}: {
  day: BookingDay;
  selected: boolean;
  onSelectDay?: (dayKey: string) => void;
}) {
  const available = day.slots.length > 0;
  const className = selected
    ? "flex min-h-12 w-full flex-col items-center justify-center rounded-md border border-border bg-muted px-1 py-1 text-xs font-semibold"
    : "flex min-h-12 w-full flex-col items-center justify-center rounded-md border border-border px-1 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background";

  return (
    <button
      aria-label={day.heading}
      aria-pressed={available ? selected : undefined}
      className={className}
      disabled={!available}
      onClick={() => onSelectDay?.(day.key)}
      type="button"
    >
      <span className="block">{day.weekday}</span>
      <span className="block">{day.dateLabel}</span>
    </button>
  );
}

function DayGrid({
  calendar,
  selectedDayKey,
  onSelectDay,
}: {
  calendar: BookingCalendar;
  selectedDayKey?: string;
  onSelectDay?: (dayKey: string) => void;
}) {
  return (
    <table aria-label="Дни окна бронирования" className="w-full table-fixed border-collapse">
      <caption className="sr-only">Дни окна бронирования</caption>
      <thead>
        <tr>
          {WEEKDAY_LABELS.map((label) => (
            <th
              className="pb-1 text-center text-xs font-medium text-muted-foreground"
              key={label}
              scope="col"
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {calendar.weeks.map((week) => (
          <tr key={week.key}>
            {week.days.map((day, index) => (
              <td className="p-0.5" key={day?.key ?? `${week.key}-${index}`}>
                {day !== undefined ? (
                  <DayButton
                    day={day}
                    onSelectDay={onSelectDay}
                    selected={day.key === selectedDayKey}
                  />
                ) : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SelectedDaySlots({
  day,
  guestTimeZone,
  selectedSlot,
  onSelectSlot,
}: {
  day?: BookingDay;
  guestTimeZone: string;
  selectedSlot?: Slot;
  onSelectSlot?: (slot: Slot) => void;
}) {
  if (day === undefined || day.slots.length === 0) {
    return <p className="text-muted-foreground">Нет свободных слотов в ближайшие 14 дней.</p>;
  }

  return (
    <section aria-label="Слоты выбранного дня">
      <h2 className="text-lg font-semibold capitalize">{day.heading}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {day.slots.map((slot) => {
          const selected = selectedSlot?.startAt.getTime() === slot.startAt.getTime();

          return (
            <li key={slot.startAt.toISOString()}>
              <button
                aria-pressed={selected}
                className={
                  selected
                    ? "rounded-md border border-border bg-muted px-3 py-2 text-sm"
                    : "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                }
                onClick={() => onSelectSlot?.(slot)}
                type="button"
              >
                {formatSlotTime(slot.startAt, guestTimeZone)}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SlotsContent({ props }: { props: Extract<BookingSlotsViewProps, { status: "ready" }> }) {
  if (props.booking.status === "success") {
    return (
      <div className="mt-6 space-y-6">
        <TimeZoneReference timezone={props.timezone} />
        <SuccessContent booking={props.booking.booking} guestTimeZone={props.guestTimeZone} />
      </div>
    );
  }

  const selectedDay =
    props.calendar.days.find((day) => day.key === props.selectedDayKey) ??
    props.calendar.days.find((day) => day.slots.length > 0);

  return (
    <div className="mt-6 space-y-6">
      <TimeZoneReference timezone={props.timezone} />
      {props.booking.status === "error" ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {props.booking.message}
        </p>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-start">
        <DayGrid
          calendar={props.calendar}
          onSelectDay={props.onSelectDay}
          selectedDayKey={selectedDay?.key}
        />
        <div>
          <SelectedDaySlots
            day={selectedDay}
            guestTimeZone={props.guestTimeZone}
            onSelectSlot={props.onSelectSlot}
            selectedSlot={props.selectedSlot}
          />
          {props.selectedSlot ? (
            <BookingForm
              guestTimeZone={props.guestTimeZone}
              onSubmit={props.onSubmit}
              slot={props.selectedSlot}
              state={props.booking}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BookingSlotsView(props: BookingSlotsViewProps) {
  return (
    <Page>
      <h1 className="text-2xl font-bold">Выбор времени</h1>
      <MeetingTypeHeading meetingType={props.meetingType} />
      {props.status === "loading" ? (
        <p className="mt-6 text-muted-foreground">Загрузка...</p>
      ) : null}
      {props.status === "error" ? (
        <p className="mt-6 text-muted-foreground">{props.message}</p>
      ) : null}
      {props.status === "ready" ? <SlotsContent props={props} /> : null}
      <Link className="mt-6 inline-block underline" to="/">
        Назад к списку типов встреч
      </Link>
    </Page>
  );
}
