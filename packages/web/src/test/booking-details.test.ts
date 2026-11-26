import type { Slot } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import {
  codePointLength,
  detailsHref,
  findSlotByStartAt,
  normalizeDescription,
} from "../lib/booking-details";

const slot: Slot = {
  startAt: new Date("2026-01-05T07:00:00Z"),
  endAt: new Date("2026-01-05T07:15:00Z"),
};

describe("booking details helpers", () => {
  it("finds the slot by the exact UTC instant from the address", () => {
    const result = findSlotByStartAt("2026-01-05T07:00:00Z", [slot]);

    expect(result).toEqual({ status: "found", slot });
  });

  it("finds the slot when the UTC instant has no fractional part", () => {
    const result = findSlotByStartAt("2026-01-05T07:00:00.000Z", [slot]);

    expect(result).toEqual({ status: "found", slot });
  });

  it("rejects a fractional instant that is not the offered instant", () => {
    const result = findSlotByStartAt("2026-01-05T07:00:00.0001Z", [slot]);

    expect(result).toEqual({ status: "invalid" });
  });

  it("rejects an instant written with an offset", () => {
    const result = findSlotByStartAt("2026-01-05T16:00:00+09:00", [slot]);

    expect(result).toEqual({ status: "invalid" });
  });

  it("rejects a missing instant", () => {
    expect(findSlotByStartAt(null, [slot])).toEqual({ status: "invalid" });
  });

  it("rejects a local date", () => {
    expect(findSlotByStartAt("05.01.2026", [slot])).toEqual({ status: "invalid" });
  });

  it("rejects a date without a time", () => {
    expect(findSlotByStartAt("2026-01-05", [slot])).toEqual({ status: "invalid" });
  });

  it("rejects a calendar-invalid instant", () => {
    expect(findSlotByStartAt("2026-02-30T07:00:00Z", [slot])).toEqual({ status: "invalid" });
  });

  it("rejects an instant that is no longer offered", () => {
    const result = findSlotByStartAt("2026-01-05T07:15:00Z", [slot]);

    expect(result).toEqual({ status: "invalid" });
  });

  it("puts only the start instant in the details address", () => {
    expect(detailsHref("/book/intro", slot)).toBe(
      "/book/intro/details?startAt=2026-01-05T07%3A00%3A00.000Z",
    );
  });

  it("counts description length in code points, not UTF-16 units", () => {
    expect(codePointLength("😀".repeat(999))).toBe(999);
    expect(codePointLength("😀".repeat(1000))).toBe(1000);
    expect(codePointLength("😀".repeat(1001))).toBe(1001);
  });

  it("treats an empty or whitespace-only description as absent", () => {
    expect(normalizeDescription("")).toBeUndefined();
    expect(normalizeDescription("  \n\t ")).toBeUndefined();
  });

  it("keeps a description that has content, including its line breaks", () => {
    const description = " Уточнить график\nПрислать документы ";

    expect(normalizeDescription(description)).toBe(description);
  });
});
