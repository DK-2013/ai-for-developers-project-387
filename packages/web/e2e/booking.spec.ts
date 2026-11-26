import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { CallCalendarClient } from "@calendar/sdk";

const api = new CallCalendarClient({ allowInsecureConnection: true });

const invalidStartMessage = "Выбранное время недоступно. Пожалуйста, выберите другое время.";

async function createMeetingType(request: APIRequestContext, durationMinutes = 30) {
  const response = await request.post("/api/meeting-types", {
    data: {
      name: `Booking ${Date.now()} ${Math.random().toString(16).slice(2)}`,
      description: "Created for the booking E2E",
      durationMinutes,
    },
  });

  expect(response.status()).toBe(201);

  return (await response.json()) as { id: string; name: string };
}

test("a guest books a free slot on the details step and sees the confirmation", async ({
  page,
  request,
}) => {
  const meetingType = await createMeetingType(request);
  const attendeeName = "Гость E2E";
  const attendeeEmail = "guest-e2e@example.com";
  const description = "😀".repeat(1000);
  const tooLongDescription = "😀".repeat(1001);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Выберите тип встречи" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(meetingType.name) }).click();

  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
  await expect(page.getByText(`${meetingType.name} · 30 мин`)).toBeVisible();
  await expect(page.locator('[name="attendeeName"]')).toHaveCount(0);

  const slot = page.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first();
  const slotTime = (await slot.textContent())?.trim() ?? "";
  expect(slotTime).toMatch(/^\d{2}:\d{2}$/);
  await slot.click();

  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}/details\\?startAt=`));
  await expect(page.getByRole("heading", { name: "Данные для записи" })).toBeVisible();
  await expect(page.getByText(new RegExp(slotTime))).toBeVisible();
  const searchParams = [...new URL(page.url()).searchParams.keys()];
  expect(searchParams).toEqual(["startAt"]);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Данные для записи" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Имя" })).toHaveValue("");

  const descriptionField = page.getByLabel("Описание (необязательно)");
  await expect(descriptionField).not.toHaveAttribute("maxlength");
  await page.getByRole("textbox", { name: "Имя" }).fill(attendeeName);
  await page.getByRole("textbox", { name: "E-mail" }).fill(attendeeEmail);

  await descriptionField.fill(tooLongDescription);
  await expect(page.getByText(/Описание длиннее 1000 символов/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Забронировать" })).toBeDisabled();

  await descriptionField.fill(description);
  await expect(page.getByText("До 1000 символов")).toBeVisible();

  const bookingResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Забронировать" }).click();

  const response = await bookingResponse;
  expect(response.status()).toBe(201);
  const requestBody = JSON.parse(response.request().postData() ?? "{}") as {
    description?: string;
  };
  expect(requestBody.description).toBe(description);

  const confirmation = page.getByRole("region", { name: "Подтверждение бронирования" });
  await expect(confirmation.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  await expect(confirmation.getByText(`${attendeeName}, ${attendeeEmail}`)).toBeVisible();
  await expect(confirmation.getByText(new RegExp(`^${meetingType.name} · `))).toBeVisible();
  await expect(confirmation).toContainText(description);
  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}/details\\?startAt=`));
});

test("the guest can go back explicitly, and browser back clears the old choice", async ({
  page,
  request,
}) => {
  const meetingType = await createMeetingType(request, 15);

  await page.goto(`/book/${meetingType.id}`);
  const slot = page.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first();
  const slotHref = await slot.getAttribute("href");
  expect(slotHref).toBeTruthy();
  await slot.click();

  await expect(page.getByRole("textbox", { name: "Имя" })).toBeVisible();
  await page.getByRole("textbox", { name: "Имя" }).fill("Гость, которого не должно быть");

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
  await expect(page.locator('[name="attendeeName"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first()).not.toHaveAttribute(
    "aria-pressed",
  );

  await page.goto(slotHref ?? "");
  await expect(page.getByRole("textbox", { name: "Имя" })).toHaveValue("");

  await page.getByRole("link", { name: "Назад к выбору времени" }).click();
  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
});

async function expectInvalidStart(page: Page, id: string) {
  await expect(page).toHaveURL(new RegExp(`/book/${id}\\?notice=invalid-start$`));
  await expect(page.getByRole("alert")).toHaveText(invalidStartMessage);
  await expect(page.locator('[name="attendeeName"]')).toHaveCount(0);
}

test("a missing instant returns to the slot grid", async ({ page, request }) => {
  const meetingType = await createMeetingType(request, 15);

  await page.goto(`/book/${meetingType.id}/details`);

  await expectInvalidStart(page, meetingType.id);
});

test("a malformed instant returns to the slot grid", async ({ page, request }) => {
  const meetingType = await createMeetingType(request, 15);

  await page.goto(`/book/${meetingType.id}/details?startAt=not-a-date`);

  await expectInvalidStart(page, meetingType.id);
});

test("a booked instant returns to the slot grid", async ({ page, request }) => {
  const meetingType = await createMeetingType(request, 15);
  const slots = await api.listSlots(meetingType.id);

  if ("code" in slots) {
    throw new Error(`Could not list slots: ${slots.code}`);
  }

  const taken = slots.slots[0];

  if (taken === undefined) {
    throw new Error("No slots available to book");
  }

  const booking = await api.createBooking({
    meetingTypeId: meetingType.id,
    startAt: taken.startAt,
    attendeeName: "Гость-владелец слота",
    attendeeEmail: "taken-e2e@example.com",
  });

  if ("code" in booking) {
    throw new Error(`Could not book the slot: ${booking.code}`);
  }

  await page.goto(
    `/book/${meetingType.id}/details?startAt=${encodeURIComponent(taken.startAt.toISOString())}`,
  );

  await expectInvalidStart(page, meetingType.id);
});
