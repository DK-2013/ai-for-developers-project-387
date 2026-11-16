import { expect, test, type APIRequestContext } from "@playwright/test";

async function createMeetingType(
  request: APIRequestContext,
  name: string,
): Promise<{ id: string }> {
  const response = await request.post("/api/meeting-types", {
    data: {
      name,
      description: "Created for the booking E2E",
      durationMinutes: 30,
    },
  });

  expect(response.status()).toBe(201);

  return (await response.json()) as { id: string };
}

test("a guest books a free slot and sees the confirmation", async ({ page, request }) => {
  const meetingTypeName = `Booking ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const attendeeName = "Гость E2E";
  const attendeeEmail = "guest-e2e@example.com";
  const meetingType = await createMeetingType(request, meetingTypeName);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Выберите тип встречи" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(meetingTypeName) }).click();

  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
  await expect(page.getByText(`${meetingTypeName} · 30 мин`)).toBeVisible();

  const slot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await expect(slot).toBeVisible();
  await slot.click();

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

test("the guest day grid is split into weeks with Monday-Sunday labels", async ({
  page,
  request,
}) => {
  const meetingTypeName = `Days ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const meetingType = await createMeetingType(request, meetingTypeName);

  await page.goto(`/book/${meetingType.id}`);
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();

  const table = page.getByRole("table", { name: "Дни окна бронирования" });
  await expect(table).toBeVisible();

  for (const label of ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]) {
    await expect(table.getByRole("columnheader", { name: label })).toBeVisible();
  }

  const weeks = table.locator("tbody tr");
  expect(await weeks.count()).toBeGreaterThan(1);

  for (const week of await weeks.all()) {
    expect(await week.locator("td").count()).toBe(7);
  }
});

test("switching days changes the heading and slots and clears the selection and form", async ({
  page,
  request,
}) => {
  const meetingTypeName = `Switch ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const meetingType = await createMeetingType(request, meetingTypeName);

  await page.goto(`/book/${meetingType.id}`);
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();

  const table = page.getByRole("table", { name: "Дни окна бронирования" });
  const enabledDays = table.locator("button:not([disabled])");
  await expect(enabledDays.nth(1)).toBeVisible();
  expect(await enabledDays.count()).toBeGreaterThan(1);

  const slotsRegion = page.getByRole("region", { name: "Слоты выбранного дня" });
  const dayHeading = slotsRegion.getByRole("heading", { level: 2 });
  const firstHeading = await dayHeading.textContent();

  const firstSlot = slotsRegion.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await firstSlot.click();
  await expect(firstSlot).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("textbox", { name: "Имя" }).fill("Гость смены дня");
  await page.getByRole("textbox", { name: "E-mail" }).fill("day-switch@example.com");

  await enabledDays.nth(1).click();

  await expect(dayHeading).not.toHaveText(firstHeading ?? "");
  await expect(enabledDays.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(slotsRegion.getByRole("textbox", { name: "Имя" })).toHaveCount(0);
  await expect(slotsRegion.locator('button[aria-pressed="true"]')).toHaveCount(0);
});
