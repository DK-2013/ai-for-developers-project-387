import type { Booking, Slot } from "@calendar/sdk";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  BookingDetailsView,
  type BookingDetailsForm,
  type BookingDetailsViewProps,
} from "../components/booking-details-view";
import { codePointLength } from "../lib/booking-details";

const guestTimeZone = "Asia/Tokyo";
const backHref = "/book/intro";

const slot: Slot = {
  startAt: new Date("2026-01-05T07:00:00Z"),
  endAt: new Date("2026-01-05T07:15:00Z"),
};

const booking: Booking = {
  id: "00000000-0000-4000-8000-000000000010",
  meetingTypeId: "00000000-0000-4000-8000-000000000001",
  meetingTypeName: "Знакомство",
  startAt: slot.startAt,
  endAt: slot.endAt,
  attendeeName: "Гость",
  attendeeEmail: "guest@example.com",
};

function renderView(
  overrides: Partial<Extract<BookingDetailsViewProps, { status: "ready" }>> = {},
): string {
  const props: Extract<BookingDetailsViewProps, { status: "ready" }> = {
    status: "ready",
    meetingType: { name: "Знакомство", durationMinutes: 15 },
    backHref,
    slot,
    guestTimeZone,
    form: { status: "idle" },
    onSubmit: () => {},
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter>
      <BookingDetailsView {...props} />
    </MemoryRouter>,
  );
}

function withForm(form: BookingDetailsForm): string {
  return renderView({ form });
}

describe("booking details view", () => {
  it("shows the chosen day and time in the guest zone above an empty form", () => {
    const markup = renderView();

    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain("16:00");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).not.toContain("value=");
  });

  it("has an explicit link back to the time grid", () => {
    const markup = renderView();

    expect(markup).toContain(`href="${backHref}"`);
    expect(markup).toContain("Назад к выбору времени");
  });

  it("keeps the description rules visible", () => {
    const markup = renderView();
    const textarea = /<textarea[^>]*name="description"[^>]*>/.exec(markup)?.[0] ?? "";

    expect(textarea).not.toContain("maxLength");
    expect(textarea).not.toContain("required");
    expect(markup).toContain("До 1000 символов");
    expect(codePointLength("😀".repeat(1000))).toBe(1000);
  });

  it("disables the submit button while submitting", () => {
    const markup = withForm({ status: "submitting" });

    expect(markup).toContain("disabled");
    expect(markup).toContain("Бронирование...");
  });

  it("shows the conflict message with a link back to the time grid", () => {
    const markup = withForm({
      status: "error",
      message: "Это время уже занято. Пожалуйста, выберите другой слот.",
    });

    expect(markup).toContain("Это время уже занято. Пожалуйста, выберите другой слот.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Выбрать другое время");
    expect(markup).toContain(`href="${backHref}"`);
    expect(markup).toContain('name="attendeeName"');
  });

  it("shows the confirmation on the details step instead of the form", () => {
    const markup = withForm({ status: "success", booking });

    expect(markup).toContain("Вы записаны");
    expect(markup).toContain("Знакомство");
    expect(markup).toContain("понедельник, 5 января");
    expect(markup).toContain("16:00");
    expect(markup).toContain("Гость");
    expect(markup).toContain("guest@example.com");
    expect(markup).toContain('aria-label="Подтверждение бронирования"');
    expect(markup).not.toContain('name="attendeeName"');
  });

  it("shows the submitted description with preserved line breaks", () => {
    const description = "Уточнить график\nПрислать документы";
    const markup = withForm({
      status: "success",
      booking: { ...booking, description },
    });

    expect(markup).toContain(description);
    expect(markup).toContain('class="whitespace-pre-line');
    expect(markup).toContain("Описание:");
  });

  it("shows loading and error states without a form", () => {
    const loading = renderToStaticMarkup(
      <MemoryRouter>
        <BookingDetailsView status="loading" backHref={backHref} />
      </MemoryRouter>,
    );
    const failed = renderToStaticMarkup(
      <MemoryRouter>
        <BookingDetailsView status="error" backHref={backHref} message="Не удалось загрузить" />
      </MemoryRouter>,
    );

    expect(loading).toContain("Загрузка...");
    expect(loading).not.toContain('name="attendeeName"');
    expect(failed).toContain("Не удалось загрузить");
    expect(failed).not.toContain('name="attendeeName"');
  });
});
