import type { Slot } from "@calendar/sdk";

type SlotDayGroup = {
  key: string;
  heading: string;
  slots: Slot[];
};

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

const utcKeyFormat = dateKeyFormat("UTC");

const shortDayFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "long",
});

const monthNameFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "UTC",
  month: "long",
});

export type BookingCalendarDay = {
  key: string;
  dayNumber: number;
  label: string;
  slots: Slot[];
};

export type BookingCalendar = {
  months: string[];
  weeks: (BookingCalendarDay | null)[][];
};

function dateKey(date: Date, format: Intl.DateTimeFormat): string {
  const parts = format.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** The guest's calendar-day key for an instant. */
export function guestDayKey(date: Date, timeZone: string): string {
  return dateKey(date, dateKeyFormat(timeZone));
}

function dayFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Invalid calendar day key: ${key}`);
  }

  return new Date(Date.UTC(year, month - 1, day, 12));
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

/**
 * Builds the Monday-to-Sunday calendar of guest-local dates in the booking window.
 * Dates are walked through UTC midday instants so zone offsets cannot shift a day.
 */
export function buildBookingCalendar(
  windowStart: Date,
  windowEnd: Date,
  slots: readonly Slot[],
  guestTimeZone: string,
): BookingCalendar {
  const windowKeyFormat = dateKeyFormat(guestTimeZone);
  const startKey = dateKey(windowStart, windowKeyFormat);
  const endKey = dateKey(new Date(windowEnd.getTime() - 1), windowKeyFormat);
  const slotsByKey = new Map(
    groupSlotsByDay(slots, guestTimeZone).map((group) => [group.key, group.slots]),
  );
  const months: string[] = [];
  const weeks: (BookingCalendarDay | null)[][] = [];
  let week: (BookingCalendarDay | null)[] = [];
  let cursor = dayFromKey(startKey);
  let currentMonth = "";

  while (dateKey(cursor, utcKeyFormat) <= endKey) {
    const key = dateKey(cursor, utcKeyFormat);
    const month = `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`;

    if (month !== currentMonth) {
      months.push(monthNameFormat.format(cursor));
      currentMonth = month;
    }

    const day: BookingCalendarDay = {
      key,
      dayNumber: cursor.getUTCDate(),
      label: shortDayFormat.format(cursor),
      slots: slotsByKey.get(key) ?? [],
    };
    const weekday = (cursor.getUTCDay() + 6) % 7;

    if (week.length === 0) {
      week = Array<BookingCalendarDay | null>(weekday).fill(null);
    }

    week.push(day);

    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }

    const next = new Date(cursor.getTime());
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next;
  }

  if (week.length > 0) {
    weeks.push([...week, ...Array<BookingCalendarDay | null>(7 - week.length).fill(null)]);
  }

  return { months, weeks };
}

/** Selects the day whose slots are shown: chosen slot, chosen day, then first with slots. */
export function resolveActiveDay(
  calendar: BookingCalendar,
  options: {
    guestTimeZone: string;
    selectedDayKey?: string;
    selectedSlot?: Slot;
  },
): BookingCalendarDay | undefined {
  const days = calendar.weeks
    .flat()
    .filter((day): day is BookingCalendarDay => day !== null && day.slots.length > 0);
  const slotKey = options.selectedSlot
    ? guestDayKey(options.selectedSlot.startAt, options.guestTimeZone)
    : undefined;

  for (const key of [slotKey, options.selectedDayKey]) {
    if (key === undefined) {
      continue;
    }

    const day = days.find((candidate) => candidate.key === key);

    if (day !== undefined) {
      return day;
    }
  }

  return days.at(0);
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
