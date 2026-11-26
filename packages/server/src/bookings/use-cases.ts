import { Temporal } from "temporal-polyfill";
import type { Clock } from "../clock.js";
import type { OwnerConfig } from "../config.js";
import { isValidMeetingTypeId } from "../domain/ids.js";
import { bookableSlot, computeSlots, type SlotEngineResult } from "../domain/slots.js";
import { bookingWindow, type BookingWindow, type InstantInterval } from "../domain/time/index.js";
import type { Booking, CreateBookingInput, NewBooking, ResolvedMeetingType } from "./domain.js";
import { BookingConflictError, type BookingRepository } from "./repository.js";

export type { CreateBookingInput } from "./domain.js";

/** The meeting type cannot be resolved, whatever the reason. */
export class MeetingTypeNotFoundError extends Error {
  constructor() {
    super("Meeting type not found");
    this.name = "MeetingTypeNotFoundError";
  }
}

/** The requested start cannot be reserved, whether by rule or by occupancy. */
export class SlotNotAvailableError extends Error {
  constructor() {
    super("Slot is not available");
    this.name = "SlotNotAvailableError";
  }
}

export type BookingUseCases = {
  listSlots(meetingTypeId: string): Promise<SlotEngineResult>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
};

type MeetingTypeLookup = {
  findById(id: string): Promise<ResolvedMeetingType | undefined>;
};

type OccupiedSlotLookup = {
  listOccupied(window: BookingWindow): Promise<InstantInterval[]>;
};

export type BookingUseCaseDependencies = {
  meetingTypes: MeetingTypeLookup;
  slots: OccupiedSlotLookup;
  bookings: BookingRepository;
  owner: OwnerConfig;
  clock: Clock;
};

export function createBookingUseCases({
  meetingTypes,
  slots,
  bookings,
  owner,
  clock,
}: BookingUseCaseDependencies): BookingUseCases {
  function currentInstant(): Temporal.Instant {
    return Temporal.Instant.fromEpochMilliseconds(clock().getTime());
  }

  async function requireMeetingType(meetingTypeId: string) {
    if (!isValidMeetingTypeId(meetingTypeId)) {
      throw new MeetingTypeNotFoundError();
    }

    const meetingType = await meetingTypes.findById(meetingTypeId);

    if (meetingType === undefined) {
      throw new MeetingTypeNotFoundError();
    }

    return meetingType;
  }

  return {
    async listSlots(meetingTypeId) {
      const meetingType = await requireMeetingType(meetingTypeId);
      const now = currentInstant();
      const window = bookingWindow(now, owner.timeZone);
      const occupied = await slots.listOccupied(window);

      return computeSlots({
        now,
        owner,
        durationMinutes: meetingType.durationMinutes,
        occupied,
      });
    },

    async createBooking(input) {
      const meetingType = await requireMeetingType(input.meetingTypeId);
      const now = currentInstant();
      const slot = bookableSlot({
        now,
        owner,
        durationMinutes: meetingType.durationMinutes,
        start: input.startAt,
      });

      if (slot === undefined) {
        throw new SlotNotAvailableError();
      }

      const newBooking: NewBooking = {
        meetingTypeId: meetingType.id,
        meetingTypeName: meetingType.name,
        attendeeName: input.attendeeName,
        attendeeEmail: input.attendeeEmail,
        startAt: slot.start,
        endAt: slot.end,
      };

      if (input.description !== undefined) {
        newBooking.description = input.description;
      }

      try {
        return await bookings.create(newBooking);
      } catch (error) {
        if (error instanceof BookingConflictError) {
          throw new SlotNotAvailableError();
        }

        throw error;
      }
    },
  };
}
