import type { Booking, MeetingType, Slot } from "@calendar/sdk";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  WEEKDAY_LABELS,
  buildCalendarWeeks,
  formatSlotDay,
  formatSlotTime,
  type CalendarDay,
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
      windowStart?: Date;
      windowEnd?: Date;
      slots: readonly Slot[];
      selectedSlot?: Slot;
      onSelectSlot?: (slot: Slot) => void;
      onSelectDay?: (dayKey: string) => void;
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

type ReadyProps = Extract<BookingSlotsViewProps, { status: "ready" }>;

function dayLabel(day: CalendarDay): string {
  if (day.availabilityPercent === undefined) {
    return `${day.heading}, нет свободных слотов`;
  }

  return `${day.heading}, свободно ${day.availabilityPercent}%`;
}

function SlotPicker({ props }: { props: ReadyProps }) {
  const weeks = buildCalendarWeeks({
    slots: props.slots,
    guestTimeZone: props.guestTimeZone,
    ownerTimeZone: props.timezone,
    windowStart: props.windowStart,
    windowEnd: props.windowEnd,
  });
  const days = weeks.flatMap((week) => week.days.filter((day): day is CalendarDay => day !== null));
  const firstAvailableDay = days.find((day) => day.freeCount > 0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | undefined>(firstAvailableDay?.key);
  const selectedDay =
    days.find((day) => day.key === selectedDayKey && day.freeCount > 0) ?? firstAvailableDay;

  function handleSelectDay(day: CalendarDay): void {
    if (day.freeCount === 0 || day.key === selectedDay?.key) {
      return;
    }

    setSelectedDayKey(day.key);
    props.onSelectDay?.(day.key);
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-label="Календарь свободных дней">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>
        <div className="mt-1 space-y-1">
          {weeks.map((week) => (
            <div className="grid grid-cols-7 gap-1" key={week.key}>
              {week.days.map((day, index) => {
                if (day === null) {
                  return <div key={`${week.key}-${index}`} />;
                }

                const selected = day.key === selectedDay?.key;
                const available = day.freeCount > 0;
                const stateClassName = !available
                  ? "cursor-not-allowed border-border bg-background text-muted-foreground opacity-50"
                  : selected
                    ? "border-foreground bg-muted font-semibold"
                    : "border-border bg-background hover:bg-muted";

                return (
                  <button
                    aria-label={dayLabel(day)}
                    aria-pressed={selected}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-md border text-sm ${stateClassName}`}
                    disabled={!available}
                    key={day.key}
                    onClick={() => handleSelectDay(day)}
                    title={day.heading}
                    type="button"
                  >
                    <span>{day.dayOfMonth}</span>
                    {day.availabilityPercent === undefined ? null : (
                      <span className="text-xs font-normal text-muted-foreground">
                        {day.availabilityPercent}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>
      <section aria-label="Свободные слоты">
        {selectedDay === undefined ? (
          <p className="text-muted-foreground">Нет свободных слотов в ближайшие 14 дней.</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold capitalize">{selectedDay.heading}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {selectedDay.slots.map((slot) => {
                const selected = props.selectedSlot?.startAt.getTime() === slot.startAt.getTime();

                return (
                  <li key={slot.startAt.toISOString()}>
                    <button
                      aria-pressed={selected}
                      className={
                        selected
                          ? "rounded-md border border-border bg-muted px-3 py-2 text-sm"
                          : "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                      }
                      onClick={() => props.onSelectSlot?.(slot)}
                      type="button"
                    >
                      {formatSlotTime(slot.startAt, props.guestTimeZone)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function SlotsContent({ props }: { props: ReadyProps }) {
  if (props.booking.status === "success") {
    return (
      <div className="mt-6 space-y-6">
        <TimeZoneReference timezone={props.timezone} />
        <SuccessContent booking={props.booking.booking} guestTimeZone={props.guestTimeZone} />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <TimeZoneReference timezone={props.timezone} />
      {props.booking.status === "error" ? (
        <p className="text-sm text-muted-foreground" role="alert">
          {props.booking.message}
        </p>
      ) : null}
      {props.selectedSlot ? (
        <BookingForm
          guestTimeZone={props.guestTimeZone}
          onSubmit={props.onSubmit}
          slot={props.selectedSlot}
          state={props.booking}
        />
      ) : null}
      <SlotPicker props={props} />
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
