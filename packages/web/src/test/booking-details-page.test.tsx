import type { ApiError, MeetingTypeList, Slot, SlotList } from "@calendar/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { detailsSlotsQuery } from "../api/queries";
import { BookingDetailsPage } from "../pages/booking-details-page";
import { createQueryClient } from "./render-app";

const meetingTypes: MeetingTypeList = {
  meetingTypes: [{ id: "intro", name: "Знакомство", durationMinutes: 30 }],
};

const slot: Slot = {
  startAt: new Date("2026-01-05T07:00:00Z"),
  endAt: new Date("2026-01-05T07:30:00Z"),
};

function slotList(slots: Slot[]): SlotList {
  return {
    timezone: "Europe/Moscow",
    windowStart: new Date("2026-01-04T21:00:00Z"),
    windowEnd: new Date("2026-01-18T21:00:00Z"),
    slots,
  };
}

function renderPage(
  search: string,
  options: { slots?: SlotList | ApiError; types?: MeetingTypeList } = {},
): string {
  const queryClient = createQueryClient(options.types ?? meetingTypes);
  queryClient.setQueryData(detailsSlotsQuery("intro").queryKey, options.slots ?? slotList([slot]));

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/book/intro/details${search}`]}>
        <Routes>
          <Route
            element={<BookingDetailsPage guestTimeZone="Asia/Tokyo" />}
            path="/book/:id/details"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("booking details page", () => {
  it("shows the form for a fresh instant from the address", () => {
    const markup = renderPage("?startAt=2026-01-05T07%3A00%3A00Z");

    expect(markup).toContain("Данные для записи");
    expect(markup).toContain("Знакомство · 30 мин");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain("16:00");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toContain("Назад к выбору времени");
  });

  it("accepts a UTC instant with a shorter fractional part", () => {
    const markup = renderPage("?startAt=2026-01-05T07%3A00%3A00.0Z");

    expect(markup).toContain("16:00");
    expect(markup).toContain('name="attendeeName"');
  });

  it("does not show the form when the instant is missing", () => {
    const markup = renderPage("");

    expect(markup).not.toContain('name="attendeeName"');
  });

  it("does not show the form when the instant is unavailable", () => {
    const markup = renderPage("?startAt=2026-01-05T07%3A15%3A00Z");

    expect(markup).not.toContain('name="attendeeName"');
  });

  it("shows an error when slots cannot be loaded", () => {
    const markup = renderPage("?startAt=2026-01-05T07%3A00%3A00Z", {
      slots: { code: "meeting_type_not_found", message: "Meeting type not found" },
    });

    expect(markup).toContain("Не удалось загрузить свободные слоты.");
    expect(markup).not.toContain('name="attendeeName"');
  });

  it("shows an error for an unknown meeting type", () => {
    const markup = renderPage("?startAt=2026-01-05T07%3A00%3A00Z", {
      types: { meetingTypes: [] },
    });

    expect(markup).toContain("Тип встречи не найден.");
  });
});
