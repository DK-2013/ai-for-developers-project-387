import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createBookingRepository } from "../src/bookings/repository.js";
import {
  createBookingUseCases,
  MeetingTypeNotFoundError,
  SlotNotAvailableError,
  type BookingUseCases,
  type CreateBookingInput,
} from "../src/bookings/use-cases.js";
import { parseCreateBookingRequest } from "../src/bookings/validation.js";
import { parseConfig, type OwnerConfig } from "../src/config.js";
import type { SlotEngineResult } from "../src/domain/slots.js";
import { isOnSlotGrid } from "../src/domain/time/index.js";
import { createMeetingTypeRepository } from "../src/meeting-types/repository.js";
import { createSlotRepository } from "../src/slots/repository.js";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import {
  createBookingFixture,
  createMeetingTypeFixture,
  DEFAULT_MEETING_TYPE_ID,
} from "./helpers/fixtures.js";

const UNKNOWN_MEETING_TYPE_ID = "00000000-0000-4000-8000-000000000099";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_START = "2026-01-06T07:00:00Z";

let database: TestDatabase;
let now: Date;
let useCases: BookingUseCases;

function useCasesFor(owner: OwnerConfig = parseConfig({}).owner): BookingUseCases {
  return createBookingUseCases({
    meetingTypes: createMeetingTypeRepository(database.db),
    slots: createSlotRepository(database.db),
    bookings: createBookingRepository(database.db),
    owner,
    clock: () => now,
  });
}

function bookingInput(overrides: Partial<CreateBookingInput> = {}): CreateBookingInput {
  return {
    meetingTypeId: DEFAULT_MEETING_TYPE_ID,
    attendeeName: "Гость",
    attendeeEmail: "guest@example.com",
    startAt: Temporal.Instant.from(DEFAULT_START),
    ...overrides,
  };
}

function validatedBookingInput(overrides: Record<string, unknown> = {}): CreateBookingInput {
  const parsed = parseCreateBookingRequest({ ...bookingInput(), ...overrides });

  if (!parsed.ok) {
    throw new Error(`Expected a valid booking request: ${parsed.message}`);
  }

  return parsed.value;
}

function startsOfDay(result: SlotEngineResult, date: string): string[] {
  return result.slots
    .map((slot) => slot.start.toString())
    .filter((start) => start.startsWith(date));
}

beforeAll(async () => {
  database = await createTestDatabase("booking_use_cases");
});

beforeEach(async () => {
  await database.reset();
  now = new Date("2026-01-05T10:00:00.000Z");
  useCases = useCasesFor();
});

afterAll(async () => {
  await database.destroy();
});

