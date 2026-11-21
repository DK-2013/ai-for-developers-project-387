import { expect, test, type Page } from "@playwright/test";

const CONFLICT_MESSAGE = "Это время уже занято. Пожалуйста, выберите другой слот.";

async function openBookingPage(page: Page, meetingTypeId: string): Promise<void> {
  await page.goto(`/book/${meetingTypeId}`);
  await expect(page.getByRole("heading", { name: "Выбор времени" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first()).toBeVisible();
}

async function slotLabels(page: Page): Promise<string[]> {
  const buttons = page.getByRole("button", { name: /^\d{2}:\d{2}$/ });
  const labels = await buttons.allTextContents();

  return labels.map((label) => label.trim());
}

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

test("a guest who loses the race sees the conflict, and the message survives the slot refresh", async ({
  browser,
  request,
}) => {
  const meetingTypeName = `Conflict ${Date.now()} ${Math.random().toString(16).slice(2)}`;
  const createResponse = await request.post("/api/meeting-types", {
    data: { name: meetingTypeName, durationMinutes: 15 },
  });

  expect(createResponse.status()).toBe(201);
  const meetingType = (await createResponse.json()) as { id: string };

  const winnerContext = await browser.newContext();
  const loserContext = await browser.newContext();
  const winner = await winnerContext.newPage();
  const loser = await loserContext.newPage();

  try {
    // Both guests load the slot list before either books, so the loser keeps a stale
    // list and has to discover the conflict on submit.
    await openBookingPage(winner, meetingType.id);
    await openBookingPage(loser, meetingType.id);

    const winnerSlots = await slotLabels(winner);
    const loserSlots = await slotLabels(loser);
    const sharedSlotLabel = winnerSlots.find((label) => loserSlots.includes(label));

    expect(sharedSlotLabel).toBeDefined();

    await winner.getByRole("button", { name: sharedSlotLabel, exact: true }).click();
    await loser.getByRole("button", { name: sharedSlotLabel, exact: true }).click();
    await expect(winner.locator('[name="attendeeName"]')).toBeVisible();
    await expect(loser.locator('[name="attendeeName"]')).toBeVisible();

    await fillAttendee(winner, "Гость-победитель", "winner-e2e@example.com");
    await fillAttendee(loser, "Гость-опоздавший", "loser-e2e@example.com");

    const winnerResponse = bookingRequest(winner);
    await winner.getByRole("button", { name: "Забронировать" }).click();
    const booked = await winnerResponse;

    expect(booked.status()).toBe(201);
    const booking = (await booked.json()) as { startAt: string };

    const refresh = loser.waitForResponse(
      (response) => response.url().includes("/slots") && response.request().method() === "GET",
    );
    const loserResponse = bookingRequest(loser);
    await loser.getByRole("button", { name: "Забронировать" }).click();

    expect((await loserResponse).status()).toBe(409);
    await expect(loser.getByRole("alert")).toHaveText(CONFLICT_MESSAGE);
    await expect(loser.locator('[name="attendeeName"]')).toHaveCount(0);

    // The page refetches the slots right after the conflict. Reconcile must not wipe
    // the message, and the booked instant must be gone from the refreshed list.
    const refreshed = await refresh;
    const refreshedBody = (await refreshed.json()) as { slots: { startAt: string }[] };
    const refreshedStarts = refreshedBody.slots.map((slot) => Date.parse(slot.startAt));

    expect(refreshedStarts).not.toContain(Date.parse(booking.startAt));
    await expect(loser.getByRole("alert")).toHaveText(CONFLICT_MESSAGE);
  } finally {
    await winnerContext.close();
    await loserContext.close();
  }
});
