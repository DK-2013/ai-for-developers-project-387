import type { MeetingType, Slot } from "@calendar/sdk";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { activeDay } from "../lib/booking-selection";
import {
  buildBookingCalendar,
  type BookingCalendar,
  type BookingCalendarDay,
  formatSlotDay,
  formatSlotTime,
} from "../lib/slots";

type MeetingTypeSummary = Pick<MeetingType, "name" | "durationMinutes">;

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
      slotHref: (slot: Slot) => string;
      activeDayKey?: string;
      notice?: string;
      onSelectDay?: (dayKey: string) => void;
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
  guestTimeZone,
  href,
}: {
  slot: Slot;
  guestTimeZone: string;
  href: string;
}) {
  return (
    <li>
      <Link className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" to={href}>
        {formatSlotTime(slot.startAt, guestTimeZone)}
      </Link>
    </li>
  );
}

function DaySlots({
  heading,
  day,
  guestTimeZone,
  slotHref,
}: {
  heading: string;
  day: BookingCalendarDay;
  guestTimeZone: string;
  slotHref: (slot: Slot) => string;
}) {
  return (
    <section aria-label="Свободные слоты">
      <h2 className="flex h-8 items-center text-lg font-semibold capitalize">{heading}</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {day.slots.map((slot) => (
          <SlotOption
            guestTimeZone={guestTimeZone}
            href={slotHref(slot)}
            key={slot.startAt.toISOString()}
            slot={slot}
          />
        ))}
      </ul>
    </section>
  );
}

function SlotsContent({ props }: { props: ReadyProps }) {
  const calendar = buildBookingCalendar(
    props.windowStart,
    props.windowEnd,
    props.slots,
    props.guestTimeZone,
  );
  const shownDay = activeDay(calendar, props.activeDayKey);
  const activeStart = shownDay?.slots.at(0)?.startAt;

  return (
    <div className="mt-6 space-y-6">
      <TimeZoneReference timezone={props.timezone} guestTimeZone={props.guestTimeZone} />
      {props.notice === undefined ? null : (
        <p className="text-sm" role="alert">
          {props.notice}
        </p>
      )}
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
            slotHref={props.slotHref}
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
