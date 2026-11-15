import type { Slot } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import {
  buildCalendarWeeks,
  formatSlotTime,
  groupSlotsByDay,
  type CalendarDay,
} from "../lib/slots";

function slot(startAt: string, minutes: number): Slot {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);

  return { startAt: start, endAt: end };
}

function days(weeks: ReturnType<typeof buildCalendarWeeks>): CalendarDay[] {
  return weeks.flatMap((week) => week.days.filter((day): day is CalendarDay => day !== null));
}

describe("guest slot formatting", () => {
  it("groups slots by the guest calendar day", () => {
    const slots = [slot("2026-01-05T16:00:00Z", 15), slot("2026-01-05T07:00:00Z", 15)];

    const groups = groupSlotsByDay(slots, "Asia/Tokyo");

    expect(groups.map((group) => group.key)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(groups.map((group) => group.slots.length)).toEqual([1, 1]);
    expect(groups.at(0)?.heading).toBe("понедельник, 5 января");
    expect(groups.at(1)?.heading).toBe("вторник, 6 января");
  });

  it("sorts slots inside a day by start instant", () => {
    const slots = [
      slot("2026-01-05T10:00:00Z", 30),
      slot("2026-01-05T07:00:00Z", 15),
      slot("2026-01-05T08:30:00Z", 45),
    ];

    const groups = groupSlotsByDay(slots, "Europe/Moscow");
    const starts = groups.at(0)?.slots.map((item) => item.startAt.toISOString());

    expect(starts).toEqual([
      "2026-01-05T07:00:00.000Z",
      "2026-01-05T08:30:00.000Z",
      "2026-01-05T10:00:00.000Z",
    ]);
  });

  it("formats a start in the requested zone", () => {
    const date = new Date("2026-01-05T07:00:00Z");

    expect(formatSlotTime(date, "Asia/Tokyo")).toBe("16:00");
    expect(formatSlotTime(date, "Europe/Moscow")).toBe("10:00");
  });
});

describe("guest calendar", () => {
  it("builds Monday-first weeks only for the booking window", () => {
    const weeks = buildCalendarWeeks({
      slots: [],
      guestTimeZone: "UTC",
      ownerTimeZone: "UTC",
      windowStart: new Date("2026-01-05T00:00:00Z"),
      windowEnd: new Date("2026-01-19T00:00:00Z"),
    });
    const calendarDays = days(weeks);

    expect(weeks).toHaveLength(2);
    expect(weeks.at(0)?.days.map((day) => day?.key)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
      "2026-01-11",
    ]);
    expect(calendarDays.at(0)?.key).toBe("2026-01-05");
    expect(calendarDays.at(-1)?.key).toBe("2026-01-18");
  });

  it("leaves days outside a partial first and last week empty", () => {
    const weeks = buildCalendarWeeks({
      slots: [],
      guestTimeZone: "UTC",
      ownerTimeZone: "UTC",
      windowStart: new Date("2026-01-07T00:00:00Z"),
      windowEnd: new Date("2026-01-21T00:00:00Z"),
    });

    expect(weeks).toHaveLength(3);
    expect(weeks.at(0)?.days.slice(0, 2)).toEqual([null, null]);
    expect(weeks.at(0)?.days.at(2)?.key).toBe("2026-01-07");
    expect(weeks.at(-1)?.days.at(1)?.key).toBe("2026-01-20");
    expect(weeks.at(-1)?.days.slice(2)).toEqual([null, null, null, null, null]);
  });

  it("shows free availability as a share of the day's start positions", () => {
    const slots = [
      slot("2026-01-05T10:00:00Z", 30),
      slot("2026-01-05T10:30:00Z", 30),
      slot("2026-01-06T10:00:00Z", 30),
      slot("2026-01-06T10:30:00Z", 30),
      slot("2026-01-06T11:00:00Z", 30),
      slot("2026-01-06T11:30:00Z", 30),
    ];
    const weeks = buildCalendarWeeks({
      slots,
      guestTimeZone: "UTC",
      ownerTimeZone: "UTC",
      windowStart: new Date("2026-01-05T00:00:00Z"),
      windowEnd: new Date("2026-01-19T00:00:00Z"),
    });
    const calendarDays = days(weeks);

    expect(calendarDays.at(0)?.availabilityPercent).toBe(50);
    expect(calendarDays.at(1)?.availabilityPercent).toBe(100);
    expect(calendarDays.at(5)?.freeCount).toBe(0);
    expect(calendarDays.at(5)?.availabilityPercent).toBeUndefined();
  });
});
