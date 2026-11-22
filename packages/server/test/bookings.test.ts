import type { Server } from "node:http";
import { Temporal } from "temporal-polyfill";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import {
  createBookingFixture,
  createMeetingTypeFixture,
  DEFAULT_MEETING_TYPE_ID,
} from "./helpers/fixtures.js";
import { startTestServer, stopTestServer } from "./helpers/server.js";

const FIXED_NOW = new Date("2026-01-05T10:00:00.000Z");
const UNKNOWN_MEETING_TYPE_ID = "00000000-0000-4000-8000-000000000099";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type BookingBody = {
  id: string;
  meetingTypeId: string;
  meetingTypeName: string;
  startAt: string;
  endAt: string;
  attendeeName: string;
  attendeeEmail: string;
  description?: string;
};

type Response = { status: number; body: unknown };

let database: TestDatabase;
let server: Server;
let baseUrl: string;
let currentNow = FIXED_NOW;

async function postBooking(body: unknown): Promise<Response> {
  const response = await fetch(`${baseUrl}/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json();

  return { status: response.status, body: parsed };
}

async function getBookings(): Promise<Response> {
  const response = await fetch(`${baseUrl}/bookings`);
  const parsed: unknown = await response.json();

  return { status: response.status, body: parsed };
}

function bookingRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    meetingTypeId: DEFAULT_MEETING_TYPE_ID,
    startAt: "2026-01-06T07:00:00Z",
    attendeeName: "Гость",
    attendeeEmail: "guest@example.com",
    ...overrides,
  };
}

beforeAll(async () => {
  database = await createTestDatabase("bookings");
  const started = await startTestServer({ db: database.db, clock: () => currentNow });
  server = started.server;
  baseUrl = started.baseUrl;
});

beforeEach(async () => {
  currentNow = FIXED_NOW;
  await database.reset();
});

afterAll(async () => {
  await stopTestServer(server);
  await database.destroy();
});

describe("POST /bookings", () => {
  it("returns 201 with the booking wire shape", async () => {
    const response = await postBooking(bookingRequest());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.stringMatching(UUID_PATTERN),
      meetingTypeId: expect.stringMatching(UUID_PATTERN),
      meetingTypeName: expect.any(String),
      startAt: expect.stringMatching(UTC_INSTANT),
      endAt: expect.stringMatching(UTC_INSTANT),
      attendeeName: expect.any(String),
      attendeeEmail: expect.any(String),
    });
  });

  it("returns 201 with an optional description", async () => {
    const response = await postBooking(bookingRequest({ description: "Pricing questions" }));
    const body = response.body as BookingBody;

    expect(response.status).toBe(201);
    expect(body.description).toEqual(expect.any(String));
  });

  it.each([
    ["body that is null", null],
    ["body that is an array", []],
    [
      "missing meetingTypeId",
      { startAt: "2026-01-06T07:00:00Z", attendeeName: "A", attendeeEmail: "a@example.com" },
    ],
    ["meetingTypeId that is not a string", bookingRequest({ meetingTypeId: 42 })],
    ["empty meetingTypeId", bookingRequest({ meetingTypeId: "" })],
    [
      "missing startAt",
      { meetingTypeId: DEFAULT_MEETING_TYPE_ID, attendeeName: "A", attendeeEmail: "a@example.com" },
    ],
    ["startAt that is not a string", bookingRequest({ startAt: 1767682800000 })],
    ["startAt without a time zone", bookingRequest({ startAt: "2026-01-06T07:00:00" })],
    ["startAt that is not a date", bookingRequest({ startAt: "tomorrow" })],
    [
      "missing attendeeName",
      {
        meetingTypeId: DEFAULT_MEETING_TYPE_ID,
        startAt: "2026-01-06T07:00:00Z",
        attendeeEmail: "a@example.com",
      },
    ],
    ["attendeeName longer than 200 characters", bookingRequest({ attendeeName: "a".repeat(201) })],
    ["attendeeName that is not a string", bookingRequest({ attendeeName: 42 })],
    [
      "missing attendeeEmail",
      {
        meetingTypeId: DEFAULT_MEETING_TYPE_ID,
        startAt: "2026-01-06T07:00:00Z",
        attendeeName: "A",
      },
    ],
    ["attendeeEmail that is not an email", bookingRequest({ attendeeEmail: "not-an-email" })],
    ["attendeeEmail without a domain", bookingRequest({ attendeeEmail: "guest@" })],
    [
      "attendeeEmail longer than 254 characters",
      bookingRequest({ attendeeEmail: `${"a".repeat(243)}@example.com` }),
    ],
    ["description that is not a string", bookingRequest({ description: 42 })],
    ["description that is null", bookingRequest({ description: null })],
  ])("returns 400 for %s", async (_label, body) => {
    const response = await postBooking(body);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "invalid_request",
      message: expect.any(String),
    });
  });

  it("returns 404 for an unknown meeting type", async () => {
    const response = await postBooking(bookingRequest({ meetingTypeId: UNKNOWN_MEETING_TYPE_ID }));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "meeting_type_not_found" });
  });

  it("returns 404 for a meeting type id that is not a UUID", async () => {
    const response = await postBooking(bookingRequest({ meetingTypeId: "not-a-uuid" }));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "meeting_type_not_found" });
  });

  it("returns 409 when the start is not bookable", async () => {
    const response = await postBooking(bookingRequest({ startAt: "2026-01-05T07:00:00Z" }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "slot_not_available" });
  });

  it("returns 409 when the slot is already occupied", async () => {
    await createBookingFixture(database.db, {
      startAt: Temporal.Instant.from("2026-01-06T07:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
    });

    const response = await postBooking(bookingRequest());

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "slot_not_available" });
  });
});

describe("GET /bookings", () => {
  it("returns 200 with upcoming bookings ordered by start", async () => {
    const consultation = await createMeetingTypeFixture(database.db, {
      name: "Консультация",
      durationMinutes: 30,
    });

    await createBookingFixture(database.db, {
      attendeeName: "Анна",
      startAt: Temporal.Instant.from("2026-01-06T08:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T08:15:00Z"),
    });
    await createBookingFixture(database.db, {
      meetingTypeId: consultation.id,
      meetingTypeName: consultation.name,
      attendeeName: "Борис",
      attendeeEmail: "boris@example.com",
      startAt: Temporal.Instant.from("2026-01-06T07:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:30:00Z"),
    });

    const response = await getBookings();
    const body = response.body as { bookings: BookingBody[] };

    expect(response.status).toBe(200);
    expect(body.bookings.map((booking) => booking.startAt)).toEqual([
      "2026-01-06T07:00:00Z",
      "2026-01-06T08:00:00Z",
    ]);
    expect(body.bookings.map((booking) => booking.meetingTypeName)).toEqual([
      "Консультация",
      "Звонок",
    ]);
    expect(body.bookings.map((booking) => booking.attendeeName)).toEqual(["Борис", "Анна"]);
  });

  it("excludes bookings that have ended and keeps the ones still running", async () => {
    await createBookingFixture(database.db, {
      attendeeName: "Анна",
      startAt: Temporal.Instant.from("2026-01-06T07:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
    });
    await createBookingFixture(database.db, {
      attendeeName: "Борис",
      startAt: Temporal.Instant.from("2026-01-06T08:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T08:15:00Z"),
    });

    currentNow = new Date("2026-01-06T07:15:00.000Z");

    const response = await getBookings();
    const body = response.body as { bookings: BookingBody[] };

    expect(response.status).toBe(200);
    expect(body.bookings.map((booking) => booking.attendeeName)).toEqual(["Борис"]);
  });

  it("returns an empty list when no booking is upcoming", async () => {
    await createBookingFixture(database.db, {
      startAt: Temporal.Instant.from("2026-01-06T07:00:00Z"),
      endAt: Temporal.Instant.from("2026-01-06T07:15:00Z"),
    });

    currentNow = new Date("2026-01-06T08:00:00.000Z");

    const response = await getBookings();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ bookings: [] });
  });
});
