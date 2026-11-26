import { expect, test, type Page } from "@playwright/test";
import { CallCalendarClient } from "@calendar/sdk";

const api = new CallCalendarClient({ allowInsecureConnection: true });

const conflictMessage = "Это время уже занято. Пожалуйста, выберите другой слот.";

async function fillAttendee(page: Page, name: string, email: string): Promise<void> {
  await page.getByRole("textbox", { name: "Имя" }).fill(name);
  await page.getByRole("textbox", { name: "E-mail" }).fill(email);
}

function bookingRequest(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/bookings") && response.request().method() === "POST",
  );
}

test("a guest who loses the race keeps the details form and its values", async ({ browser }) => {
  const meetingTypeName = `Conflict ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const created = await api.createMeetingType({ name: meetingTypeName, durationMinutes: 15 });

  if ("code" in created) {
    throw new Error(`Could not create a meeting type: ${created.code}`);
  }

  const meetingType = created;

  const winnerContext = await browser.newContext();
  const loserContext = await browser.newContext();
  const winner = await winnerContext.newPage();
  const loser = await loserContext.newPage();

  try {
    await winner.goto(`/book/${meetingType.id}`);
    await loser.goto(`/book/${meetingType.id}`);
    await expect(winner.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
    await expect(loser.getByRole("heading", { name: "Выбор времени" })).toBeVisible();

    const slot = winner.getByRole("link", { name: /^\d{2}:\d{2}$/ }).first();
    const slotHref = await slot.getAttribute("href");
    expect(slotHref).toBeTruthy();

    await slot.click();
    await loser.goto(slotHref ?? "");
    await expect(winner.locator('[name="attendeeName"]')).toBeVisible();
    await expect(loser.locator('[name="attendeeName"]')).toBeVisible();

    await fillAttendee(winner, "Гость-победитель", "winner-e2e@example.com");
    await fillAttendee(loser, "Гость-опоздавший", "loser-e2e@example.com");

    const winnerResponse = bookingRequest(winner);
    await winner.getByRole("button", { name: "Забронировать" }).click();
    const booked = await winnerResponse;

    expect(booked.status()).toBe(201);
    const startAt = new Date(new URL(winner.url()).searchParams.get("startAt") ?? "");
    const hasStartAt = Number.isFinite(startAt.getTime());
    expect(hasStartAt).toBeTruthy();

    const loserResponse = bookingRequest(loser);
    await loser.getByRole("button", { name: "Забронировать" }).click();

    expect((await loserResponse).status()).toBe(409);
    await expect(loser).toHaveURL(new RegExp(`/book/${meetingType.id}/details\\?startAt=`));
    await expect(loser.getByRole("alert")).toHaveText(conflictMessage);
    await expect(loser.getByRole("link", { name: "Выбрать другое время" })).toBeVisible();
    await expect(loser.getByRole("textbox", { name: "Имя" })).toHaveValue("Гость-опоздавший");
    await expect(loser.getByRole("textbox", { name: "E-mail" })).toHaveValue(
      "loser-e2e@example.com",
    );
    await expect(loser.getByRole("region", { name: "Подтверждение бронирования" })).toHaveCount(0);

    await loser.getByRole("link", { name: "Выбрать другое время" }).click();

    await expect(loser.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
    await expect(loser.locator('[name="attendeeName"]')).toHaveCount(0);

    const refreshed = await api.listSlots(meetingType.id);

    if ("code" in refreshed) {
      throw new Error(`Could not refresh slots: ${refreshed.code}`);
    }

    const refreshedStarts = refreshed.slots.map((entry) => entry.startAt.getTime());

    expect(refreshedStarts).not.toContain(startAt.getTime());
  } finally {
    await winnerContext.close();
    await loserContext.close();
  }
});