describe("listSlots", () => {
  it("returns the owner-local booking window from the injected clock", async () => {
    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);

    expect(result.window.start.toString()).toBe("2026-01-04T21:00:00Z");
    expect(result.window.end.toString()).toBe("2026-01-18T21:00:00Z");
  });

  it("slides the window with the injected clock", async () => {
    now = new Date("2026-01-06T10:00:00.000Z");

    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);

    expect(result.window.start.toString()).toBe("2026-01-05T21:00:00Z");
    expect(result.window.end.toString()).toBe("2026-01-19T21:00:00Z");
  });

  it("offers starts on the quarter-hour grid within working hours", async () => {
    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);
    const starts = startsOfDay(result, "2026-01-06");

    expect(starts.at(0)).toBe("2026-01-06T07:00:00Z");
    expect(starts.at(-1)).toBe("2026-01-06T14:45:00Z");

    for (const start of starts) {
      const local = Temporal.Instant.from(start).toZonedDateTimeISO("Europe/Moscow");

      expect(isOnSlotGrid(local)).toBe(true);
    }
  });

  it("skips non-working days", async () => {
    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);

    expect(result.slots.length).toBeGreaterThan(0);
    expect(startsOfDay(result, "2026-01-10")).toEqual([]);
    expect(startsOfDay(result, "2026-01-11")).toEqual([]);
    expect(startsOfDay(result, "2026-01-06").length).toBeGreaterThan(0);
  });

  it("excludes starts that are not in the future", async () => {
    now = new Date("2026-01-05T14:50:00.000Z");

    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);

    expect(startsOfDay(result, "2026-01-05")).toEqual([]);
    expect(result.slots.at(0)?.start.toString()).toBe("2026-01-06T07:00:00Z");
  });

  it("uses the meeting type duration", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, { durationMinutes: 45 });

    const result = await useCases.listSlots(meetingType.id);
    const durations = new Set(
      result.slots.map((slot) => slot.end.epochMilliseconds - slot.start.epochMilliseconds),
    );

    expect(startsOfDay(result, "2026-01-06").at(-1)).toBe("2026-01-06T14:15:00Z");
    expect([...durations]).toEqual([45 * 60_000]);
  });

  it("excludes an occupied interval from a stored booking", async () => {
    await createBookingFixture(database.db, {
      startAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:30:00Z"),
    });

    const result = await useCases.listSlots(DEFAULT_MEETING_TYPE_ID);
    const starts = startsOfDay(result, "2026-01-06");

    expect(starts).not.toContain("2026-01-06T07:15:00Z");
    expect(starts).toContain("2026-01-06T07:30:00Z");
  });

  it("excludes starts whose longer meeting would overlap a booking", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, { durationMinutes: 30 });
    await createBookingFixture(database.db, {
      startAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:30:00Z"),
    });

    const result = await useCases.listSlots(meetingType.id);
    const starts = startsOfDay(result, "2026-01-06");

    expect(starts).not.toContain("2026-01-06T07:00:00Z");
    expect(starts).not.toContain("2026-01-06T07:15:00Z");
    expect(starts).toContain("2026-01-06T07:30:00Z");
  });

  it("uses the injected owner configuration", async () => {
    const owner: OwnerConfig = {
      timeZone: "UTC",
      workingHours: {
        start: Temporal.PlainTime.from("09:00"),
        end: Temporal.PlainTime.from("11:00"),
      },
      workingDays: [1, 3],
    };

    const result = await useCasesFor(owner).listSlots(DEFAULT_MEETING_TYPE_ID);

    expect(result.window.start.toString()).toBe("2026-01-05T00:00:00Z");
    expect(startsOfDay(result, "2026-01-05").at(0)).toBe("2026-01-05T10:15:00Z");
    expect(startsOfDay(result, "2026-01-05").at(-1)).toBe("2026-01-05T10:45:00Z");
    expect(startsOfDay(result, "2026-01-06")).toEqual([]);
    expect(startsOfDay(result, "2026-01-07").at(0)).toBe("2026-01-07T09:00:00Z");
  });

  it.each([
    ["an id that is not a UUID", "not-a-uuid"],
    ["an unknown id", UNKNOWN_MEETING_TYPE_ID],
  ])("returns MeetingTypeNotFoundError for %s", async (_label, meetingTypeId) => {
    const operation = useCases.listSlots(meetingTypeId);

    await expect(operation).rejects.toBeInstanceOf(MeetingTypeNotFoundError);
  });
});

