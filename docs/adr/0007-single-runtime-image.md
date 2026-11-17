# One runtime image; the database is optional at startup

The root `Dockerfile` produces one `runtime` image: Node 26, the deployed server with production
dependencies, the built web app, and no PostgreSQL. Compose and Render run it against an external
database through `DATABASE_URL`. The Hexlet check builds the same image without `--target`, starts
it with no database service, and only requires `GET /healthz` to answer `200`.

The server treats an unreachable database as a degraded mode instead of a fatal error. It attempts
migrations and the default seed at startup, then starts the HTTP server even when the database is
unavailable. `/healthz` never touches the database, database-backed routes keep returning their
existing `500`, and a background retry (5 s, 10 s, 20 s, 40 s, then every 60 s) reruns migrations
and the seed once the database becomes reachable. Only connectivity failures are tolerated;
migration and authentication errors still abort startup, so a real bug is not hidden behind a green
liveness check. The PostgreSQL pool logs idle-client errors instead of crashing the process and uses
a connection timeout so startup cannot hang.

**Considered options:** keeping an embedded PostgreSQL in a separate `standalone` stage (dropped:
the check only needs `healthz`, while every other image paid for unused PostgreSQL and a fragile
shell supervisor); requiring `DATABASE_URL` everywhere and accepting a crash without it (the check
does not provide a database); treating every startup database error as recoverable (hides broken
migrations and bad credentials).

**Consequences:** the image is one stage again and `docker build .` needs no `--target`; the
entrypoint, the embedded data directory, and the `/app/data` volume are gone; a deployment whose
database is temporarily unavailable comes up degraded and heals without a restart; a real migration
failure still fails fast.

**Source:** imported from [386#37](https://github.com/DK-2013/ai-for-developers-project-386/issues/37) and [386#43](https://github.com/DK-2013/ai-for-developers-project-386/issues/43) — see `docs/UPSTREAM.md`.
