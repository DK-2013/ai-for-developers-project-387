import { expect, test } from "@playwright/test";

test.use({ timezoneId: "UTC" });

test("a day across the month boundary is reachable and shows its own slots", async ({
  page,
  request,
}) => {
  const name = `Boundary ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const createResponse = await request.post("/api/meeting-types", {
    data: { name, durationMinutes: 30 },
  });
  expect(createResponse.status()).toBe(201);
  const meetingType = (await createResponse.json()) as { id: string };

  await page.route("**/api/meeting-types/*/slots", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        timezone: "Europe/Moscow",
        windowStart: "2026-01-26T00:00:00Z",
        windowEnd: "2026-02-09T00:00:00Z",
        slots: [
          {
            startAt: "2026-01-31T10:00:00Z",
            endAt: "2026-01-31T10:30:00Z",
          },
          {
            startAt: "2026-01-31T11:00:00Z",
            endAt: "2026-01-31T11:30:00Z",
          },
          {
            startAt: "2026-02-01T15:00:00Z",
            endAt: "2026-02-01T15:30:00Z",
          },
        ],
      }),
    });
  });

  await page.goto(`/book/${meetingType.id}`);
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();

  const table = page.getByRole("table", { name: "Дни окна бронирования" });
  await expect(table.getByText("31 янв")).toBeVisible();
  await expect(table.getByText("1 февр")).toBeVisible();

  const january = page.getByRole("button", { name: "суббота, 31 января" });
  const february = page.getByRole("button", { name: "воскресенье, 1 февраля" });
  await expect(january).toHaveAttribute("aria-pressed", "true");

  const slotsRegion = page.getByRole("region", { name: "Слоты выбранного дня" });
  await expect(slotsRegion.getByRole("heading", { name: "суббота, 31 января" })).toBeVisible();
  await expect(slotsRegion.getByRole("button", { name: "10:00" })).toBeVisible();

  await february.click();

  await expect(february).toHaveAttribute("aria-pressed", "true");
  await expect(slotsRegion.getByRole("heading", { name: "воскресенье, 1 февраля" })).toBeVisible();
  await expect(slotsRegion.getByRole("button", { name: "15:00" })).toBeVisible();
  await expect(slotsRegion.getByRole("button", { name: "10:00" })).toHaveCount(0);

  await january.click();

  await expect(slotsRegion.getByRole("heading", { name: "суббота, 31 января" })).toBeVisible();
  await expect(slotsRegion.getByRole("button", { name: "10:00" })).toBeVisible();
  await expect(slotsRegion.getByRole("button", { name: "15:00" })).toHaveCount(0);
});
