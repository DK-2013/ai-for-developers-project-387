import { describe, expect, it } from "vitest";
import { activeDay } from "../lib/booking-selection";
import { buildBookingCalendar } from "../lib/slots";

const guestTimeZone = "Asia/Tokyo";

const mondaySlot = {
  startAt: new Date("2026-01-05T07:00:00Z"),
  endAt: new Date("2026-01-05T07:15:00Z"),
};
const wednesdaySlot = {
  startAt: new Date("2026-01-07T10:00:00Z"),
  endAt: new Date("2026-01-07T10:15:00Z"),
};

const calendar = buildBookingCalendar(
  new Date("2026-01-04T21:00:00Z"),
  new Date("2026-01-18T21:00:00Z"),
  [mondaySlot, wednesdaySlot],
  guestTimeZone,
);

describe("guest selection", () => {
  it("shows the selected day in the calendar", () => {
    expect(activeDay(calendar, "2026-01-07")?.key).toBe("2026-01-07");
  });

  it("falls back to the first day with slots when no day is selected", () => {
    expect(activeDay(calendar)?.key).toBe("2026-01-05");
  });

  it("falls back when the selected day no longer has slots", () => {
    expect(activeDay(calendar, "2026-01-06")?.key).toBe("2026-01-05");
  });

  it("returns no day when the window has no slots", () => {
    const empty = buildBookingCalendar(
      new Date("2026-01-04T21:00:00Z"),
      new Date("2026-01-18T21:00:00Z"),
      [],
      guestTimeZone,
    );

    expect(activeDay(empty, "2026-01-05")).toBeUndefined();
  });
});
