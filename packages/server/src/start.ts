import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequestHandler } from "./app.js";
import type { Clock } from "./clock.js";
import type { Config } from "./config.js";
import { isDatabaseUnavailable } from "./db/availability.js";
import { prepareDatabase } from "./db/prepare-database.js";
import { retryPreparation, type PreparationRetry } from "./db/retry-preparation.js";
import type { Database } from "./db/schema.js";
import { createHttpHandler } from "./http.js";
import type { Logger } from "./logging.js";
import { createWebHandler } from "./web.js";

export type StartServerDependencies = {
  config: Config;
  db: Database;
  clock: Clock;
  /** Test seam; production listens on `config.port`. */
  port?: number;
  logger?: Logger;
};

export type RunningServer = {
  server: Server;
  stop(): Promise<void>;
};

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Starts the HTTP server even when PostgreSQL is unreachable. Liveness stays
 * green, database-backed routes report their errors, and preparation is
 * retried in the background until the database becomes available.
 */
export async function startServer({
  config,
  db,
  clock,
  port = config.port,
  logger = console,
}: StartServerDependencies): Promise<RunningServer> {
  if (config.webDist !== undefined && !existsSync(config.webDist)) {
    throw new Error(`WEB_DIST points to a missing directory: ${config.webDist}`);
  }

  let prepared = false;

  try {
    await prepareDatabase(db, { migrateOnStart: config.migrateOnStart });
    prepared = true;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      throw new Error("Prepare database on startup", { cause: error });
    }

    logger.error("Database is unavailable; starting without it", error);
  }

  const server = createServer(
    createHttpHandler({
      api: createRequestHandler({ db, owner: config.owner, clock }),
      web: config.webDist === undefined ? undefined : createWebHandler(config.webDist),
    }),
  );

  await listen(server, port);

  const address = server.address();
  const boundPort = typeof address === "object" && address !== null ? address.port : port;

  logger.info(`Server listening on http://localhost:${boundPort}`);

  let retry: PreparationRetry | undefined;

  if (!prepared) {
    retry = retryPreparation({
      prepare: () => prepareDatabase(db, { migrateOnStart: config.migrateOnStart }),
      logger,
    });
  }

  return {
    server,
    async stop(): Promise<void> {
      retry?.stop();
      await close(server);
    },
  };
}
