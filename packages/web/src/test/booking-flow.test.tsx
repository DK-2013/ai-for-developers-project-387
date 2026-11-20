import type { Booking, Slot } from "@calendar/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { BookingSlotsView, type BookingSlotsViewProps } from "../components/booking-slots-view";

const slots: Slot[] = [
  { startAt: new Date("2026-01-05T07:00:00Z"), endAt: new Date("2026-01-05T07:15:00Z") },
  { startAt: new Date("2026-01-05T07:15:00Z"), endAt: new Date("2026-01-05T07:30:00Z") },
];

const wednesdaySlot: Slot = {
  startAt: new Date("2026-01-07T10:00:00Z"),
  endAt: new Date("2026-01-07T10:15:00Z"),
};

const mondayLabel = "пн, 5 января, 2 свободных слота";
const wednesdayLabel = "ср, 7 января, 1 свободный слот";
const dayLabel = (label: string) => `aria-label="Выбрать ${label}"`;

function dayButtonPattern(label: string, pressed: boolean): RegExp {
  return new RegExp(
    `<button(?=[^>]*aria-label="Выбрать ${label}")(?=[^>]*aria-pressed="${pressed}")[^>]*>`,
  );
}

function dayButtonMarkup(markup: string, label: string): string {
  const pattern = new RegExp(
    `<button(?=[^>]*aria-label="Выбрать ${label}(?:,|"))[^>]*>[\\s\\S]*?</button>`,
  );
  const match = pattern.exec(markup);

  return match?.[0] ?? "";
}

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

  it("offers an optional multi-line description field", () => {
    const markup = renderView({ selectedSlot: slots[0] });
    const textarea = /<textarea[^>]*name="description"[^>]*>/.exec(markup)?.[0] ?? "";

    expect(textarea).toContain('maxLength="2000"');
    expect(textarea).toContain('rows="3"');
    expect(textarea).not.toContain("required");
    expect(markup).toContain("Описание (необязательно)");
  });

  it("shows the 2000-character limit hint next to the description field", () => {
    const markup = renderView({ selectedSlot: slots[0] });

    expect(markup).toContain("До 2000 символов");
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
    expect(markup).not.toContain("Описание:");
  });

  it("shows the submitted description with preserved line breaks in the confirmation", () => {
    const description = "Уточнить график\nПрислать документы";
    const markup = renderView({
      booking: { status: "success", booking: { ...booking, description } },
    });

    expect(markup).toContain(description);
    expect(markup).toContain('class="whitespace-pre-line');
    expect(markup).toContain("Описание:");
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
      slots: [...slots, wednesdaySlot],
    });

    for (const weekday of ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]) {
      expect(markup).toContain(`<span>${weekday}</span>`);
    }
    const januaryMatches = markup.match(/январь/g);

    expect(januaryMatches).toHaveLength(1);
    expect(markup).toContain(dayLabel(mondayLabel));
    expect(markup).toContain(dayLabel(wednesdayLabel));
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
    expect(markup).not.toContain(dayLabel(mondayLabel));
    expect(markup).toContain(dayLabel(wednesdayLabel));
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

    const januaryMatches = markup.match(/январь/g);
    const februaryMatches = markup.match(/февраль/g);

    expect(markup).toContain("январь / февраль");
    expect(januaryMatches).toHaveLength(1);
    expect(februaryMatches).toHaveLength(1);
    expect(markup).toContain('aria-label="Выбрать вт, 27 января, 1 свободный слот"');
    expect(markup).toContain(">9</span>");
  });

  it("shows a day without slots in the calendar but not as a clickable day", () => {
    const markup = renderView({
      slots: [...slots, wednesdaySlot],
    });

    expect(markup).toContain(">6</span>");
    expect(markup).not.toContain('aria-label="Выбрать вт, 6 января"');
    expect(markup).toContain(dayLabel(mondayLabel));
    expect(markup).toContain(dayLabel(wednesdayLabel));
    expect(markup).not.toContain("19:00");
  });

  it("marks only the active day button as pressed", () => {
    const markup = renderView({
      slots: [...slots, wednesdaySlot],
    });

    const mondayPressed = dayButtonPattern(mondayLabel, true);
    const wednesdayNotPressed = dayButtonPattern(wednesdayLabel, false);
    const pressedDays = markup.match(/aria-pressed="true"/g);

    expect(markup).toMatch(mondayPressed);
    expect(markup).toMatch(wednesdayNotPressed);
    expect(pressedDays).toHaveLength(1);
  });

  it("shows the slots of the explicitly selected day", () => {
    const markup = renderView({
      slots: [...slots, wednesdaySlot],
      selectedDayKey: "2026-01-07",
    });

    const wednesdayPressed = dayButtonPattern(wednesdayLabel, true);
    const mondayNotPressed = dayButtonPattern(mondayLabel, false);

    expect(markup).toContain("19:00");
    expect(markup).not.toContain("16:00");
    expect(markup).toContain("среда, 7 января");
    expect(markup).toMatch(wednesdayPressed);
    expect(markup).toMatch(mondayNotPressed);
  });

  it("keeps the selected slot's day when a different day is selected", () => {
    const markup = renderView({
      slots: [...slots, wednesdaySlot],
      selectedSlot: slots[0],
      selectedDayKey: "2026-01-07",
    });

    const mondayPressed = dayButtonPattern(mondayLabel, true);
    const wednesdayNotPressed = dayButtonPattern(wednesdayLabel, false);

    expect(markup).toContain("16:00");
    expect(markup).not.toContain("19:00");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toMatch(mondayPressed);
    expect(markup).toMatch(wednesdayNotPressed);
  });

  it("keeps the selected slot when its own day is reselected", () => {
    const markup = renderView({
      slots: [...slots, wednesdaySlot],
      selectedSlot: slots[0],
      selectedDayKey: "2026-01-05",
    });
    const mondayPressed = dayButtonPattern(mondayLabel, true);
    const slotPressed = /<button(?=[^>]*aria-pressed="true")[^>]*>16:00<\/button>/;
    const pressedSlots = markup.match(/aria-pressed="true"/g);

    expect(markup).toContain("16:00");
    expect(markup).toContain("16:15");
    expect(markup).not.toContain("19:00");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toMatch(mondayPressed);
    expect(markup).toMatch(slotPressed);
    expect(pressedSlots).toHaveLength(2);
  });

  it("announces the slot count on available days with Russian pluralization", () => {
    const thursdaySlots = Array.from({ length: 5 }, (_, index) => ({
      startAt: new Date(Date.UTC(2026, 0, 8, 7 + index, 0)),
      endAt: new Date(Date.UTC(2026, 0, 8, 7 + index, 15)),
    }));
    const markup = renderView({ slots: [...slots, wednesdaySlot, ...thursdaySlots] });

    expect(markup).toContain(dayLabel(mondayLabel));
    expect(markup).toContain(dayLabel(wednesdayLabel));
    expect(markup).toContain('aria-label="Выбрать чт, 8 января, 5 свободных слотов"');
  });

  it("shows a slot bar only on days with slots that are not selected", () => {
    const markup = renderView({ slots: [...slots, wednesdaySlot] });
    const selectedMarkup = renderView({
      slots: [...slots, wednesdaySlot],
      selectedDayKey: "2026-01-07",
    });

    const mondayButton = dayButtonMarkup(markup, mondayLabel);
    const wednesdayButton = dayButtonMarkup(markup, wednesdayLabel);
    const selectedMondayButton = dayButtonMarkup(selectedMarkup, mondayLabel);
    const selectedWednesdayButton = dayButtonMarkup(selectedMarkup, wednesdayLabel);

    const slotBarSpace = 'class="mt-0.5 flex h-1 justify-center gap-0.5"';

    expect(mondayButton).not.toContain("data-slot-bar");
    expect(wednesdayButton).toContain("data-slot-bar");
    expect(selectedMondayButton).toContain("data-slot-bar");
    expect(selectedWednesdayButton).not.toContain("data-slot-bar");
    expect(mondayButton).toContain(slotBarSpace);
    expect(wednesdayButton).toContain(slotBarSpace);
    expect(selectedMondayButton).toContain(slotBarSpace);
    expect(selectedWednesdayButton).toContain(slotBarSpace);
    expect(wednesdayButton).toContain("bg-available");
  });

  it("announces a day without slots as unavailable without making it focusable", () => {
    const markup = renderView({ slots: [...slots, wednesdaySlot] });

    expect(markup).toContain("вт, 6 января: нет слотов");
    expect(markup).not.toContain('aria-label="Выбрать вт, 6 января"');

    const unavailableDayCell = markup.match(
      /<(\w+)([^>]*class="py-1 text-muted-foreground"[^>]*)>[\s\S]*?вт, 6 января: нет слотов/,
    );

    expect(unavailableDayCell?.[1]).toBe("span");
    expect(unavailableDayCell?.[2]).not.toContain("tabindex");
    expect(unavailableDayCell?.[2]).not.toContain("role=");
  });
});
