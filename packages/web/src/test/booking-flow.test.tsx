import type { Booking, Slot } from "@calendar/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BookingSlotsView, type BookingSlotsViewProps } from "../components/booking-slots-view";
import { buildBookingCalendar } from "../lib/slots";

const slots: Slot[] = [
  { startAt: new Date("2026-01-05T07:00:00Z"), endAt: new Date("2026-01-05T07:15:00Z") },
  { startAt: new Date("2026-01-05T07:15:00Z"), endAt: new Date("2026-01-05T07:30:00Z") },
];

const booking: Booking = {
  id: "00000000-0000-4000-8000-000000000010",
  meetingTypeId: "00000000-0000-4000-8000-000000000001",
  meetingTypeName: "Знакомство",
  startAt: new Date("2026-01-05T07:00:00Z"),
  endAt: new Date("2026-01-05T07:15:00Z"),
  attendeeName: "Гость",
  attendeeEmail: "guest@example.com",
};

const guestTimeZone = "Asia/Tokyo";
const windowStart = new Date("2026-01-04T21:00:00Z");
const windowEnd = new Date("2026-01-18T21:00:00Z");

type ReadyProps = Extract<BookingSlotsViewProps, { status: "ready" }>;

function renderView(overrides: Partial<ReadyProps> = {}, daySlots: Slot[] = slots): string {
  const props: ReadyProps = {
    status: "ready",
    meetingType: { name: "Знакомство", durationMinutes: 15 },
    timezone: "Europe/Moscow",
    guestTimeZone,
    calendar: buildBookingCalendar(daySlots, windowStart, windowEnd, guestTimeZone),
    booking: { status: "idle" },
    onSelectDay: () => {},
    onSelectSlot: () => {},
    onSubmit: () => {},
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter>
      <BookingSlotsView {...props} />
    </MemoryRouter>,
  );
}

describe("booking flow", () => {
  it("offers free slots as selectable buttons before a slot is chosen", () => {
    const markup = renderView();

    expect(markup).toContain("16:00");
    expect(markup).toContain("16:15");
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain('name="attendeeName"');
  });

  it("shows all window days in Monday-Sunday weeks and disables days without slots", () => {
    const markup = renderView();

    expect(markup).toContain("Дни окна бронирования");
    expect(markup).toContain("пн");
    expect(markup).toContain("вс");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain("воскресенье, 18 января");
    expect(markup).toContain("5 янв");
    expect(markup).toContain("18 янв");
    expect(markup).toContain('aria-label="суббота, 10 января"');
    expect(markup).toContain('aria-label="воскресенье, 11 января"');
    expect(markup).toContain("disabled");
  });

  it("shows only the times of the selected day", () => {
    const nextDaySlot: Slot = {
      startAt: new Date("2026-01-05T16:00:00Z"),
      endAt: new Date("2026-01-05T16:15:00Z"),
    };
    const withNextDay = renderView({ selectedDayKey: "2026-01-06" }, [...slots, nextDaySlot]);

    expect(withNextDay).toContain("вторник, 6 января");
    expect(withNextDay).toContain("01:00");
    expect(withNextDay).not.toContain(">16:15<");

    const defaultDay = renderView({}, [...slots, nextDaySlot]);

    expect(defaultDay).toContain("понедельник, 5 января");
    expect(defaultDay).toContain("16:15");
    expect(defaultDay).not.toContain(">01:00<");
  });

  it("shows the name and email form for the selected slot", () => {
    const markup = renderView({ selectedSlot: slots[0] });

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toContain('maxLength="200"');
    expect(markup).toContain('name="attendeeEmail"');
    expect(markup).toContain('type="email"');
    expect(markup).toContain('maxLength="254"');
    expect(markup).toContain("Забронировать");
  });

  it("disables the submit button while submitting", () => {
    const markup = renderView({
      selectedSlot: slots[0],
      booking: { status: "submitting" },
    });

    expect(markup).toContain("disabled");
    expect(markup).toContain("Бронирование...");
  });

  it("shows a clear conflict message", () => {
    const markup = renderView({
      booking: {
        status: "error",
        message: "Это время уже занято. Пожалуйста, выберите другой слот.",
      },
    });

    expect(markup).toContain("Это время уже занято. Пожалуйста, выберите другой слот.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("16:00");
  });

  it("shows the successful booking instead of the form", () => {
    const markup = renderView({ booking: { status: "success", booking } });

    expect(markup).toContain("Вы записаны");
    expect(markup).toContain("Знакомство");
    expect(markup).toContain("16:00");
    expect(markup).toContain("Гость");
    expect(markup).toContain("guest@example.com");
    expect(markup).toContain("Часовой пояс владельца: Europe/Moscow");
    expect(markup).not.toContain('name="attendeeName"');
    expect(markup).not.toContain('aria-pressed="false"');
  });

  it("shows the owner time zone reference when there are no free slots", () => {
    const markup = renderView({}, []);

    expect(markup).toContain("Нет свободных слотов в ближайшие 14 дней.");
    expect(markup).toContain("Часовой пояс владельца: Europe/Moscow");
  });
});
