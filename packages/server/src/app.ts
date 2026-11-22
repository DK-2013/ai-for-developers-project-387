import type { IncomingMessage, ServerResponse } from "node:http";
import type { Booking } from "./bookings/domain.js";
import { createBookingRepository } from "./bookings/repository.js";
import {
  createBookingUseCases,
  MeetingTypeNotFoundError,
  SlotNotAvailableError,
  type CreateBookingInput,
} from "./bookings/use-cases.js";
import { parseCreateBookingRequest } from "./bookings/validation.js";
import type { Clock } from "./clock.js";
import type { OwnerConfig } from "./config.js";
import type { Database } from "./db/schema.js";
import type { HttpContext } from "./generated/helpers/router.js";
import { createCallCalendarRouter } from "./generated/http/router.js";
import type {
  ApiError,
  Booking as WireBooking,
  CreateMeetingTypeRequest,
  MeetingType as WireMeetingType,
  SlotList,
} from "./generated/models/all/call-calendar.js";
import type { CallCalendar } from "./generated/models/all/index.js";
import type { MeetingType } from "./meeting-types/domain.js";
import { createMeetingTypeRepository } from "./meeting-types/repository.js";
import { parseCreateMeetingTypeRequest } from "./meeting-types/validation.js";
import { createSlotRepository } from "./slots/repository.js";

export type RequestHandlerDependencies = {
  db: Database;
  owner: OwnerConfig;
  clock: Clock;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function apiError(code: ApiError["code"], message: string): ApiError {
  return { code, message };
}

function meetingTypeNotFound() {
  return {
    statusCode: 404 as const,
    body: apiError("meeting_type_not_found", "Meeting type not found"),
  };
}

function slotNotAvailable() {
  return {
    statusCode: 409 as const,
    body: apiError("slot_not_available", "Slot is not available"),
  };
}

function toWireMeetingType(meetingType: MeetingType): WireMeetingType {
  const wire: WireMeetingType = {
    id: meetingType.id,
    name: meetingType.name,
    durationMinutes: meetingType.durationMinutes,
  };

  if (meetingType.description !== undefined) {
    wire.description = meetingType.description;
  }

  return wire;
}

function toWireBooking(booking: Booking): WireBooking {
  const wire: WireBooking = {
    id: booking.id,
    meetingTypeId: booking.meetingTypeId,
    meetingTypeName: booking.meetingTypeName,
    startAt: booking.startAt,
    endAt: booking.endAt,
    attendeeName: booking.attendeeName,
    attendeeEmail: booking.attendeeEmail,
  };

  if (booking.description !== undefined) {
    wire.description = booking.description;
  }

  return wire;
}

export function createRequestHandler({
  db,
  owner,
  clock,
}: RequestHandlerDependencies): (request: IncomingMessage, response: ServerResponse) => void {
  const meetingTypes = createMeetingTypeRepository(db);
  const slots = createSlotRepository(db);
  const bookings = createBookingRepository(db);
  const bookingUseCases = createBookingUseCases({ meetingTypes, slots, bookings, owner, clock });

  const service: CallCalendar<HttpContext> = {
    async healthz() {
      return {
        statusCode: 200 as const,
        body: { status: "ok" },
      };
    },

    async listMeetingTypes() {
      const savedMeetingTypes = await meetingTypes.list();

      return {
        statusCode: 200 as const,
        body: { meetingTypes: savedMeetingTypes.map(toWireMeetingType) },
      };
    },

    async createMeetingType(_ctx, body: CreateMeetingTypeRequest) {
      const parsed = parseCreateMeetingTypeRequest(body);

      if (!parsed.ok) {
        return {
          statusCode: 400 as const,
          body: apiError("invalid_request", parsed.message),
        };
      }

      const meetingType = await meetingTypes.create(parsed.value);

      return {
        statusCode: 201 as const,
        body: toWireMeetingType(meetingType),
      };
    },

    async listSlots(_ctx, id) {
      let result;

      try {
        result = await bookingUseCases.listSlots(id);
      } catch (error) {
        if (error instanceof MeetingTypeNotFoundError) {
          return meetingTypeNotFound();
        }

        throw error;
      }

      const body: SlotList = {
        timezone: owner.timeZone,
        windowStart: result.window.start,
        windowEnd: result.window.end,
        slots: result.slots.map((slot) => ({ startAt: slot.start, endAt: slot.end })),
      };

      return {
        statusCode: 200 as const,
        body,
      };
    },

    async listBookings() {
      const now = clock();
      const upcoming = await bookings.listUpcoming(now);

      return {
        statusCode: 200 as const,
        body: { bookings: upcoming.map(toWireBooking) },
      };
    },

    async createBooking(_ctx, body) {
      const parsed = parseCreateBookingRequest(body);

      if (!parsed.ok) {
        return {
          statusCode: 400 as const,
          body: apiError("invalid_request", parsed.message),
        };
      }

      const input: CreateBookingInput = {
        meetingTypeId: parsed.value.meetingTypeId,
        attendeeName: parsed.value.attendeeName,
        attendeeEmail: parsed.value.attendeeEmail,
        startAt: parsed.value.startAt,
      };

      if (parsed.value.description !== undefined) {
        input.description = parsed.value.description;
      }

      try {
        const booking = await bookingUseCases.createBooking(input);

        return {
          statusCode: 201 as const,
          body: toWireBooking(booking),
        };
      } catch (error) {
        if (error instanceof MeetingTypeNotFoundError) {
          return meetingTypeNotFound();
        }

        if (error instanceof SlotNotAvailableError) {
          return slotNotAvailable();
        }

        throw error;
      }
    },
  };

  const router = createCallCalendarRouter(service, {
    onRequestNotFound(ctx) {
      sendJson(ctx.response, 404, apiError("invalid_request", "Not Found"));
    },
    onInvalidRequest(ctx) {
      sendJson(ctx.response, 400, apiError("invalid_request", "Malformed request"));
    },
    onInternalError(ctx, error) {
      // The generated body parser reports malformed JSON through onInvalidRequest
      // and then rejects, which the router routes here. That response is already
      // sent, so only log errors that still need a 500.
      if (ctx.response.headersSent || ctx.response.writableEnded) {
        return;
      }

      console.error("Unexpected request error", error);
      // A 500 is outside the contract, so it deliberately does not reuse ApiError:
      // its `code` union only describes errors the API promises to return.
      sendJson(ctx.response, 500, { message: "Internal Server Error" });
    },
  });

  return (request, response) => {
    router.dispatch(request, response);
  };
}
