# Two Docker targets: `runtime` and `standalone`

The root `Dockerfile` produces two images. `runtime` is the slim production image: Node 26, the
deployed server with production dependencies, the built web app, no PostgreSQL. Compose
(`target: runtime`) and Render use it with an external database. `standalone` is `FROM runtime` plus
PostgreSQL 16 and `docker/entrypoint.sh`: when `DATABASE_URL` is set the entrypoint executes the
command directly, otherwise it initializes `/app/data/pg`, starts a local PostgreSQL, creates
`call_calendar`, runs the app, and stops the database on exit. It must stay the last stage because
the Hexlet check builds the root `Dockerfile` without `--target` and runs the image with only
`PORT` set and no database service.

The split exists because that external check needs a self-contained image while every other
environment would otherwise pay for an unused database and a fragile supervisor.

**Considered options:** one fat runtime stage (simplest, but every deployment carries ~42 MiB of
PostgreSQL it does not use, and `docker stop` killed the embedded database after the timeout);
a separate `Dockerfile` for the check (the check builds the root file, so it cannot be selected);
requiring `DATABASE_URL` everywhere and dropping the embedded database (the check does not provide
one).

**Consequences:** `docker build .` without `--target` yields the self-contained image; Compose must
name `target: runtime`; the entrypoint is shell and is checked by hadolint and shellcheck; embedded
data lives in the container and needs a volume on `/app/data` to survive.

**Source:** imported from [386#37](https://github.com/DK-2013/ai-for-developers-project-386/issues/37) and [386#43](https://github.com/DK-2013/ai-for-developers-project-386/issues/43) — see `docs/UPSTREAM.md`.
