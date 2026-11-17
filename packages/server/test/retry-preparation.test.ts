import { afterEach, describe, expect, it, vi } from "vitest";
import { retryPreparation } from "../src/db/retry-preparation.js";

const connectionError = Object.assign(new Error("connect ECONNREFUSED"), {
  code: "ECONNREFUSED",
});

afterEach(() => {
  vi.useRealTimers();
});

describe("retryPreparation", () => {
  it("retries with backoff and stops after the database becomes available", async () => {
    vi.useFakeTimers();
    const prepare = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(connectionError)
      .mockRejectedValueOnce(connectionError)
      .mockResolvedValueOnce(undefined);
    const logger = {
      error: vi.fn<(message: string, error: unknown) => void>(),
      info: vi.fn<(message: string) => void>(),
    };
    const retry = retryPreparation({ prepare, logger });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(prepare).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(prepare).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenCalledWith(
      "Database connection restored; migrations and seed completed",
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(prepare).toHaveBeenCalledTimes(3);

    retry.stop();
  });

  it("stops scheduling attempts when stopped", async () => {
    vi.useFakeTimers();
    const prepare = vi.fn<() => Promise<void>>().mockRejectedValue(connectionError);
    const logger = {
      error: vi.fn<(message: string, error: unknown) => void>(),
      info: vi.fn<(message: string) => void>(),
    };
    const retry = retryPreparation({ prepare, logger });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(prepare).toHaveBeenCalledTimes(1);

    retry.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(prepare).toHaveBeenCalledTimes(1);
  });
});
