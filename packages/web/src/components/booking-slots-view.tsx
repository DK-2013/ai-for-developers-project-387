import type { Booking, MeetingType, Slot } from "@calendar/sdk";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  activeDay,
  type BookingFormState,
  type GuestSelection,
  isSlotSelected,
} from "../lib/booking-selection";
import {
  buildBookingCalendar,
  type BookingCalendar,
  type BookingCalendarDay,
  formatSlotDay,
  formatSlotTime,
} from "../lib/slots";

type MeetingTypeSummary = Pick<MeetingType, "name" | "durationMinutes">;

const MAX_DESCRIPTION_LENGTH = 1000;

export function codePointLength(value: string): number {
  return [...value].length;
}

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
      selection: GuestSelection;
      onSelectSlot?: (slot: Slot) => void;
      onSelectDay?: (dayKey: string) => void;
      onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
    };

type ReadyProps = Extract<BookingSlotsViewProps, { status: "ready" }>;

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
  state,
  onSubmit,
}: {
  slot: Slot;
  guestTimeZone: string;
  state: BookingFormState;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [description, setDescription] = useState("");
  const submitting = state.status === "submitting";
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

const weekdays = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function slotCountLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (last === 1 && lastTwo !== 11) {
    return `${count} свободный слот`;
  }

  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} свободных слота`;
  }

  return `${count} свободных слотов`;
}

function buttonClass(selected: boolean, base: string, size: string): string {
  return selected ? `${base} bg-muted ${size}` : `${base} ${size} hover:bg-muted`;
}

function SlotBar({
  active,
  count,
  maxCount,
}: {
  active: boolean;
  count: number;
  maxCount: number;
}) {
  const segments = Math.max(1, Math.round((5 * count) / maxCount));

  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-1 justify-center gap-0.5"
      data-slot-bar={active ? undefined : ""}
    >
      {active
        ? null
        : Array.from({ length: segments }, (_, index) => (
            <span className="h-1 w-1 rounded-full bg-available" key={index} />
          ))}
    </span>
  );
}

function PressableButton({
  pressed,
  base,
  size,
  onPress,
  ariaLabel,
  children,
}: {
  pressed: boolean;
  base: string;
  size: string;
  onPress?: () => void;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={buttonClass(pressed, base, size)}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}

function TimeZoneReference({
  timezone,
  guestTimeZone,
}: {
  timezone: string;
  guestTimeZone: string;
}) {
  if (timezone === guestTimeZone) {
    return null;
  }

  return <p className="text-sm text-muted-foreground">Часовой пояс владельца: {timezone}.</p>;
}

function BookingError({ state }: { state: BookingFormState }) {
  if (state.status !== "error") {
    return null;
  }

  return (
    <p className="text-sm text-muted-foreground" role="alert">
      {state.message}
    </p>
  );
}

function CalendarDayCell({
  day,
  active,
  maxCount,
  onSelect,
}: {
  day: BookingCalendarDay | null;
  active: boolean;
  maxCount: number;
  onSelect?: (dayKey: string) => void;
}) {
  if (day === null) {
    return <span aria-hidden="true" className="py-1" />;
  }

  if (day.slots.length === 0) {
    return (
      <span className="py-1 text-muted-foreground">
        <span aria-hidden="true">{day.dayNumber}</span>
        <span className="sr-only">{day.label}: нет слотов</span>
      </span>
    );
  }

  return (
    <PressableButton
      ariaLabel={`Выбрать ${day.label}, ${slotCountLabel(day.slots.length)}`}
      base="justify-self-center rounded-md"
      onPress={() => onSelect?.(day.key)}
      pressed={active}
      size="px-2 py-1"
    >
      <span className="grid justify-items-center">
        {day.dayNumber}
        <SlotBar active={active} count={day.slots.length} maxCount={maxCount} />
      </span>
    </PressableButton>
  );
}

function BookingCalendarNav({
  calendar,
  activeDayKey,
  onSelectDay,
}: {
  calendar: BookingCalendar;
  activeDayKey: string;
  onSelectDay?: (dayKey: string) => void;
}) {
  const maxCount = calendar.weeks
    .flat()
    .reduce((max, day) => Math.max(max, day?.slots.length ?? 0), 0);

  return (
    <nav aria-label="Дни бронирования">
      <h2 className="flex h-8 items-center text-lg font-semibold capitalize">
        {calendar.months.join(" / ")}
      </h2>
      <div className="grid h-8 items-center grid-cols-7 text-center text-xs text-muted-foreground">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      {calendar.weeks.map((week, weekIndex) => (
        <div className="mt-2 grid grid-cols-7 text-center text-sm" key={weekIndex}>
          {week.map((day, dayIndex) => (
            <CalendarDayCell
              active={day?.key === activeDayKey}
              day={day}
              key={day === null ? `empty-${weekIndex}-${dayIndex}` : day.key}
              maxCount={maxCount}
              onSelect={onSelectDay}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}

function SlotOption({
  slot,
  selected,
  guestTimeZone,
  onSelect,
}: {
  slot: Slot;
  selected: boolean;
  guestTimeZone: string;
  onSelect?: (slot: Slot) => void;
}) {
  return (
    <li>
      <PressableButton
        base="rounded-md border border-border"
        onPress={() => onSelect?.(slot)}
        pressed={selected}
        size="px-3 py-2 text-sm"
      >
        {formatSlotTime(slot.startAt, guestTimeZone)}
      </PressableButton>
    </li>
  );
}

function DaySlots({
  heading,
  day,
  guestTimeZone,
  selection,
  onSelectSlot,
  onSubmit,
}: {
  heading: string;
  day: BookingCalendarDay;
  guestTimeZone: string;
  selection: GuestSelection;
  onSelectSlot?: (slot: Slot) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section aria-label="Свободные слоты">
      <h2 className="flex h-8 items-center text-lg font-semibold capitalize">{heading}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {day.slots.map((slot) => (
          <SlotOption
            guestTimeZone={guestTimeZone}
            key={slot.startAt.toISOString()}
            onSelect={onSelectSlot}
            selected={isSlotSelected(selection, slot)}
            slot={slot}
          />
        ))}
      </ul>
      {selection.selectedSlot ? (
        <BookingForm
          guestTimeZone={guestTimeZone}
          onSubmit={onSubmit}
          slot={selection.selectedSlot}
          state={selection.form}
        />
      ) : null}
    </section>
  );
}

function SlotsContent({ props }: { props: ReadyProps }) {
  if (props.selection.form.status === "success") {
    return (
      <div className="mt-6 space-y-6">
        <TimeZoneReference timezone={props.timezone} guestTimeZone={props.guestTimeZone} />
        <SuccessContent
          booking={props.selection.form.booking}
          guestTimeZone={props.guestTimeZone}
        />
      </div>
    );
  }

  const calendar = buildBookingCalendar(
    props.windowStart,
    props.windowEnd,
    props.slots,
    props.guestTimeZone,
  );
  const shownDay = activeDay(props.selection, calendar);
  const activeStart = shownDay?.slots.at(0)?.startAt;

  return (
    <div className="mt-6 space-y-6">
      <TimeZoneReference timezone={props.timezone} guestTimeZone={props.guestTimeZone} />
      <BookingError state={props.selection.form} />
      {shownDay === undefined || activeStart === undefined ? (
        <p className="text-muted-foreground">Нет свободных слотов в ближайшие 14 дней.</p>
      ) : (
        <div className="grid items-start gap-6 md:grid-cols-[auto_1fr]">
          <BookingCalendarNav
            activeDayKey={shownDay.key}
            calendar={calendar}
            onSelectDay={props.onSelectDay}
          />
          <DaySlots
            day={shownDay}
            guestTimeZone={props.guestTimeZone}
            heading={formatSlotDay(activeStart, props.guestTimeZone)}
            onSelectSlot={props.onSelectSlot}
            onSubmit={props.onSubmit}
            selection={props.selection}
          />
        </div>
      )}
    </div>
  );
}

const getBookingSlotsContent = (props: BookingSlotsViewProps) => {
  switch (props.status) {
    case "loading":
      return <p className="mt-6 text-muted-foreground">Загрузка...</p>;
    case "error":
      return <p className="mt-6 text-muted-foreground">{props.message}</p>;
    case "ready":
      return <SlotsContent props={props} />;
  }
};

export function BookingSlotsView(props: BookingSlotsViewProps) {
  return (
    <Page>
      <h1 className="text-2xl font-bold">Выбор времени</h1>
      <MeetingTypeHeading meetingType={props.meetingType} />
      {getBookingSlotsContent(props)}
      <Link className="mt-6 inline-block underline" to="/">
        Назад к списку типов встреч
      </Link>
    </Page>
  );
}
