import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/database.js";
import { createMeetingTypeFixture, DEFAULT_MEETING_TYPE_ID } from "./helpers/fixtures.js";
import { startTestServer, stopTestServer } from "./helpers/server.js";

const UNKNOWN_MEETING_TYPE_ID = "00000000-0000-4000-8000-000000000099";
const MOSCOW = "Europe/Moscow";
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

type SlotListBody = {
  timezone: string;
  windowStart: string;
  windowEnd: string;
  slots: { startAt: string; endAt: string }[];
};

let database: TestDatabase;
let server: Server;
let baseUrl: string;
let now: Date;

async function getSlots(
  meetingTypeId: string = DEFAULT_MEETING_TYPE_ID,
): Promise<{ status: number; body: SlotListBody }> {
  const response = await fetch(`${baseUrl}/meeting-types/${meetingTypeId}/slots`);
  const body = (await response.json()) as SlotListBody;

  return { status: response.status, body };
}

function expectUtcWireSlots(slots: SlotListBody["slots"]): void {
  expect(slots.length).toBeGreaterThan(0);

  for (const slot of slots) {
    expect(slot.startAt).toEqual(expect.stringMatching(UTC_INSTANT));
    expect(slot.endAt).toEqual(expect.stringMatching(UTC_INSTANT));
  }
}

beforeAll(async () => {
  database = await createTestDatabase("slots");
  const started = await startTestServer({ db: database.db, clock: () => now });
  server = started.server;
  baseUrl = started.baseUrl;
});

beforeEach(async () => {
  await database.reset();
  now = new Date("2026-01-05T10:00:00.000Z");
});

afterAll(async () => {
  await stopTestServer(server);
  await database.destroy();
});

describe("GET /meeting-types/{id}/slots", () => {
  it("returns 404 for an unknown meeting type", async () => {
    const response = await getSlots(UNKNOWN_MEETING_TYPE_ID);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "meeting_type_not_found",
      message: expect.any(String),
    });
  });

  it("returns 404 for an id that is not a UUID", async () => {
    const response = await getSlots("not-a-uuid");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "meeting_type_not_found" });
  });

  it("returns 200 with the slot list wire shape", async () => {
    const response = await getSlots();

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe(MOSCOW);
    expect(response.body.windowStart).toEqual(expect.stringMatching(UTC_INSTANT));
    expect(response.body.windowEnd).toEqual(expect.stringMatching(UTC_INSTANT));
    expectUtcWireSlots(response.body.slots);
  });

  it("returns the same wire shape for another meeting type", async () => {
    const meetingType = await createMeetingTypeFixture(database.db, { durationMinutes: 30 });

    const response = await getSlots(meetingType.id);

    expect(response.status).toBe(200);
    expect(response.body.timezone).toBe(MOSCOW);
    expectUtcWireSlots(response.body.slots);
  });
});
