# Upstream: project 386

This repository continues [`DK-2013/ai-for-developers-project-386`](https://github.com/DK-2013/ai-for-developers-project-386).
Baseline: tag [`v0.3.1`](https://github.com/DK-2013/ai-for-developers-project-386/releases/tag/v0.3.1)
(`4e30df5`, 2026-11-10), imported 2026-11-12.

This file is the only place that keeps the source ticket numbers. It answers "why does this rule
exist" without scattering historical references through living documents.

## What was imported

- Every tracked file from the source tag, verbatim, except `CHANGELOG.md` (release-please rebuilds
  it from this repository's history) and the root version, which already matches `v0.3.1`.
- `README.md` was rebranded for this repository: the badge, clone URL, deployment status, and the
  status paragraph.
- Deliberately not carried: `CHANGELOG.md`, local caches (`.lycheecache`, `.rumdl_cache`,
  `.playwright-mcp`), editor state (`.idea`), generated output (`packages/spec/openapi.json`,
  `packages/server/src/generated/`, `packages/web/src/sdk/`), installed dependencies, build output,
  and `.env`.

Re-importing or re-checking the baseline uses the archive, never a directory copy:

```bash
git -C ../ai-for-developers-project-386 archive v0.3.1 | tar -x -C /tmp/opencode/baseline-386
diff -rq /tmp/opencode/baseline-386 .
```

After the import, the only differences are `README.md` and the absent `CHANGELOG.md`.

## Artifact to source issues

| Artifact | What it holds | Source issues |
|---|---|---|
| `docs/SPEC.md` | product behavior, checkpoints, API table | [386#3][3], [386#5][5], [386#6][6], [386#7][7], [386#8][8], [386#9][9], [386#21][21], [386#25][25], [386#26][26] |
| `GLOSSARY.md` | domain vocabulary | [386#3][3] |
| `docs/adr/0001-slots-are-not-stored.md` | slots are computed; overlap is enforced by PostgreSQL | [386#3][3], [386#4][4], [386#7][7] |
| `docs/adr/0002-wire-time-is-utc-instants.md` | wire time is UTC instants plus the owner zone | [386#3][3], [386#6][6] |
| `docs/adr/0003-quality-gates.md` | which checks gate a change, and deferred ones with triggers | [386#2][2], [386#18][18], [386#36][36] |
| `docs/adr/0004-guest-calendar-renders-in-guest-timezone.md` | guest calendar renders in the guest zone | [386#6][6], [386#17][17] |
| `docs/adr/0005-release-versioning.md` | one release version for the whole repository | [386#10][10] |
| `docs/adr/0006-api-server-serves-the-web-app.md` | the API server serves the built app and owns `/api` | [386#32][32] |
| `docs/adr/0007-runtime-and-standalone-images.md` | `runtime` vs `standalone` images; embedded PostgreSQL | [386#37][37], [386#43][43] |
| `README.md` | deploy, browser MCP, `db:clean`, data reset, release process, environment variables | [386#10][10], [386#13][13], [386#14][14], [386#15][15], [386#17][17], [386#18][18], [386#29][29], [386#32][32], [386#33][33], [386#34][34], [386#35][35], [386#36][36], [386#37][37], [386#43][43] |
| `AGENTS.md`, `CODING_STANDARDS.md` | process rules, Definition of Done, code-level rules | [386#2][2], [386#3][3], [386#9][9], [386#16][16], [386#18][18] |
| `docs/agents/*` | browser checks, domain docs, issue tracker, triage labels | [386#9][9], [386#13][13], [386#17][17] |
| `.github/workflows/*`, `.github/dependabot.yml` | quality, security, release, CI fix, dependency updates | [386#2][2], [386#10][10], [386#18][18], [386#36][36], [386#40][40] |
| `.agents/`, `opencode.json`, `skills-lock.json`, MCP tasks in `mise.toml` | agent skills and browser MCP tooling | [386#13][13], [386#14][14], [386#16][16] |

## Decisions that never reached an ADR

These are recorded in the imported files themselves and are not promoted to ADRs because they are
cheap to reverse, local to tooling, or are product rules that `docs/SPEC.md` already owns:

- **`mise run db:clean`** ([386#29][29]) — tooling, documented in `README.md` and `mise.toml`.
- **CI skip-deps propagation** ([386#36][36]) — `MISE_TASK_SKIP_DEPENDS=1` in `quality.yml`, with
  the reason in a workflow comment and in `README.md`. A CI fix, not an architecture decision.
- **Tabbed owner cabinet and modal creation** ([386#25][25], [386#26][26], [386#27][27]) — product
  behavior, already in `docs/SPEC.md` and `docs/agents/browser-checks.md`.
- **Default meeting type on a fresh database** ([386#21][21]) — a product rule in `docs/SPEC.md`.

## Reference rules

- In documentation, a source ticket is written as `386#N` only inside this file, as a link to the
  old tracker (see the definitions at the bottom). Elsewhere use a full URL, for example in the
  `Source:` line at the end of each ADR.
- Never write a bare `#N`, `Closes #N`, or a trailing `(#N)` that refers to the 386 tracker. This
  repository shares the same number space, so a bare number, and any closing keyword, resolves to a
  ticket here.
- Commit subjects carry ticket numbers of this repository only.
- New work names the artifact it changes (`docs/SPEC.md`, `docs/adr/0007-...`) instead of restating
  the decision; historical context stays here.

[2]: https://github.com/DK-2013/ai-for-developers-project-386/issues/2
[3]: https://github.com/DK-2013/ai-for-developers-project-386/issues/3
[4]: https://github.com/DK-2013/ai-for-developers-project-386/issues/4
[5]: https://github.com/DK-2013/ai-for-developers-project-386/issues/5
[6]: https://github.com/DK-2013/ai-for-developers-project-386/issues/6
[7]: https://github.com/DK-2013/ai-for-developers-project-386/issues/7
[8]: https://github.com/DK-2013/ai-for-developers-project-386/issues/8
[9]: https://github.com/DK-2013/ai-for-developers-project-386/issues/9
[10]: https://github.com/DK-2013/ai-for-developers-project-386/issues/10
[13]: https://github.com/DK-2013/ai-for-developers-project-386/issues/13
[14]: https://github.com/DK-2013/ai-for-developers-project-386/issues/14
[15]: https://github.com/DK-2013/ai-for-developers-project-386/issues/15
[16]: https://github.com/DK-2013/ai-for-developers-project-386/issues/16
[17]: https://github.com/DK-2013/ai-for-developers-project-386/issues/17
[18]: https://github.com/DK-2013/ai-for-developers-project-386/issues/18
[21]: https://github.com/DK-2013/ai-for-developers-project-386/issues/21
[25]: https://github.com/DK-2013/ai-for-developers-project-386/issues/25
[26]: https://github.com/DK-2013/ai-for-developers-project-386/issues/26
[27]: https://github.com/DK-2013/ai-for-developers-project-386/issues/27
[29]: https://github.com/DK-2013/ai-for-developers-project-386/issues/29
[32]: https://github.com/DK-2013/ai-for-developers-project-386/issues/32
[33]: https://github.com/DK-2013/ai-for-developers-project-386/issues/33
[34]: https://github.com/DK-2013/ai-for-developers-project-386/issues/34
[35]: https://github.com/DK-2013/ai-for-developers-project-386/issues/35
[36]: https://github.com/DK-2013/ai-for-developers-project-386/issues/36
[37]: https://github.com/DK-2013/ai-for-developers-project-386/issues/37
[40]: https://github.com/DK-2013/ai-for-developers-project-386/issues/40
[43]: https://github.com/DK-2013/ai-for-developers-project-386/issues/43
