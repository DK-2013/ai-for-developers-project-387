import type { Booking, MeetingType, Slot } from "@calendar/sdk";
import type { FormEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  formatSlotTime,
  getWindowDays,
  groupSlotsByDay,
  slotDayKey,
  splitDaysIntoWeeks,
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
      windowStart: Date;
      windowEnd: Date;
      slots: readonly Slot[];
      selectedDayKey?: string;
      selectedSlot?: Slot;
      onSelectDay?: (dayKey: string) => void;
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

function formatSlotDay(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
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

function DayGrid({
  guestTimeZone,
  windowStart,
  windowEnd,
  slotsByDay,
  selectedDayKey,
  onSelectDay,
}: {
  guestTimeZone: string;
  windowStart: Date;
  windowEnd: Date;
  slotsByDay: ReadonlyMap<string, readonly Slot[]>;
  selectedDayKey?: string;
  onSelectDay?: (dayKey: string) => void;
}) {
  const days = getWindowDays(windowStart, windowEnd, guestTimeZone);
  const weeks = splitDaysIntoWeeks(days);
  const weekdayHeaders = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return (
    <section aria-label="Дни окна бронирования" className="min-w-0">
      <h2 className="text-lg font-semibold">Дни окна бронирования</h2>
      <div className="mt-2 overflow-hidden">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              {weekdayHeaders.map((label) => (
                <th key={label} className="px-1 py-1 text-center font-medium text-muted-foreground">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, index) => (
              <tr key={index}>
                {week.map((cell) => {
                  if (cell.kind === "empty") {
                    return (
                      <td key={cell.key} className="p-0 align-top">
                        <div
                          aria-hidden="true"
                          className="h-16 rounded-md border border-transparent"
                        />
                      </td>
                    );
                  }
                  const hasSlots = (slotsByDay.get(cell.day.key)?.length ?? 0) > 0;
                  const selected = cell.day.key === selectedDayKey;
                  return (
                    <td key={cell.day.key} className="p-0 align-top">
                      <button
                        aria-pressed={selected}
                        className={
                          hasSlots
                            ? selected
                              ? "flex h-16 w-full flex-col items-center justify-center rounded-md border border-border bg-muted px-1 text-center"
                              : "flex h-16 w-full flex-col items-center justify-center rounded-md border border-border bg-background px-1 text-center hover:bg-muted"
                            : "flex h-16 w-full cursor-not-allowed flex-col items-center justify-center rounded-md border border-border bg-background px-1 text-center text-muted-foreground opacity-50"
                        }
                        data-testid={`day-${cell.day.key}`}
                        disabled={!hasSlots}
                        onClick={() => onSelectDay?.(cell.day.key)}
                        type="button"
                      >
                        <span className="text-xs">{cell.day.weekdayLabel}</span>
                        <span className="text-xs font-medium">{cell.day.dateLabel}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

  const groups = groupSlotsByDay(props.slots, props.guestTimeZone);
  const slotsByDay = new Map(groups.map((group) => [group.key, group.slots]));
  const selectedGroup =
    props.selectedDayKey === undefined
      ? undefined
      : groups.find((group) => group.key === props.selectedDayKey);
  const selectedSlots = selectedGroup?.slots ?? [];
  const hasAnySlots = groups.length > 0;

  return (
    <div className="mt-6 space-y-6">
      <TimeZoneReference timezone={props.timezone} />
      {!hasAnySlots ? (
        <p className="text-muted-foreground">Нет свободных слотов в ближайшие 14 дней.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <DayGrid
            guestTimeZone={props.guestTimeZone}
            onSelectDay={props.onSelectDay}
            selectedDayKey={props.selectedDayKey}
            slotsByDay={slotsByDay}
            windowEnd={props.windowEnd}
            windowStart={props.windowStart}
          />
          <section aria-label="Слоты выбранного дня" className="min-w-0">
            {props.booking.status === "error" ? (
              <p className="text-sm text-muted-foreground" role="alert">
                {props.booking.message}
              </p>
            ) : null}
            {selectedGroup ? (
              <>
                <h2 className="text-lg font-semibold capitalize">{selectedGroup.heading}</h2>
                {props.selectedSlot ? (
                  <BookingForm
                    guestTimeZone={props.guestTimeZone}
                    onSubmit={props.onSubmit}
                    slot={props.selectedSlot}
                    state={props.booking}
                  />
                ) : null}
                {selectedSlots.length === 0 ? (
                  <p className="mt-2 text-muted-foreground">В этот день нет свободных слотов.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {selectedSlots.map((slot) => {
                      const selected =
                        props.selectedSlot?.startAt.getTime() === slot.startAt.getTime();

                      return (
                        <li key={slot.startAt.toISOString()}>
                          <button
                            aria-pressed={selected}
                            className={
                              selected
                                ? "rounded-md border border-border bg-muted px-3 py-2 text-sm"
                                : "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                            }
                            data-testid={`slot-${slot.startAt.toISOString()}`}
                            onClick={() => props.onSelectSlot?.(slot)}
                            type="button"
                          >
                            {formatSlotTime(slot.startAt, props.guestTimeZone)}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Выберите день со свободными слотами.</p>
            )}
          </section>
        </div>
      )}
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
