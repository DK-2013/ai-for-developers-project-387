import type { Booking } from "@calendar/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UpcomingBookingsView } from "../components/upcoming-bookings-view";

const firstBooking: Booking = {
  id: "00000000-0000-4000-8000-000000000010",
  meetingTypeId: "00000000-0000-4000-8000-000000000001",
  meetingTypeName: "Знакомство",
  startAt: new Date("2026-01-06T07:00:00Z"),
  endAt: new Date("2026-01-06T07:30:00Z"),
  attendeeName: "Анна",
  attendeeEmail: "anna@example.com",
};

const secondBooking: Booking = {
  id: "00000000-0000-4000-8000-000000000011",
  meetingTypeId: "00000000-0000-4000-8000-000000000002",
  meetingTypeName: "Разбор",
  startAt: new Date("2026-01-06T09:00:00Z"),
  endAt: new Date("2026-01-06T10:00:00Z"),
  attendeeName: "Борис",
  attendeeEmail: "boris@example.com",
};

const bookings: Booking[] = [firstBooking, secondBooking];

function renderView(props: Parameters<typeof UpcomingBookingsView>[0]): string {
  return renderToStaticMarkup(<UpcomingBookingsView {...props} />);
}

function bookingItemMarkup(markup: string, text: string): string {
  return markup.split("<li").find((item) => item.includes(text)) ?? "";
}

const description = "Уточнить график\nПрислать документы";

describe("upcoming bookings view", () => {
  it("shows a loading state", () => {
    const markup = renderView({ status: "loading" });

    expect(markup).toContain("Загрузка...");
  });

  it("shows an error state", () => {
    const markup = renderView({ status: "error" });

    expect(markup).toContain("Не удалось загрузить предстоящие встречи.");
  });

  it("shows an empty state when there are no upcoming bookings", () => {
    const markup = renderView({ status: "ready", bookings: [], timeZone: "Europe/Moscow" });

    expect(markup).toContain("Пока нет предстоящих встреч.");
  });

  it("lists the meeting type, time range, and guest details", () => {
    const markup = renderView({ status: "ready", bookings, timeZone: "Europe/Moscow" });

    expect(markup).toContain("Знакомство");
    expect(markup).toContain('<h2 class="text-lg font-semibold">Знакомство</h2>');
    expect(markup).toContain("вторник, 6 января");
    expect(markup).toContain("10:00–10:30");
    expect(markup).toContain("Анна");
    expect(markup).toContain("anna@example.com");
    expect(markup).toContain("Разбор");
    expect(markup).toContain("12:00–13:00");
    expect(markup).toContain("Борис");
    expect(markup).toContain("boris@example.com");
    expect(markup).not.toContain("Пока нет предстоящих встреч.");
  });

  it("shows a description next to the meeting type, time and attendee of its booking", () => {
    const markup = renderView({
      status: "ready",
      bookings: [{ ...firstBooking, description }, secondBooking],
      timeZone: "Europe/Moscow",
    });

    const describedItem = bookingItemMarkup(markup, "Уточнить график");
    const otherItem = bookingItemMarkup(markup, "Борис");

    expect(describedItem).toContain("Знакомство");
    expect(describedItem).toContain("10:00–10:30");
    expect(describedItem).toContain("Анна, anna@example.com");
    expect(describedItem).toContain(description);
    expect(otherItem).not.toContain(description);
  });

  it("shows the description captured on the booking, not the meeting type description", () => {
    const markup = renderView({
      status: "ready",
      bookings: [{ ...firstBooking, description: "Контекст из брони" }],
      timeZone: "Europe/Moscow",
    });

    expect(markup).toContain("Контекст из брони");
    expect(markup).not.toContain("Стандартный звонок");
  });

  it("preserves line breaks in a booking description", () => {
    const markup = renderView({
      status: "ready",
      bookings: [{ ...firstBooking, description }],
      timeZone: "Europe/Moscow",
    });

    expect(markup).toContain(description);
    expect(bookingItemMarkup(markup, "Уточнить график")).toContain("whitespace-pre-line");
  });

  it("renders a booking without a description exactly as before", () => {
    const markup = renderView({ status: "ready", bookings, timeZone: "Europe/Moscow" });
    const plainItem = bookingItemMarkup(markup, "Анна, anna@example.com");

    expect((plainItem.match(/<p /g) ?? []).length).toBe(2);
    expect(plainItem).not.toContain("Описание:");
    expect(plainItem).not.toContain("whitespace-pre-line");
    expect(markup).not.toContain("Описание:");
  });
});