describe("createBooking", () => {
  it("captures the meeting type name and computes the end from its duration", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, {
      name: "Consultation",
      durationMinutes: 30,
    });

    const booking = await useCases.createBooking(bookingInput({ meetingTypeId: meetingType.id }));

    expect(booking.id).toMatch(UUID_PATTERN);
    expect(booking.meetingTypeId).toBe(meetingType.id);
    expect(booking.meetingTypeName).toBe("Consultation");
    expect(booking.attendeeName).toBe("Гость");
    expect(booking.attendeeEmail).toBe("guest@example.com");
    expect(booking.startAt.toString()).toBe(DEFAULT_START);
    expect(booking.endAt.toString()).toBe("2026-01-06T07:30:00Z");
  });

  it("stores a submitted description", async () => {
    const description = "Line one\nLine two — 🔥";

    const booking = await useCases.createBooking(validatedBookingInput({ description }));

    expect(booking.description).toBe(description);
  });

  it("treats a whitespace-only description as absent", async () => {
    const input = validatedBookingInput({ description: " \n\t " });

    expect(input.description).toBeUndefined();

    const booking = await useCases.createBooking(input);

    expect(booking.description).toBeUndefined();
  });

  it("rejects a description longer than 1000 code points without reserving the slot", async () => {
    const parsed = parseCreateBookingRequest({
      ...bookingInput(),
      description: "🔥".repeat(1001),
    });

    expect(parsed.ok).toBe(false);

    const booking = await useCases.createBooking(bookingInput());

    expect(booking.description).toBeUndefined();
  });

  it("does not copy the meeting type description into the booking", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, {
      description: "Owner's type description",
    });

    const booking = await useCases.createBooking(bookingInput({ meetingTypeId: meetingType.id }));

    expect(booking.description).toBeUndefined();
  });

  it.each([
    ["a start in the past", { startAt: "2026-01-05T07:00:00Z" }],
    ["a start off the fifteen-minute grid", { startAt: "2026-01-06T07:05:00Z" }],
    ["a start before working hours", { startAt: "2026-01-06T06:45:00Z" }],
    ["a start after working hours", { startAt: "2026-01-06T15:15:00Z" }],
    ["a start on a non-working day", { startAt: "2026-01-10T07:00:00Z" }],
    ["a start outside the booking window", { startAt: "2026-01-19T07:00:00Z" }],
  ])("returns SlotNotAvailableError for %s", async (_label, overrides) => {
    const input = bookingInput({
      startAt: Temporal.Instant.from(overrides.startAt),
    });

    const operation = useCases.createBooking(input);

    await expect(operation).rejects.toBeInstanceOf(SlotNotAvailableError);
  });

  it("returns SlotNotAvailableError when the meeting does not fit before closing", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, { durationMinutes: 30 });
    const input = bookingInput({
      meetingTypeId: meetingType.id,
      startAt: Temporal.Instant.from("2026-01-06T14:45:00Z"),
    });

    const operation = useCases.createBooking(input);

    await expect(operation).rejects.toBeInstanceOf(SlotNotAvailableError);
  });

  it("returns SlotNotAvailableError for a repeat booking", async () => {
    const first = await useCases.createBooking(bookingInput());

    expect(first.id).toMatch(UUID_PATTERN);

    const operation = useCases.createBooking(bookingInput());

    await expect(operation).rejects.toBeInstanceOf(SlotNotAvailableError);
  });

  it("returns SlotNotAvailableError for a partial overlap across meeting types", async () => {
    const intro = await createMeetingTypeFixture(database.db, { durationMinutes: 30 });
    const consultation = await createMeetingTypeFixture(database.db, { durationMinutes: 45 });
    const first = await useCases.createBooking(
      bookingInput({ meetingTypeId: intro.id, startAt: Temporal.Instant.from(DEFAULT_START) }),
    );

    expect(first.id).toMatch(UUID_PATTERN);

    const operation = useCases.createBooking(
      bookingInput({
        meetingTypeId: consultation.id,
        startAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
      }),
    );

    await expect(operation).rejects.toBeInstanceOf(SlotNotAvailableError);
  });

  it("allows a booking to start exactly when another one ends", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, { durationMinutes: 30 });
    await useCases.createBooking(
      bookingInput({
        meetingTypeId: meetingType.id,
        startAt: Temporal.Instant.from(DEFAULT_START),
      }),
    );

    const next = await useCases.createBooking(
      bookingInput({
        meetingTypeId: meetingType.id,
        startAt: Temporal.Instant.from("2026-01-06T07:30:00Z"),
      }),
    );

    expect(next.startAt.toString()).toBe("2026-01-06T07:30:00Z");
  });

  it("reserves only one slot when two bookings race", async () => {
    const first = useCases.createBooking(bookingInput());
    const second = useCases.createBooking(bookingInput());
    const results = await Promise.allSettled([first, second]);
    const statuses = results.map((result) => {
      if (result.status === "rejected") {
        if (!(result.reason instanceof SlotNotAvailableError)) {
          throw result.reason;
        }

        return 409;
      }

      return 201;
    });

    expect(statuses.toSorted()).toEqual([201, 409]);
  });

  it.each([
    ["an id that is not a UUID", "not-a-uuid"],
    ["an unknown id", UNKNOWN_MEETING_TYPE_ID],
  ])("returns MeetingTypeNotFoundError for %s", async (_label, meetingTypeId) => {
    const operation = useCases.createBooking(bookingInput({ meetingTypeId }));

    await expect(operation).rejects.toBeInstanceOf(MeetingTypeNotFoundError);
  });
});
