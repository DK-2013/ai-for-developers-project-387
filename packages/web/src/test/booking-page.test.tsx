import type { MeetingTypeList, SlotList } from "@calendar/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { slotsQuery } from "../api/queries";
import { BookingPage } from "../pages/booking-page";
import { createQueryClient } from "./render-app";

const meetingTypes: MeetingTypeList = {
  meetingTypes: [{ id: "intro", name: "Знакомство", durationMinutes: 30 }],
};

function slotList(
  slots: SlotList["slots"],
  windowStart: Date = new Date("2026-01-04T21:00:00Z"),
  windowEnd: Date = new Date("2026-01-18T21:00:00Z"),
): SlotList {
  return {
    timezone: "Europe/Moscow",
    windowStart,
    windowEnd,
    slots,
  };
}

function renderPage(slots: SlotList, guestTimeZone: string = "Asia/Tokyo"): string {
  const queryClient = createQueryClient(meetingTypes, { meetingTypeId: "intro", slots });

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/book/intro"]}>
        <Routes>
          <Route path="/book/:id" element={<BookingPage guestTimeZone={guestTimeZone} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("booking page", () => {
  it("shows slots in the guest browser zone and the owner zone as reference", () => {
    const markup = renderPage(
      slotList([
        { startAt: new Date("2026-01-05T07:00:00Z"), endAt: new Date("2026-01-05T07:30:00Z") },
        { startAt: new Date("2026-01-05T10:00:00Z"), endAt: new Date("2026-01-05T10:30:00Z") },
      ]),
    );

    expect(markup).toContain("Выбор времени");
    expect(markup).toContain("Знакомство");
    expect(markup).toContain("30 мин");
    expect(markup).toContain("Europe/Moscow");
    expect(markup).toContain("16:00");
    expect(markup).toContain("19:00");
    expect(markup).toContain("понедельник, 5 января");
  });

  it("renders the weekly day grid and shows only the first available day's slots", () => {
    const markup = renderPage(
      slotList([
        { startAt: new Date("2026-01-05T07:00:00Z"), endAt: new Date("2026-01-05T07:30:00Z") },
        { startAt: new Date("2026-01-05T16:00:00Z"), endAt: new Date("2026-01-05T16:30:00Z") },
      ]),
    );

    expect(markup).toContain("Дни окна бронирования");
    expect(markup).toContain("пн");
    expect(markup).toContain("вс");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain("вторник, 6 января");
    expect(markup).toContain("16:00");
    expect(markup).not.toContain(">01:00<");
  });

  it("selects the first day that has slots", () => {
    const markup = renderPage(
      slotList([
        { startAt: new Date("2026-01-05T16:00:00Z"), endAt: new Date("2026-01-05T16:30:00Z") },
      ]),
    );

    expect(markup).toContain("вторник, 6 января");
    expect(markup).toContain("01:00");
    expect(markup).toContain('aria-label="понедельник, 5 января"');
    expect(markup).toContain("disabled");
  });

  it("renders unambiguous dates across a month boundary", () => {
    const markup = renderPage(
      slotList(
        [
          { startAt: new Date("2026-01-31T10:00:00Z"), endAt: new Date("2026-01-31T10:30:00Z") },
          { startAt: new Date("2026-02-01T10:00:00Z"), endAt: new Date("2026-02-01T10:30:00Z") },
        ],
        new Date("2026-01-25T21:00:00Z"),
        new Date("2026-02-08T21:00:00Z"),
      ),
      "Europe/Moscow",
    );

    expect(markup).toContain("31 янв");
    expect(markup).toContain("1 февр");
    expect(markup).toContain("суббота, 31 января");
  });

  it("shows an empty state when the window has no free slots", () => {
    const markup = renderPage(slotList([]));

    expect(markup).toContain("Нет свободных слотов в ближайшие 14 дней.");
    expect(markup).toContain("Часовой пояс владельца: Europe/Moscow");
  });

  it("shows the API error when slots cannot be loaded", () => {
    const queryClient = createQueryClient(meetingTypes, {
      meetingTypeId: "intro",
      slots: {
        code: "meeting_type_not_found",
        message: "Meeting type not found",
      },
    });

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/book/intro"]}>
          <Routes>
            <Route path="/book/:id" element={<BookingPage guestTimeZone="Asia/Tokyo" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("Не удалось загрузить свободные слоты.");
  });

  it("shows a not-found message for an unknown meeting type", () => {
    const queryClient = createQueryClient(meetingTypes);
    queryClient.setQueryData(slotsQuery("unknown").queryKey, slotList([]));

    const markup = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/book/unknown"]}>
          <Routes>
            <Route path="/book/:id" element={<BookingPage guestTimeZone="Asia/Tokyo" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(markup).toContain("Тип встречи не найден.");
  });
});
