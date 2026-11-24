# AGENTS.md

## Overview

Call Calendar — a pnpm monorepo with a TypeSpec API contract (`packages/spec`), a Node.js server (`packages/server`), and a React web app (`packages/web`). No imports between server and web.

## Agent rules

- **The aggregate check command is `mise run check`.** It must pass before a change is done. CI runs `mise run verify` (the full gate with build and browser tests). Generated files are never edited by hand.
- **Generated code is read-only.** `packages/spec/openapi.json`, `packages/server/src/generated/`, and `packages/web/src/sdk/` are produced by `mise run codegen` from `packages/spec/main.tsp`. Change the source, regenerate, and commit only the source change.
- **Lint rules are never disabled to get a change through.** Exceptions are narrow, carry a `review YYYY-MM-DD: <reason>` marker, and need a human decision. See `CODING_STANDARDS.md` for the exception mechanism.
- **Use the easement skill** before adding a file or an import and whenever `easement check` fails.
- **After changing code, run `easement check`; it must exit 0.**
- **Never edit `easement.yml`, regenerate the baseline or add an `easement:disable` comment without asking a human.**

## Rules

- Fix the cause, not the symptom.
- Simplest implementation that meets requirements.
- No backward-compatibility preservation.

## Precedence

1. `packages/spec/main.tsp` — API shape.
2. `docs/SPEC.md` — product behavior.
3. `CODING_STANDARDS.md` — implementation rules.

Conflicting sources: stop and report, never choose silently.

## Structure

pnpm monorepo: `packages/spec` (TypeSpec contract), `packages/server` (node:http, Drizzle, PostgreSQL), `packages/web` (React, Vite). No imports between server and web; no circular imports.

## Contract

`main.tsp` is the only API source of truth; `openapi.json`, `generated/`, `sdk/` are generated. Map wire → domain → DB/view at the boundaries; never hand-write wire DTOs.

## Commands

Discover via `mise tasks` / `mise.toml` / `hk.toml`. Key gates: `mise run check` while iterating, `mise run verify` before pushing. Implementation standards: `CODING_STANDARDS.md`.

## Hard rules

- Generated codegen output is read-only.
- Booking/overlap tests run against real PostgreSQL.
- Tests inject a clock or use fake timers.
- `.github/workflows/hexlet-check.yml` is read-only.
- Lint exceptions only via the documented review-dated mechanism.

## Stop and ask

- changing `main.tsp` / public API, schema or migrations;
- new dependency or package;
- changing rules in this file or `CODING_STANDARDS.md`;
- conflicting sources; working around an unrelated failing check.

## Conventions

Commits: Conventional Commits, lines ≤ 100 chars, ticketed commits end with `(#N)`; linear history. Docs for users in Russian; code and agent docs in English.

In the GitHub Actions edit run (`.github/workflows/interactive.yml`) commit the change yourself on the checked-out branch, with a Conventional Commits message and nothing left uncommitted. There is no mise there: use pnpm scripts, and a `commit-msg` hook runs commitlint before the commit is created. Do not create or switch branches: otherwise OpenCode commits its own summary under 40 characters, which cannot be configured and fails commitlint. When you rewrite an already-pushed commit, push it yourself with `git push --force-with-lease`; the final push OpenCode makes is not forced.

## Pointers

- Browser verification checklist: `docs/agents/browser-checks.md`.
- Issues (`gh` CLI): `docs/agents/issue-tracker.md`; triage labels: `docs/agents/triage-labels.md`.
- Domain model: `GLOSSARY.md` + `docs/adr/`, see `docs/agents/domain.md`.
- Import provenance and the source ticket mapping: `docs/UPSTREAM.md`.
