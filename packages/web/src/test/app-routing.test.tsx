import type { MeetingTypeList, SlotList } from "@calendar/sdk";
import { describe, expect, it } from "vitest";
import { detailsSlotsQuery } from "../api/queries";
import { createQueryClient, renderApp } from "./render-app";

const meetingTypes: MeetingTypeList = {
  meetingTypes: [{ id: "intro", name: "Знакомство", durationMinutes: 30 }],
};

describe("app routing", () => {
  it("renders the booking page for a meeting type", () => {
    const markup = renderApp("/book/intro", createQueryClient(meetingTypes));

    expect(markup).toContain("Выбор времени");
    expect(markup).toContain("Знакомство");
  });

  it("opens the details step directly from its address", () => {
    const slotList: SlotList = {
      timezone: "Europe/Moscow",
      windowStart: new Date("2026-01-04T21:00:00Z"),
      windowEnd: new Date("2026-01-18T21:00:00Z"),
      slots: [
        { startAt: new Date("2026-01-05T07:00:00Z"), endAt: new Date("2026-01-05T07:15:00Z") },
      ],
    };
    const queryClient = createQueryClient(meetingTypes);
    queryClient.setQueryData(detailsSlotsQuery("intro").queryKey, slotList);
    const markup = renderApp("/book/intro/details?startAt=2026-01-05T07%3A00%3A00Z", queryClient);

    expect(markup).toContain("Данные для записи");
    expect(markup).toContain('name="attendeeName"');
    expect(markup).toContain('href="/book/intro"');
    expect(markup).toContain("Назад к выбору времени");
  });

  it("lists meeting types on the home page", () => {
    const markup = renderApp("/", createQueryClient(meetingTypes));

    expect(markup).toContain("Знакомство");
    expect(markup).toContain('href="/book/intro"');
  });

  it("follows a meeting type card into the booking page", () => {
    const home = renderApp("/", createQueryClient(meetingTypes));
    const href = home.match(/href="(\/book\/[^"]+)"/)?.[1] ?? "";

    expect(href).not.toBe("");

    const booking = renderApp(href, createQueryClient(meetingTypes));

    expect(booking).toContain("Выбор времени");
    expect(booking).toContain("Знакомство");
  });
});
