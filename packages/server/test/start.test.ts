import type { AddressInfo } from "node:net";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";
import { schema } from "../src/db/schema.js";
import { startServer, type RunningServer } from "../src/start.js";

const DATABASE_URL = "postgres://127.0.0.1:1/call_calendar";
const FIXED_NOW = new Date("2026-01-01T10:00:00.000Z");

let pool: Pool;
let running: RunningServer;
let baseUrl: string;

beforeAll(async () => {
  pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 500 });
  const db = drizzle(pool, { schema });
  const config = parseConfig({ DATABASE_URL });
  const logger = {
    error: vi.fn<(message: string, error: unknown) => void>(),
    info: vi.fn<(message: string) => void>(),
  };

  running = await startServer({
    config,
    db,
    clock: () => FIXED_NOW,
    port: 0,
    logger,
  });

  const address = running.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await running.stop();
  await pool.end();
});

describe("server started without a database", () => {
  it("answers the liveness check with 200", async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("reports a database-backed route as an internal error instead of crashing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const response = await fetch(`${baseUrl}/meeting-types`);
      const body: unknown = await response.json();

      expect(response.status).toBe(500);
      expect(body).toEqual({ message: "Internal Server Error" });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps serving after the database error", async () => {
    const response = await fetch(`${baseUrl}/healthz`);

    expect(response.status).toBe(200);
  });
});
