import type { Booking, Slot } from "@calendar/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BookingSlotsView, type BookingSlotsViewProps } from "../components/booking-slots-view";

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

type ReadyProps = Extract<BookingSlotsViewProps, { status: "ready" }>;

function renderView(overrides: Partial<ReadyProps> = {}): string {
  const props: ReadyProps = {
    status: "ready",
    meetingType: { name: "Знакомство", durationMinutes: 15 },
    timezone: "Europe/Moscow",
    guestTimeZone: "Asia/Tokyo",
    windowStart: new Date("2026-01-04T21:00:00Z"),
    windowEnd: new Date("2026-01-18T21:00:00Z"),
    slots,
    booking: { status: "idle" },
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
    expect(markup).toContain('aria-label="Подтверждение бронирования"');
    expect(markup).not.toContain('name="attendeeName"');
    expect(markup).not.toContain("aria-pressed");
    expect(markup).not.toContain("Выбрать ");
  });

  it("shows the owner time zone reference when there are no free slots", () => {
    const markup = renderView({ slots: [] });

    expect(markup).toContain("Нет свободных слотов в ближайшие 14 дней.");
    expect(markup).toContain("Часовой пояс владельца: Europe/Moscow");
    expect(markup).not.toContain("aria-pressed");
    expect(markup).not.toContain("Выбрать ");
  });

  it("shows a Monday-start week with one month header and only the active day's slots", () => {
    const markup = renderView({
      slots: [
        ...slots,
        { startAt: new Date("2026-01-07T10:00:00Z"), endAt: new Date("2026-01-07T10:15:00Z") },
      ],
    });

    for (const weekday of ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]) {
      expect(markup).toContain(`<span>${weekday}</span>`);
    }
    expect(markup.match(/январь/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Выбрать пн, 5 января"');
    expect(markup).toContain('aria-label="Выбрать ср, 7 января"');
    expect(markup).toContain("16:00");
    expect(markup).toContain("16:15");
    expect(markup).not.toContain("19:00");
    expect(markup).not.toContain("среда, 7 января");
  });

  it("leaves the days before a Wednesday start without clickable labels", () => {
    const markup = renderView({
      windowStart: new Date("2026-01-06T21:00:00Z"),
      windowEnd: new Date("2026-01-20T21:00:00Z"),
      slots: [
        { startAt: new Date("2026-01-07T07:00:00Z"), endAt: new Date("2026-01-07T07:15:00Z") },
      ],
    });

    expect(markup).not.toContain('aria-label="Выбрать вт, 6 января"');
    expect(markup).not.toContain('aria-label="Выбрать пн, 5 января"');
    expect(markup).toContain('aria-label="Выбрать ср, 7 января"');
    expect(markup).toContain("16:00");
  });

  it("shows both month names in the single month header across a boundary", () => {
    const markup = renderView({
      windowStart: new Date("2026-01-26T21:00:00Z"),
      windowEnd: new Date("2026-02-09T21:00:00Z"),
      slots: [
        { startAt: new Date("2026-01-27T07:00:00Z"), endAt: new Date("2026-01-27T07:15:00Z") },
      ],
    });

    expect(markup).toContain("январь + февраль");
    expect(markup.match(/январь/g)).toHaveLength(1);
    expect(markup.match(/февраль/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="Выбрать вт, 27 января"');
    expect(markup).toContain(">9</span>");
  });

  it("shows a day without slots in the calendar but not as a clickable day", () => {
    const markup = renderView({
      slots: [
        ...slots,
        { startAt: new Date("2026-01-07T10:00:00Z"), endAt: new Date("2026-01-07T10:15:00Z") },
      ],
    });

    expect(markup).toContain(">6</span>");
    expect(markup).not.toContain('aria-label="Выбрать вт, 6 января"');
    expect(markup).toContain('aria-label="Выбрать пн, 5 января"');
    expect(markup).toContain('aria-label="Выбрать ср, 7 января"');
    expect(markup).not.toContain("19:00");
  });

  it("marks only the active day button as pressed", () => {
    const markup = renderView({
      slots: [
        ...slots,
        { startAt: new Date("2026-01-07T10:00:00Z"), endAt: new Date("2026-01-07T10:15:00Z") },
      ],
    });

    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать пн, 5 января")(?=[^>]*aria-pressed="true")[^>]*>/,
    );
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать ср, 7 января")(?=[^>]*aria-pressed="false")[^>]*>/,
    );
    expect(markup.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("shows the slots of the explicitly selected day", () => {
    const markup = renderView({
      slots: [
        ...slots,
        { startAt: new Date("2026-01-07T10:00:00Z"), endAt: new Date("2026-01-07T10:15:00Z") },
      ],
      selectedDayKey: "2026-01-07",
    });

    expect(markup).toContain("19:00");
    expect(markup).not.toContain("16:00");
    expect(markup).toContain("среда, 7 января");
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать ср, 7 января")(?=[^>]*aria-pressed="true")[^>]*>/,
    );
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать пн, 5 января")(?=[^>]*aria-pressed="false")[^>]*>/,
    );
  });

  it("keeps the selected slot's day when a different day is selected", () => {
    const markup = renderView({
      slots: [
        ...slots,
        { startAt: new Date("2026-01-07T10:00:00Z"), endAt: new Date("2026-01-07T10:15:00Z") },
      ],
      selectedSlot: slots[0],
      selectedDayKey: "2026-01-07",
    });

    expect(markup).toContain("16:00");
    expect(markup).not.toContain("19:00");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать пн, 5 января")(?=[^>]*aria-pressed="true")[^>]*>/,
    );
    expect(markup).toMatch(
      /<button(?=[^>]*aria-label="Выбрать ср, 7 января")(?=[^>]*aria-pressed="false")[^>]*>/,
    );
  });
});
