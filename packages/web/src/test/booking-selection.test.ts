import type { Booking, Slot } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import {
  activeDay,
  initialSelection,
  isSlotSelected,
  reconcile,
  selectDay,
  selectSlot,
  submitFailed,
  submitStarted,
  submitSucceeded,
} from "../lib/booking-selection";
import { buildBookingCalendar, guestDayKey } from "../lib/slots";

const guestTimeZone = "Asia/Tokyo";

function slot(startAt: string, minutes = 15): Slot {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + minutes * 60_000);

  return { startAt: start, endAt: end };
}

const mondaySlot = slot("2026-01-05T07:00:00Z");
const mondayLaterSlot = slot("2026-01-05T07:15:00Z");
const wednesdaySlot = slot("2026-01-07T10:00:00Z");

const booking: Booking = {
  id: "00000000-0000-4000-8000-000000000010",
  meetingTypeId: "00000000-0000-4000-8000-000000000001",
  meetingTypeName: "Знакомство",
  startAt: mondaySlot.startAt,
  endAt: mondaySlot.endAt,
  attendeeName: "Гость",
  attendeeEmail: "guest@example.com",
};

const conflictMessage = "Это время уже занято. Пожалуйста, выберите другой слот.";

describe("guest selection", () => {
  it("starts idle without a slot or day", () => {
    const selection = initialSelection();

    expect(selection.selectedSlot).toBeUndefined();
    expect(selection.selectedDayKey).toBeUndefined();
    expect(selection.form).toEqual({ status: "idle" });
  });

  it("selects a slot together with its guest-local day key", () => {
    const selection = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    expect(selection.selectedSlot).toEqual(mondaySlot);
    expect(selection.selectedDayKey).toBe("2026-01-05");
  });

  it("keeps the slot selected when it is selected again", () => {
    const first = selectSlot(initialSelection(), mondaySlot, guestTimeZone);
    const second = selectSlot(first, mondaySlot, guestTimeZone);

    expect(second.selectedSlot).toEqual(mondaySlot);
    expect(second.selectedDayKey).toBe("2026-01-05");
  });

  it("clears a previous error when another slot is selected", () => {
    const errored = submitFailed(selectSlot(initialSelection(), mondaySlot, guestTimeZone), {
      reason: "rejected",
      message: "Проверьте имя.",
    });

    const selection = selectSlot(errored, mondayLaterSlot, guestTimeZone);

    expect(selection.form).toEqual({ status: "idle" });
  });

  it("keeps the slot when its own guest day is selected", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = selectDay(selected, "2026-01-05", guestTimeZone);

    expect(selection.selectedSlot).toEqual(mondaySlot);
    expect(selection.selectedDayKey).toBe("2026-01-05");
  });

  it("drops the slot when another guest day is selected", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = selectDay(selected, "2026-01-07", guestTimeZone);

    expect(selection.selectedSlot).toBeUndefined();
    expect(selection.selectedDayKey).toBe("2026-01-07");
    expect(selection.form).toEqual({ status: "idle" });
  });

  it("marks the form as submitting when the submit starts", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = submitStarted(selected);

    expect(selection.form).toEqual({ status: "submitting" });
    expect(selection.selectedSlot).toEqual(mondaySlot);
  });

  it("drops the slot and shows the message when the slot is taken", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = submitFailed(selected, {
      reason: "slot_taken",
      message: conflictMessage,
    });

    expect(selection.selectedSlot).toBeUndefined();
    expect(selection.selectedDayKey).toBe("2026-01-05");
    expect(selection.form).toEqual({ status: "error", message: conflictMessage });
  });

  it("keeps the slot when the server rejects the request", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = submitFailed(selected, {
      reason: "rejected",
      message: "Проверьте имя, e-mail и описание: сервер отклонил запрос.",
    });

    expect(selection.selectedSlot).toEqual(mondaySlot);
    expect(selection.form).toEqual({
      status: "error",
      message: "Проверьте имя, e-mail и описание: сервер отклонил запрос.",
    });
  });

  it("shows the booking and clears the slot when the submit succeeds", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = submitSucceeded(selected, booking);

    expect(selection.form).toEqual({ status: "success", booking });
    expect(selection.selectedSlot).toBeUndefined();
  });

  it("drops a slot that the refreshed slot list no longer offers", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = reconcile(selected, [mondayLaterSlot, wednesdaySlot], guestTimeZone);

    expect(selection.selectedSlot).toBeUndefined();
  });

  it("keeps a slot that the refreshed slot list still offers", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);

    const selection = reconcile(selected, [mondaySlot, wednesdaySlot], guestTimeZone);

    expect(selection.selectedSlot).toEqual(mondaySlot);
  });

  it("keeps the selected day and slot in agreement after a refresh", () => {
    const slotDayKey = guestDayKey(wednesdaySlot.startAt, guestTimeZone);
    const selected = selectSlot(initialSelection(), wednesdaySlot, guestTimeZone);
    const selection = reconcile(selected, [mondaySlot, wednesdaySlot], guestTimeZone);

    expect(selected.selectedDayKey).toBe(slotDayKey);
    expect(selection.selectedSlot).toEqual(wednesdaySlot);
    expect(selection.selectedDayKey).toBe(slotDayKey);
  });

  it("drops a day that no slot falls on in the refreshed slot list", () => {
    const selected = selectDay(initialSelection(), "2026-01-07", guestTimeZone);

    const selection = reconcile(selected, [mondaySlot], guestTimeZone);

    expect(selection.selectedDayKey).toBeUndefined();
  });

  it("keeps the conflict message when the slot list is refetched right after it", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);
    const conflicted = submitFailed(selected, {
      reason: "slot_taken",
      message: conflictMessage,
    });

    const selection = reconcile(conflicted, [mondayLaterSlot, wednesdaySlot], guestTimeZone);

    expect(selection.form).toEqual({ status: "error", message: conflictMessage });
    expect(selection.selectedSlot).toBeUndefined();
  });

  it("compares slots by start instant", () => {
    const selected = selectSlot(initialSelection(), mondaySlot, guestTimeZone);
    const sameStart: Slot = {
      startAt: new Date(mondaySlot.startAt),
      endAt: new Date(mondaySlot.endAt),
    };

    expect(isSlotSelected(selected, sameStart)).toBe(true);
    expect(isSlotSelected(selected, mondayLaterSlot)).toBe(false);
  });

  it("shows the selected day in the calendar", () => {
    const calendar = buildBookingCalendar(
      new Date("2026-01-04T21:00:00Z"),
      new Date("2026-01-18T21:00:00Z"),
      [mondaySlot, wednesdaySlot],
      guestTimeZone,
    );
    const selected = selectSlot(initialSelection(), wednesdaySlot, guestTimeZone);

    const day = activeDay(selected, calendar);

    expect(day?.key).toBe("2026-01-07");
  });

  it("falls back to the first day with slots when no day is selected", () => {
    const calendar = buildBookingCalendar(
      new Date("2026-01-04T21:00:00Z"),
      new Date("2026-01-18T21:00:00Z"),
      [wednesdaySlot],
      guestTimeZone,
    );

    const day = activeDay(initialSelection(), calendar);

    expect(day?.key).toBe("2026-01-07");
  });
});
