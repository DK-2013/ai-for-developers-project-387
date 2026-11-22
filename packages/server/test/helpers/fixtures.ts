import type { Temporal } from "temporal-polyfill";
import type { Booking, NewBooking } from "../../src/bookings/domain.js";
import { createBookingRepository } from "../../src/bookings/repository.js";
import type { Database } from "../../src/db/schema.js";
import type { MeetingType, NewMeetingType } from "../../src/meeting-types/domain.js";
import { createMeetingTypeRepository } from "../../src/meeting-types/repository.js";

export const DEFAULT_MEETING_TYPE_ID = "00000000-0000-4000-8000-000000000001";

export type MeetingTypeFixture = Partial<NewMeetingType>;

export async function createMeetingTypeFixture(
  db: Database,
  input: MeetingTypeFixture = {},
): Promise<MeetingType> {
  const values: NewMeetingType = {
    name: input.name ?? "Intro call",
    durationMinutes: input.durationMinutes ?? 30,
  };

  if (input.description !== undefined) {
    values.description = input.description;
  }

  return createMeetingTypeRepository(db).create(values);
}

export type BookingFixture = {
  meetingTypeId?: string;
  meetingTypeName?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  startAt: Temporal.Instant;
  endAt: Temporal.Instant;
  description?: string;
};

export async function createBookingFixture(db: Database, input: BookingFixture): Promise<Booking> {
  const values: NewBooking = {
    meetingTypeId: input.meetingTypeId ?? DEFAULT_MEETING_TYPE_ID,
    meetingTypeName: input.meetingTypeName ?? "Звонок",
    attendeeName: input.attendeeName ?? "Гость",
    attendeeEmail: input.attendeeEmail ?? "guest@example.com",
    startAt: input.startAt,
    endAt: input.endAt,
  };

  if (input.description !== undefined) {
    values.description = input.description;
  }

  return createBookingRepository(db).create(values);
}
