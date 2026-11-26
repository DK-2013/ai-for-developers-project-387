import type { Slot } from "@calendar/sdk";

const utcInstant = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

function matchesInstant(rawStartAt: string, instant: Date): boolean {
  const match = utcInstant.exec(rawStartAt);
  if (match === null) {
    return false;
  }

  const iso = instant.toISOString();
  const fraction = match[2] ?? "";
  const milliseconds = fraction.padEnd(3, "0").slice(0, 3);

  return (
    match[1] === iso.slice(0, 19) &&
    milliseconds === iso.slice(20, 23) &&
    /^0*$/.test(fraction.slice(3))
  );
}

export const START_AT_PARAM = "startAt";
export const INVALID_START_NOTICE = "invalid-start";
export const INVALID_START_MESSAGE =
  "Выбранное время недоступно. Пожалуйста, выберите другое время.";

export function noticePath(bookingPath: string, notice: string): string {
  return `${bookingPath}?notice=${encodeURIComponent(notice)}`;
}

export type StartAtLookup = { status: "invalid" } | { status: "found"; slot: Slot };

/** Finds the offered slot that matches the instant carried by the details address. */
export function findSlotByStartAt(
  rawStartAt: string | null,
  slots: readonly Slot[],
): StartAtLookup {
  if (rawStartAt === null) {
    return { status: "invalid" };
  }

  const slot = slots.find((candidate) => matchesInstant(rawStartAt, candidate.startAt));

  return slot === undefined ? { status: "invalid" } : { status: "found", slot };
}

/** The only value passed between the two guest steps is the start instant. */
export function detailsHref(bookingPath: string, slot: Slot): string {
  return `${bookingPath}/details?startAt=${encodeURIComponent(slot.startAt.toISOString())}`;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function normalizeDescription(value: string): string | undefined {
  return value.trim() === "" ? undefined : value;
}
