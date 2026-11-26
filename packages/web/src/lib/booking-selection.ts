import type { BookingCalendar, BookingCalendarDay } from "./slots";

/** The day whose slots are shown: the selected day, then the first day with slots. */
export function activeDay(
  calendar: BookingCalendar,
  dayKey?: string,
): BookingCalendarDay | undefined {
  const days = calendar.weeks
    .flat()
    .filter((day): day is BookingCalendarDay => day !== null && day.slots.length > 0);

  if (dayKey !== undefined) {
    const day = days.find((candidate) => candidate.key === dayKey);

    if (day !== undefined) {
      return day;
    }
  }

  return days.at(0);
}
