import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { systemClock } from "./clock.js";
import { loadConfig } from "./config.js";
import { schema } from "./db/schema.js";
import { startServer } from "./start.js";

// Startup must not hang on an unreachable database; liveness has to answer.
const DATABASE_CONNECT_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: DATABASE_CONNECT_TIMEOUT_MS,
  });

  // Idle-client failures must be logged, not emitted as an unhandled event
  // that kills the process while the database is down.
  pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error", error);
  });

  const db = drizzle(pool, { schema });

  await startServer({
    config,
    db,
    clock: systemClock,
  });
}

main().catch((error: unknown) => {
  console.error("Server failed to start", error);
  process.exitCode = 1;
});
