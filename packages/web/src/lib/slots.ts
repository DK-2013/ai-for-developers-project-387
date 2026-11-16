import type { Slot } from "@calendar/sdk";

export type SlotDayGroup = {
  key: string;
  heading: string;
  slots: Slot[];
};

export type WindowDay = {
  key: string;
  date: Date;
  weekdayLabel: string;
  dateLabel: string;
  heading: string;
};

export type WeekCell = { kind: "day"; day: WindowDay } | { kind: "empty"; key: string };

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

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

const dateLabelFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    day: "numeric",
    month: "short",
  });

const weekdayIndexFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });

const weekdayShortToIndex: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const timeFormat = (timeZone: string): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

function partsMap(date: Date, format: Intl.DateTimeFormat): Record<string, string> {
  const parts = format.formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }
  return values;
}

function dateKey(date: Date, format: Intl.DateTimeFormat): string {
  const parts = partsMap(date, format);
  return `${parts["year"] ?? ""}-${parts["month"] ?? ""}-${parts["day"] ?? ""}`;
}

export function slotDayKey(date: Date, timeZone: string): string {
  return dateKey(date, dateKeyFormat(timeZone));
}

function weekdayIndex(date: Date, timeZone: string): number {
  const short = weekdayIndexFormat(timeZone).format(date);
  return weekdayShortToIndex[short] ?? 0;
}

function addDaysToKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns calendar day keys in [windowStart, windowEnd) for the given time zone, in order. */
export function getWindowDayKeys(
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
): string[] {
  const format = dateKeyFormat(timeZone);
  const startKey = dateKey(windowStart, format);
  const endKey = dateKey(windowEnd, format);
  const keys: string[] = [];
  let current = startKey;
  while (current < endKey) {
    keys.push(current);
    current = addDaysToKey(current, 1);
  }
  return keys;
}

function noonUtcForKey(key: string): Date {
  return new Date(`${key}T12:00:00Z`);
}

export function buildWindowDay(key: string, timeZone: string): WindowDay {
  const date = noonUtcForKey(key);
  const weekday = weekdayIndex(date, timeZone);
  return {
    key,
    date,
    weekdayLabel: WEEKDAY_LABELS[weekday] ?? "Пн",
    dateLabel: dateLabelFormat(timeZone).format(date),
    heading: dayFormat(timeZone).format(date),
  };
}

export function getWindowDays(
  windowStart: Date,
  windowEnd: Date,
  timeZone: string,
): WindowDay[] {
  return getWindowDayKeys(windowStart, windowEnd, timeZone).map((key) =>
    buildWindowDay(key, timeZone),
  );
}

export function splitDaysIntoWeeks(days: readonly WindowDay[]): WeekCell[][] {
  if (days.length === 0) {
    return [];
  }
  const first = days[0];
  if (first === undefined) {
    return [];
  }
  const firstIndex = weekdayIndex(first.date, "UTC");
  const cells: WeekCell[] = [];
  for (let i = 0; i < firstIndex; i += 1) {
    cells.push({ kind: "empty", key: `pad-start-${i}` });
  }
  for (const day of days) {
    cells.push({ kind: "day", day });
  }
  const remainder = cells.length % 7;
  if (remainder !== 0) {
    const pad = 7 - remainder;
    for (let i = 0; i < pad; i += 1) {
      cells.push({ kind: "empty", key: `pad-end-${i}` });
    }
  }
  const weeks: WeekCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

/** Groups slots by the guest's calendar day. */
export function groupSlotsByDay(slots: readonly Slot[], timeZone: string): SlotDayGroup[] {
  const headingFormat = dayFormat(timeZone);
  const groups = new Map<string, Slot[]>();

  for (const slot of slots) {
    const key = slotDayKey(slot.startAt, timeZone);
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
