import type { Slot } from "@calendar/sdk";

export type BookingDay = {
  key: string;
  weekday: string;
  dateLabel: string;
  heading: string;
  slots: Slot[];
};

export type BookingWeek = {
  key: string;
  days: readonly (BookingDay | undefined)[];
};

export type BookingCalendar = {
  days: readonly BookingDay[];
  weeks: readonly BookingWeek[];
};

export const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;
const DAYS_IN_WEEK = 7;

const dateKeyFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const dayFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const shortDateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

const timeFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? "";
}

/** The guest-local calendar day key (`YYYY-MM-DD`) for an instant. */
export function dayKey(date: Date, timeZone: string): string {
  const parts = dateKeyFormat(timeZone).formatToParts(date);

  return `${part(parts, "year")}-${part(parts, "month")}-${part(parts, "day")}`;
}

function keyToUtcDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid day key: ${key}`);
  }

  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDays(key: string, days: number): string {
  const date = keyToUtcDate(key);
  date.setUTCDate(date.getUTCDate() + days);

  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function weekdayIndex(key: string): number {
  return (keyToUtcDate(key).getUTCDay() + 6) % DAYS_IN_WEEK;
}

function dateLabel(key: string): string {
  const parts = shortDateFormat.formatToParts(keyToUtcDate(key));
  const month = part(parts, "month").replace(/\.$/, "");

  return `${part(parts, "day")} ${month}`;
}

function dayHeading(key: string): string {
  return dayFormat("UTC").format(keyToUtcDate(key));
}

/**
 * Builds the guest-facing day calendar for the booking window. Days come from
 * the window's instants in the guest zone; days without free slots stay in the
 * calendar but carry an empty slot list. Weeks always run Monday to Sunday, and
 * cells outside the window stay undefined.
 */
export function buildBookingCalendar(
  slots: readonly Slot[],
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
): BookingCalendar {
  const keys = new Set<string>();
  const endKey = dayKey(windowEnd, timeZone);

  for (let key = dayKey(windowStart, timeZone); key < endKey; key = addDays(key, 1)) {
    keys.add(key);
  }

  const slotsByDay = new Map<string, Slot[]>();

  for (const slot of slots) {
    const key = dayKey(slot.startAt, timeZone);
    keys.add(key);

    const daySlots = slotsByDay.get(key);

    if (daySlots === undefined) {
      slotsByDay.set(key, [slot]);
    } else {
      daySlots.push(slot);
    }
  }

  const days = [...keys]
    .toSorted((left, right) => left.localeCompare(right))
    .map((key) => {
      const daySlots = slotsByDay.get(key) ?? [];
      const index = weekdayIndex(key);

      return {
        key,
        weekday: WEEKDAY_LABELS[index] ?? "",
        dateLabel: dateLabel(key),
        heading: dayHeading(key),
        slots: daySlots.toSorted((left, right) => left.startAt.getTime() - right.startAt.getTime()),
      };
    });

  const weeks = new Map<string, (BookingDay | undefined)[]>();

  for (const day of days) {
    const index = weekdayIndex(day.key);
    const mondayKey = addDays(day.key, -index);
    const week =
      weeks.get(mondayKey) ?? Array<BookingDay | undefined>(DAYS_IN_WEEK).fill(undefined);

    week[index] = day;
    weeks.set(mondayKey, week);
  }

  return {
    days,
    weeks: [...weeks.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, weekDays]) => ({ key, days: weekDays })),
  };
}

/** Formats a slot's start in the guest's browser time zone. */
export function formatSlotTime(date: Date, timeZone: string): string {
  return timeFormat(timeZone).format(date);
}

/** Formats a slot's guest-local calendar day. */
export function formatSlotDay(date: Date, timeZone: string): string {
  return dayFormat(timeZone).format(date);
}

/** The browser's IANA time zone, falling back to UTC outside a browser. */
export function detectBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
