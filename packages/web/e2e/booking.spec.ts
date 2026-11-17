import { expect, test } from "@playwright/test";

test("a guest books a free slot and sees the confirmation", async ({ page, request }) => {
  const meetingTypeName = `Booking ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const attendeeName = "Гость E2E";
  const attendeeEmail = "guest-e2e@example.com";

  const createResponse = await request.post("/api/meeting-types", {
    data: {
      name: meetingTypeName,
      description: "Created for the booking E2E",
      durationMinutes: 30,
    },
  });
  expect(createResponse.status()).toBe(201);
  const meetingType = (await createResponse.json()) as { id: string };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Выберите тип встречи" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(meetingTypeName) }).click();

  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
  await expect(page.getByText(`${meetingTypeName} · 30 мин`)).toBeVisible();

  const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await expect(slot).toBeVisible();
  await slot.click();
  await expect(page.locator('[name="attendeeName"]')).toBeVisible();

  const activeDay = page.getByRole("button", { name: /^Выбрать /, pressed: true });
  await activeDay.click();
  await expect(page.locator('[name="attendeeName"]')).toBeVisible();
  await expect(activeDay).toHaveAttribute("aria-pressed", "true");
  await expect(slot).toHaveAttribute("aria-pressed", "true");

  const oldSlotElement = await slot.elementHandle();
  const slotsSection = page.getByRole("region", { name: "Свободные слоты" });
  const activeDayBefore = await slotsSection.getByRole("heading").textContent();

  await page
    .getByRole("button", { name: /^Выбрать / })
    .nth(1)
    .click();

  await expect(page.locator('[name="attendeeName"]')).toHaveCount(0);
  await expect(slotsSection.getByRole("heading")).not.toHaveText(activeDayBefore ?? "");
  expect(await oldSlotElement?.evaluate((element) => element.isConnected)).toBe(false);

  const otherDaySlot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await otherDaySlot.click();
  await expect(page.locator('[name="attendeeName"]')).toBeVisible();

  await page.getByRole("textbox", { name: "Имя" }).fill(attendeeName);
  await page.getByRole("textbox", { name: "E-mail" }).fill(attendeeEmail);

  const bookingResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Забронировать" }).click();

  expect((await bookingResponse).status()).toBe(201);

  const confirmation = page.getByRole("region", { name: "Подтверждение бронирования" });
  await expect(confirmation.getByRole("heading", { name: "Вы записаны" })).toBeVisible();
  await expect(confirmation.getByText(`${attendeeName}, ${attendeeEmail}`)).toBeVisible();
  await expect(confirmation.getByText(new RegExp(`^${meetingTypeName} · `))).toBeVisible();
});
