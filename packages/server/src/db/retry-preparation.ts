import type { Logger } from "../logging.js";
import { isDatabaseUnavailable } from "./availability.js";

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

export type PreparationRetryOptions = {
  prepare: () => Promise<void>;
  logger: Logger;
};

export type PreparationRetry = {
  stop(): void;
};

/**
 * Keeps retrying migrations and the seed after a startup connection failure.
 * The HTTP server already serves `/healthz`, so a deployment with a temporary
 * database outage heals without a restart.
 */
export function retryPreparation({ prepare, logger }: PreparationRetryOptions): PreparationRetry {
  let attempt = 0;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  function schedule(): void {
    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;

    timer = setTimeout(() => {
      timer = undefined;
      void retry();
    }, delay);
    timer.unref();
  }

  async function retry(): Promise<void> {
    try {
      await prepare();
      logger.info("Database connection restored; migrations and seed completed");
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        logger.error("Database is still unavailable; retrying", error);
      } else {
        logger.error("Database preparation failed; retrying", error);
      }

      if (!stopped) {
        schedule();
      }
    }
  }

  schedule();

  return {
    stop(): void {
      stopped = true;

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
