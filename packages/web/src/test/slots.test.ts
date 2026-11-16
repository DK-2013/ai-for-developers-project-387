import type { Slot } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import {
  buildWindowDay,
  formatSlotTime,
  getWindowDayKeys,
  getWindowDays,
  groupSlotsByDay,
  slotDayKey,
  splitDaysIntoWeeks,
} from "../lib/slots";

function slot(startAt: string, minutes: number): Slot {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);

  return { startAt: start, endAt: end };
}

describe("guest slot formatting", () => {
  it("computes slot day key in guest time zone", () => {
    expect(slotDayKey(new Date("2026-01-05T16:00:00Z"), "Asia/Tokyo")).toBe("2026-01-06");
    expect(slotDayKey(new Date("2026-01-05T16:00:00Z"), "Europe/Moscow")).toBe("2026-01-05");
  });

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

  it("lists window days in order and keeps month boundary days reachable", () => {
    const keys = getWindowDayKeys(
      new Date("2026-03-31T00:00:00Z"),
      new Date("2026-04-03T00:00:00Z"),
      "UTC",
    );

    expect(keys).toEqual(["2026-03-31", "2026-04-01", "2026-04-02"]);
  });

  it("builds window day labels and unambiguous dates across month boundary and leap February", () => {
    const march = buildWindowDay("2026-03-31", "UTC");
    const april = buildWindowDay("2026-04-01", "UTC");
    const leap = buildWindowDay("2028-02-29", "UTC");

    expect(march.weekdayLabel).toBe("Вт");
    expect(april.weekdayLabel).toBe("Ср");
    expect(march.dateLabel).not.toBe(april.dateLabel);
    expect(march.dateLabel).toContain("31");
    expect(april.dateLabel).toContain("1");
    expect(leap.dateLabel).toContain("29");
    expect(leap.heading).toContain("29");
  });

  it("splits window days into Monday-first weeks with empty edge cells", () => {
    const days = getWindowDays(
      new Date("2026-04-01T00:00:00Z"),
      new Date("2026-04-04T00:00:00Z"),
      "UTC",
    );
    const weeks = splitDaysIntoWeeks(days);

    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.map((cell) => (cell.kind === "day" ? cell.day.key : "empty"))).toEqual([
      "empty",
      "empty",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "empty",
      "empty",
    ]);
  });
});
