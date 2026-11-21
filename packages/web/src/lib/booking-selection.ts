import type { Booking, Slot } from "@calendar/sdk";
import { type BookingCalendar, type BookingCalendarDay, guestDayKey } from "./slots";

export type BookingFormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; booking: Booking }
  | { status: "error"; message: string };

export type GuestSelection = {
  selectedSlot?: Slot;
  selectedDayKey?: string;
  form: BookingFormState;
};

export type SubmitFailure =
  | { reason: "slot_taken"; message: string }
  | { reason: "rejected"; message: string };

export function initialSelection(): GuestSelection {
  return { form: { status: "idle" } };
}

/**
 * Selects a slot and pins the guest-local day it belongs to. Selecting a slot is
 * a fresh start, so any earlier form error goes away.
 */
export function selectSlot(
  selection: GuestSelection,
  slot: Slot,
  guestTimeZone: string,
): GuestSelection {
  return {
    selectedSlot: slot,
    selectedDayKey: guestDayKey(slot.startAt, guestTimeZone),
    form: { status: "idle" },
  };
}

/**
 * Selects a day. The selected slot always belongs to the selected day, so a slot
 * on another day is dropped together with its pending error.
 */
export function selectDay(
  selection: GuestSelection,
  dayKey: string,
  guestTimeZone: string,
): GuestSelection {
  const slot = selection.selectedSlot;

  if (slot !== undefined && guestDayKey(slot.startAt, guestTimeZone) !== dayKey) {
    return { selectedDayKey: dayKey, form: { status: "idle" } };
  }

  return { ...selection, selectedDayKey: dayKey };
}

function withoutSelectedSlot(selection: GuestSelection): GuestSelection {
  const next: GuestSelection = { form: selection.form };

  if (selection.selectedDayKey !== undefined) {
    next.selectedDayKey = selection.selectedDayKey;
  }

  return next;
}

export function submitStarted(selection: GuestSelection): GuestSelection {
  return { ...selection, form: { status: "submitting" } };
}

/**
 * Records a failed submit. A taken slot is gone, so the guest has to pick
 * another one; a rejected request keeps the slot so the form can be corrected.
 */
export function submitFailed(selection: GuestSelection, failure: SubmitFailure): GuestSelection {
  const form: BookingFormState = { status: "error", message: failure.message };

  if (failure.reason === "slot_taken") {
    return { ...withoutSelectedSlot(selection), form };
  }

  return { ...selection, form };
}

export function submitSucceeded(selection: GuestSelection, booking: Booking): GuestSelection {
  return { ...withoutSelectedSlot(selection), form: { status: "success", booking } };
}

/**
 * Reconciles the selection with a refreshed slot list. Stale slots and days are
 * dropped, but the form is never touched: a conflict message must survive the
 * refetch that follows it.
 */
export function reconcile(
  selection: GuestSelection,
  slots: readonly Slot[],
  guestTimeZone: string,
): GuestSelection {
  const startTimes = new Set<number>();
  const dayKeys = new Set<string>();

  for (const slot of slots) {
    startTimes.add(slot.startAt.getTime());
    dayKeys.add(guestDayKey(slot.startAt, guestTimeZone));
  }

  const next: GuestSelection = { form: selection.form };
  const selectedSlot = selection.selectedSlot;
  const selectedDayKey = selection.selectedDayKey;

  if (selectedSlot !== undefined && startTimes.has(selectedSlot.startAt.getTime())) {
    next.selectedSlot = selectedSlot;
  }

  if (selectedDayKey !== undefined && dayKeys.has(selectedDayKey)) {
    next.selectedDayKey = selectedDayKey;
  }

  return next;
}

/** The day whose slots are shown: the selected day, then the first day with slots. */
export function activeDay(
  selection: GuestSelection,
  calendar: BookingCalendar,
): BookingCalendarDay | undefined {
  const days = calendar.weeks
    .flat()
    .filter((day): day is BookingCalendarDay => day !== null && day.slots.length > 0);
  const selectedKey = selection.selectedDayKey;

  if (selectedKey !== undefined) {
    const day = days.find((candidate) => candidate.key === selectedKey);

    if (day !== undefined) {
      return day;
    }
  }

  return days.at(0);
}

export function isSlotSelected(selection: GuestSelection, slot: Slot): boolean {
  return selection.selectedSlot?.startAt.getTime() === slot.startAt.getTime();
}
