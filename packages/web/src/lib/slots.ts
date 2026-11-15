import type { Slot } from "@calendar/sdk";

type SlotDayGroup = {
  key: string;
  heading: string;
  slots: Slot[];
};

export type CalendarDay = {
  key: string;
  heading: string;
  dayOfMonth: number;
  slots: Slot[];
  freeCount: number;
  availabilityPercent?: number;
};

export type CalendarWeek = {
  key: string;
  days: (CalendarDay | null)[];
};

export const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

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

const timeFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function dateKey(date: Date, format: Intl.DateTimeFormat): string {
  const parts = format.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * Groups slots by the guest's calendar day. The owner's zone fixes the grid;
 * only the displayed day and time follow the guest's zone.
 */
export function groupSlotsByDay(slots: readonly Slot[], timeZone: string): SlotDayGroup[] {
  const keyFormat = dateKeyFormat(timeZone);
  const headingFormat = dayFormat(timeZone);
  const groups = new Map<string, Slot[]>();

  for (const slot of slots) {
    const key = dateKey(slot.startAt, keyFormat);
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, [slot]);
    } else {
      group.push(slot);
    }
  }

  return [...groups.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, groupSlots]) => {
      const sorted = groupSlots.toSorted(
        (left, right) => left.startAt.getTime() - right.startAt.getTime(),
      );
      const first = sorted.at(0);

      if (first === undefined) {
        throw new Error("Group slots: empty group");
      }

      return { key, heading: headingFormat.format(first.startAt), slots: sorted };
    });
}

function civilDate(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

/** Monday-first index: 0 is Monday and 6 is Sunday. */
function weekdayIndex(key: string): number {
  return (civilDate(key).getUTCDay() + 6) % 7;
}

function enumerateDayKeys(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  let key = startKey;

  while (key <= endKey) {
    keys.push(key);
    key = addDays(key, 1);
  }

  return keys;
}

const ownerClockFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

export type BuildCalendarInput = {
  slots: readonly Slot[];
  guestTimeZone: string;
  ownerTimeZone: string;
  windowStart?: Date;
  windowEnd?: Date;
};

/**
 * Builds Monday-first calendar weeks for the days that intersect the booking
 * window. The API returns only free starts, so the total number of starts in a
 * working day is reconstructed from the distinct owner-local clock positions
 * seen across the window. Each free day then shows the share still available.
 */
export function buildCalendarWeeks(input: BuildCalendarInput): CalendarWeek[] {
  const { slots, guestTimeZone, ownerTimeZone, windowStart, windowEnd } = input;
  const groups = groupSlotsByDay(slots, guestTimeZone);
  const groupsByKey = new Map(groups.map((group) => [group.key, group]));
  const keyFormat = dateKeyFormat(guestTimeZone);

  const startKey = windowStart === undefined ? groups.at(0)?.key : dateKey(windowStart, keyFormat);
  const endKey =
    windowEnd === undefined
      ? groups.at(-1)?.key
      : dateKey(new Date(windowEnd.getTime() - 1), keyFormat);

  if (startKey === undefined || endKey === undefined) {
    return [];
  }

  const dayKeys = enumerateDayKeys(
    startKey <= endKey ? startKey : endKey,
    startKey <= endKey ? endKey : startKey,
  );
  const clockFormat = ownerClockFormat(ownerTimeZone);
  const startPositions = new Set(slots.map((slot) => clockFormat.format(slot.startAt)));
  const totalStarts = startPositions.size;
  const daysByKey = new Map<string, CalendarDay>();

  for (const key of dayKeys) {
    const group = groupsByKey.get(key);
    const daySlots = group?.slots ?? [];
    const freeCount = daySlots.length;
    const day: CalendarDay = {
      key,
      heading: group?.heading ?? dayFormat("UTC").format(civilDate(key)),
      dayOfMonth: Number.parseInt(key.slice(8), 10),
      slots: daySlots,
      freeCount,
    };

    if (freeCount > 0 && totalStarts > 0) {
      day.availabilityPercent = Math.min(100, Math.round((freeCount / totalStarts) * 100));
    }

    daysByKey.set(key, day);
  }

  const firstKey = dayKeys[0];
  const lastKey = dayKeys.at(-1);

  if (firstKey === undefined || lastKey === undefined) {
    return [];
  }

  const firstMonday = addDays(firstKey, -weekdayIndex(firstKey));
  const lastSunday = addDays(lastKey, 6 - weekdayIndex(lastKey));
  const weeks: CalendarWeek[] = [];

  for (let weekKey = firstMonday; weekKey <= lastSunday; weekKey = addDays(weekKey, 7)) {
    const days: (CalendarDay | null)[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      days.push(daysByKey.get(addDays(weekKey, offset)) ?? null);
    }

    weeks.push({ key: weekKey, days });
  }

  return weeks;
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
