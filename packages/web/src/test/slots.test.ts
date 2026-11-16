import type { Slot } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import { buildBookingCalendar, dayKey, formatSlotTime } from "../lib/slots";

function slot(startAt: string, minutes: number): Slot {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);

  return { startAt: start, endAt: end };
}

describe("guest slot calendar", () => {
  it("keys a day in the requested zone", () => {
    const lateUtc = new Date("2026-01-05T23:30:00Z");

    expect(dayKey(lateUtc, "Asia/Tokyo")).toBe("2026-01-06");
    expect(dayKey(lateUtc, "Europe/Moscow")).toBe("2026-01-06");
  });

  it("lists every day of the window in order, including days without slots", () => {
    const calendar = buildBookingCalendar(
      [],
      new Date("2026-01-04T21:00:00Z"),
      new Date("2026-01-18T21:00:00Z"),
      "Europe/Moscow",
    );
    const keys = calendar.days.map((day) => day.key);

    expect(keys).toHaveLength(14);
    expect(keys.at(0)).toBe("2026-01-05");
    expect(keys.at(-1)).toBe("2026-01-18");
    expect(calendar.days.at(0)?.weekday).toBe("пн");
    expect(calendar.days.at(-1)?.weekday).toBe("вс");
  });

  it("groups days into Monday-Sunday weeks with empty cells outside the window", () => {
    const calendar = buildBookingCalendar(
      [],
      new Date("2026-01-07T00:00:00Z"),
      new Date("2026-01-14T00:00:00Z"),
      "UTC",
    );

    expect(calendar.weeks).toHaveLength(2);
    expect(calendar.weeks[0]?.days.slice(0, 2)).toEqual([undefined, undefined]);
    expect(calendar.weeks[0]?.days[2]?.key).toBe("2026-01-07");
    expect(calendar.weeks[0]?.days[6]?.key).toBe("2026-01-11");
    expect(calendar.weeks[1]?.days[0]?.key).toBe("2026-01-12");
    expect(calendar.weeks[1]?.days[1]?.key).toBe("2026-01-13");
    expect(calendar.weeks[1]?.days.slice(2)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("labels dates across a month boundary and through leap February", () => {
    const calendar = buildBookingCalendar(
      [],
      new Date("2028-02-27T00:00:00Z"),
      new Date("2028-03-03T00:00:00Z"),
      "UTC",
    );
    const labels = new Map(calendar.days.map((day) => [day.key, day.dateLabel]));

    expect(labels.get("2028-02-27")).toBe("27 февр");
    expect(labels.get("2028-02-29")).toBe("29 февр");
    expect(labels.get("2028-03-01")).toBe("1 мар");
    expect(labels.get("2028-03-02")).toBe("2 мар");
  });

  it("assigns slots to guest-local days and sorts them by start instant", () => {
    const slots = [
      slot("2026-01-05T16:00:00Z", 15),
      slot("2026-01-05T10:00:00Z", 30),
      slot("2026-01-05T07:00:00Z", 15),
    ];

    const calendar = buildBookingCalendar(
      slots,
      new Date("2026-01-04T21:00:00Z"),
      new Date("2026-01-18T21:00:00Z"),
      "Asia/Tokyo",
    );
    const firstDay = calendar.days.find((day) => day.key === "2026-01-05");
    const secondDay = calendar.days.find((day) => day.key === "2026-01-06");

    expect(firstDay?.slots.map((item) => item.startAt.toISOString())).toEqual([
      "2026-01-05T07:00:00.000Z",
      "2026-01-05T10:00:00.000Z",
    ]);
    expect(secondDay?.slots.map((item) => item.startAt.toISOString())).toEqual([
      "2026-01-05T16:00:00.000Z",
    ]);
  });

  it("formats a start in the requested zone", () => {
    const date = new Date("2026-01-05T07:00:00Z");

    expect(formatSlotTime(date, "Asia/Tokyo")).toBe("16:00");
    expect(formatSlotTime(date, "Europe/Moscow")).toBe("10:00");
  });
});
