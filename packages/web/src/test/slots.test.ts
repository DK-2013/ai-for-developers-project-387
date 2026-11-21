import { describe, expect, it } from "vitest";
import { formatSlotTime, guestDayKey } from "../lib/slots";

describe("guest slot formatting", () => {
  it("formats a start in the requested zone", () => {
    const date = new Date("2026-01-05T07:00:00Z");

    expect(formatSlotTime(date, "Asia/Tokyo")).toBe("16:00");
    expect(formatSlotTime(date, "Europe/Moscow")).toBe("10:00");
  });

  it("builds the guest-local calendar day key for an instant", () => {
    const date = new Date("2026-01-05T07:00:00Z");

    expect(guestDayKey(date, "Asia/Tokyo")).toBe("2026-01-05");
    expect(guestDayKey(date, "Europe/Moscow")).toBe("2026-01-05");
  });
});
