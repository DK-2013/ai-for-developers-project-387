import type { Temporal } from "temporal-polyfill";

/** The meeting-type facts a booking needs once its id is resolved. */
export type ResolvedMeetingType = {
  id: string;
  name: string;
  durationMinutes: number;
};

/** What a guest supplies to book a slot, before the meeting type is resolved. */
export type CreateBookingInput = {
  meetingTypeId: string;
  attendeeName: string;
  attendeeEmail: string;
  startAt: Temporal.Instant;
  description?: string;
};

/** A validated booking request plus the facts the handler resolves. */
export type NewBooking = {
  meetingTypeId: string;
  meetingTypeName: string;
  attendeeName: string;
  attendeeEmail: string;
  description?: string;
  startAt: Temporal.Instant;
  endAt: Temporal.Instant;
};

/** A booking as stored in the database. */
export type Booking = NewBooking & {
  id: string;
};
