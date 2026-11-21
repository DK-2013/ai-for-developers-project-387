# LHCI 0.16.1: report shape, artifact and reading budget failures

Research for [#35](https://github.com/DK-2013/ai-for-developers-project-387/issues/35), part of the
daily Lighthouse map ([#34](https://github.com/DK-2013/ai-for-developers-project-387/issues/34)).

Everything below was checked against the published `@lhci/cli@0.16.1` tarball
(<https://registry.npmjs.org/@lhci/cli/0.16.1>) and the matching tag
(<https://github.com/GoogleChrome/lighthouse-ci/tree/v0.16.1>). The tagged sources are byte-identical
to the files inside the tarball (`diff` on all of `src/`), so the permalinks below describe the
installed code. Behaviour marked **verified** was reproduced locally on Node 26.13.0 with Chromium
156 against four local URLs, three runs each.

## TL;DR

- Four URLs need **one** `ci.collect.url` array and **one** `ci.assert.assertions` block. `assert`
  groups collected LHRs by URL and applies the same assertions to every group, so `assertMatrix` is
  not needed and cannot be combined with top-level `assertions`.
- `lhci collect` writes only `lhr-<ts>-<rand>.json` + `lhr-<ts>-<rand>.html` pairs into
  `.lighthouseci/`. There is **no** `manifest.json` and **no** median file there.
- The HTML report already exists after `collect` — one self-contained file per run. No server and no
  extra step are required.
- `lhci assert` writes `.lighthouseci/assertion-results.json`: an array of assertion results with
  `expected`, `actual`, `values[]` (per-run), `operator`, `passed`, `level`, `auditId`,
  `auditProperty`, `url`. `actual` is the aggregated value, `values` holds every run.
- Default aggregation is `optimistic`, **not** median. The map asks for a median, so the config must
  set `"aggregationMethod": "median"`.
- Both a budget failure and an infrastructure failure exit `1`. They are told apart by files:
  budget failure ⇒ `assertion-results.json` with `passed: false, level: "error"` entries;
  infrastructure failure ⇒ no new `lhr-*.json` at all.
- `assert` on an empty `.lighthouseci/` exits **0** (`Checking assertions against 0 URL(s)`), so the
  workflow must gate on the number of collected LHRs, not on `assert` alone.

## 1. Minimal `.lighthouserc.json`

Seven budgets from the map, mobile, three runs, four URLs. `APP_URL` is substituted by the caller.

```json
{
  "ci": {
    "collect": {
      "url": [
        "https://APP_URL/",
        "https://APP_URL/owner",
        "https://APP_URL/owner/meeting-types",
        "https://APP_URL/book/1"
      ],
      "numberOfRuns": 3,
      "settings": {
        "maxWaitForLoad": 45000
      }
    },
    "assert": {
      "aggregationMethod": "median",
      "includePassedAssertions": true,
      "assertions": {
        "categories:performance": ["error", {"minScore": 0.8}],
        "categories:accessibility": ["error", {"minScore": 0.9}],
        "categories:best-practices": ["error", {"minScore": 0.9}],
        "categories:seo": ["error", {"minScore": 0.9}],
        "largest-contentful-paint": ["error", {"maxNumericValue": 2500}],
        "cumulative-layout-shift": ["error", {"maxNumericValue": 0.1}],
        "total-blocking-time": ["error", {"maxNumericValue": 300}]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": "./lhci-reports"
    }
  }
}
```

Why each piece:

- `collect.url` is declared as an array ("An array of the URLs that you'd like Lighthouse CI to
  collect results from"), and the CLI accepts a string or an array
  ([configuration.md#url](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#url),
  [`collect.js#L156`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/collect.js#L156)).
- `numberOfRuns` defaults to `3` anyway, but the map's contract is explicit, so keep it
  ([`collect.js#L88-L93`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/collect.js#L88-L93)).
- **Mobile is the Lighthouse default.** `settings: {formFactor: "mobile"}` is accepted but redundant
  with the default;
  `"desktop"` without a matching `screenEmulation` aborts the run with
  `Screen emulation mobile setting (true) does not match formFactor setting (desktop)`
  ([Lighthouse emulation docs](https://github.com/GoogleChrome/lighthouse/blob/main/docs/emulation.md),
  **verified**). Leave `formFactor` out and the LHR records
  `configSettings.formFactor: "mobile"` with mobile `screenEmulation` — **verified**.
- `settings` are passed to the Lighthouse CLI as `--cli-flags-path` JSON
  ([`node-runner.js#L62-L68`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/node-runner.js#L62-L68));
  `port`, `auditMode`, `gatherMode`, `output`, `outputPath`, `channel` are reserved and stripped
  ([configuration.md#settings](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#settings)).
- `aggregationMethod` is a documented `ci.assert` option, and the default when omitted is
  `optimistic`, i.e. the run most likely to pass
  ([configuration.md#aggregation-methods](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#aggregation-methods),
  [`assertions.js#L169`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L169)).
  For `maxNumericValue`, `optimistic` takes the **minimum** across runs; for `minScore` it takes the
  **maximum** ([`assertions.js#L86-L98`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L86-L98)).
  A top-level `aggregationMethod: "median"` overrides it for all seven assertions, and a per-assertion
  `{"aggregationMethod": "..."}` still wins — both **verified** against runs whose LCP values differed
  (`values: [700.3505, 694.333, 702.3]`, `actual: 700.3505`).
- `includePassedAssertions: true` makes `assertion-results.json` contain all 7 × 4 rows instead of
  only failures, which is what a "budget / fact" table needs
  ([configuration.md#includepassedassertions](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#includepassedassertions)).
  It does not change the exit code.
- **`assertMatrix` is not needed.** `assert` groups LHRs by final URL and applies the assertion set
  to each group ([`assertions.js#L535-L536`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L535-L536)),
  and the CLI reports `Checking assertions against 4 URL(s), 12 total run(s)` — **verified**.
  `assertMatrix` exists only to use *different* thresholds per URL pattern
  ([configuration.md#assertmatrix](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#assertmatrix));
  combining it with `assertions`, `preset`, `budgetsFile` or `aggregationMethod` throws
  `Cannot use assertMatrix with other options`
  ([`assertions.js#L540-L543`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L540-L543), **verified**).
- Units: `maxNumericValue` compares `audit.numericValue`. LCP and TBT carry milliseconds
  ([`largest-contentful-paint.js#L92`](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/core/audits/metrics/largest-contentful-paint.js#L92),
  [`total-blocking-time.js#L116`](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/core/audits/metrics/total-blocking-time.js#L116));
  CLS is unitless
  ([`cumulative-layout-shift.js#L77`](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/core/audits/metrics/cumulative-layout-shift.js#L77)).
  `4000` in `maxNumericValue` therefore means 4 s, and `0.1` for CLS is the literal score.

Config file names are tried in this order, first match wins: `.lighthouserc.cjs`, `lighthouserc.cjs`,
`.lighthouserc.mjs`, `lighthouserc.mjs`, `.lighthouserc.js`, `lighthouserc.js`, `.lighthouserc.json`,
`lighthouserc.json`, `.lighthouserc.yml`, `lighthouserc.yml`, `.lighthouserc.yaml`,
`lighthouserc.yaml` ([`lighthouserc.js#L22-L35`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/lighthouserc.js#L22-L35)).

## 2. What lands in `.lighthouseci/`

The directory is always `<cwd>/.lighthouseci`
([`saved-reports.js#L10-L14`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/saved-reports.js#L10-L14)).
After `collect` + `assert` on the config above, **verified** contents:

| File | Written by | Contents |
| --- | --- | --- |
| `lhr-<epoch-ms>-<hrtime%1e6>.json` | `collect` | one Lighthouse result (LHR) per run — 12 files for 4 URLs × 3 runs |
| `lhr-<epoch-ms>-<hrtime%1e6>.html` | `collect` | the rendered Lighthouse report for that same run, 1:1 with the JSON |
| `assertion-results.json` | `assert` | array of assertion results; `[]` when everything passed and `includePassedAssertions` is `false` |
| `manifest.json` | `upload --target=filesystem` | written into `outputDir`, not into `.lighthouseci/` |
| `links.json` | `upload --target=lhci` or `temporary-public-storage` | URL → report URL map, not used here |

Details:

- `saveLHR` writes both files with the same basename in one call
  ([`saved-reports.js#L50-L55`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/saved-reports.js#L50-L55)).
  There is no median or summary file in `.lighthouseci/`.
- `collect` clears only `lhr-*.json` / `lhr-*.html` before a non-`--additive` run
  ([`saved-reports.js#L96-L104`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/saved-reports.js#L96-L104),
  [`collect.js#L246`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/collect.js#L246)).
  A stale `assertion-results.json` from a previous run survives `collect`, so check its mtime or
  delete `.lighthouseci/` first.
- An optional `flags-<uuid>.json` may appear briefly while Lighthouse runs; it is deleted afterwards
  ([`node-runner.js#L62-L72`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/node-runner.js#L62-L72)).
- Each LHR carries what the budgets need: `categories.<id>.score` (0–1), and
  `audits.<id>.numericValue` for `largest-contentful-paint`, `cumulative-layout-shift`,
  `total-blocking-time`, plus `requestedUrl`, `finalUrl`, `fetchTime`, `lighthouseVersion`,
  `configSettings`.

### Where the median lives

`assert` computes `actual` from `values`, using the configured aggregation method. With three runs
`median` picks the middle value after sorting
([`assertions.js#L86-L92`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L86-L92)).
The per-run numbers stay in the same object, so one entry is the whole "budget / fact" row. **Verified**
entry (LCP budget 700.1 ms, three runs):

```json
{
  "name": "maxNumericValue",
  "expected": 700.1,
  "actual": 700.3505,
  "values": [700.3505, 694.333, 702.3],
  "operator": "<=",
  "passed": false,
  "auditId": "largest-contentful-paint",
  "level": "error",
  "url": "http://localhost:8080/",
  "auditTitle": "Largest Contentful Paint",
  "auditDocumentationLink": "https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint/"
}
```

Category rows look like this (note `auditId: "categories"` plus `auditProperty`):

```json
{
  "name": "minScore",
  "expected": 1,
  "actual": 0.94,
  "values": [0.94, 0.94, 0.94],
  "operator": ">=",
  "passed": false,
  "auditProperty": "accessibility",
  "auditId": "categories",
  "level": "error",
  "url": "http://localhost:8080/"
}
```

Full field list observed across a 28-row file (`4 URLs × 7 budgets`):
`name`, `expected`, `actual`, `values`, `operator`, `passed`, `auditId`, `level`, `url`, and
optionally `auditProperty`, `message`, `auditTitle`, `auditDocumentationLink`
([`assertions.js#L514-L521`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L514-L521)).
There is no timestamp in the file and no `score` field.

Key mapping for a table builder: `categories:*` budgets use `auditId: "categories"` +
`auditProperty: "<category>"` + `name: "minScore"`; metric budgets use `auditId: "<audit-id>"` +
`name: "maxNumericValue"`; `expected` is the budget and `actual` the median. `operator` is `>=` for
`minScore` and `<=` for `maxNumericValue`
([`assertions.js#L57-L61`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L57-L61)).

A different notion of "median" exists for reports: `computeRepresentativeRuns` picks the single run
closest to the median FCP and Interactive
([`representative-runs.js#L29-L64`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/representative-runs.js#L29-L64)).
That run is what `--aggregationMethod=median-run` asserts and what the filesystem upload marks with
`isRepresentativeRun`; it is not the same as the per-audit `median`. The map asks for the latter.

### `manifest.json` (only from `upload --target=filesystem`)

`upload --target=filesystem --outputDir=./lhci-reports` writes every run's `.report.html` and
`.report.json` under readable names and one `manifest.json` at the root of `outputDir`
([`upload.js#L539-L604`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/upload/upload.js#L539-L604),
[configuration.md#outputdir](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#outputdir)).
**Verified** shape:

```json
{
  "url": "http://localhost:8080/",
  "isRepresentativeRun": false,
  "htmlPath": "/abs/path/lhci-reports/localhost--2026_11_21_17_47_24.report.html",
  "jsonPath": "/abs/path/lhci-reports/localhost--2026_11_21_17_47_24.report.json",
  "summary": {"performance": 1, "accessibility": 0.94, "best-practices": 0.96, "seo": 0.9, "agentic-browsing": 1}
}
```

The file had 12 entries; exactly 4 had `isRepresentativeRun: true`. Notes:

- `url` is `lhr.requestedUrl`, and grouping is by requested URL
  ([`upload.js#L542-L544`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/upload/upload.js#L542-L544)).
- `summary` contains **every** category Lighthouse produced, including `agentic-browsing` in
  Lighthouse 13; do not hard-code four keys.
- `htmlPath` / `jsonPath` are absolute, so the file is not portable across machines; strip the prefix
  when embedding it into an issue.
- Default `reportFilenamePattern` is `%%HOSTNAME%%-%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%`,
  so the root page yields a name with an empty path segment (`localhost--2026_11_21_....report.html`).
  `%%DATETIME%%` keeps the 12 files distinct; median runs are written last
  ([configuration.md#reportfilenamepattern](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#reportfilenamepattern)).
- This step is optional: it duplicates the LHRs from `.lighthouseci/` under nicer names and adds the
  representative-run flag.

## 3. Human-readable HTML without an LHCI server

Three options, in order of usefulness here:

1. **Nothing to do.** `collect` already wrote one `lhr-*.html` per run
   ([`saved-reports.js#L54-L55`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/saved-reports.js#L54-L55), **verified**).
   The file is a single self-contained Lighthouse report (≈400 KB, styles and scripts inlined), so
   `actions/upload-artifact` can ship it as is. This is the report a human reads.
2. **`upload --target=filesystem`** for stable names plus `manifest.json` that says which file is the
   representative run ([configuration.md#target](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/configuration.md#target)).
   It is a local directory write; no server, no token, no network. **Verified** exit 0.
3. `lhci open` renders the median report per URL into a temp dir and opens it with the desktop
   `open` command
   ([`open.js#L44-L60`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/open/open.js#L44-L60)).
   Useless on a headless runner; listed only to rule it out.

`temporary-public-storage` is explicitly out of scope for the map and would send the reports to GCS.

## 4. Budget failure vs infrastructure failure

Both end with exit code `1`. The difference is in the files and in which message appears.

| Signal | Budget failure | Infrastructure failure |
| --- | --- | --- |
| Exit code | `1` | `1` |
| `collect` step | exit `0`, 12 `lhr-*.json` | exit `1`, **no** new `lhr-*.json` |
| stdout | `Run #1...done.` … `Done running Lighthouse!` | `Run #<n>...failed!` |
| stderr | `Checking assertions against 4 URL(s), 12 total run(s)` … `Assertion failed. Exiting with status code 1.` | `Error: Lighthouse failed with exit code 1` followed by the failing LHR (`runtimeError.code`, `runWarnings`) |
| `.lighthouseci/assertion-results.json` | present for this run, ≥1 entry with `passed: false, level: "error"` | absent (fresh runner) |

Mechanics behind the table:

- `assert` writes `assertion-results.json` **before** deciding to fail, then prints
  `Assertion failed. Exiting with status code 1.` and calls `process.exit(1)`
  ([`assert.js#L116-L121`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/assert/assert.js#L116-L121)).
  Only failures (`passed: false, level: "error"`) set the exit code; `warn` prints but exits `0`
  ([`assert.js#L92-L93`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/assert/assert.js#L92-L93)).
- A failing run is retried up to **3 attempts** before `collect` gives up
  ([`node-runner.js#L136-L146`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/node-runner.js#L136-L146)),
  so a dead URL costs three Chrome launches. The reported error is the first attempt.
- Uncaught errors (bad config, missing Chrome, `Cannot use assertMatrix with other options`) are
  printed as a stack by the CLI wrapper and exit `1`
  ([`cli.js#L126-L134`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/cli.js#L126-L134)).
  In that case `assertion-results.json` is never written — that is how a *config* error differs from a
  *budget* failure.
- Observed messages, **verified**: unreachable URL ⇒ `Run #1...failed!` + `Error: Lighthouse failed
  with exit code 1` + an LHR with `runtimeError.code: "CHROME_INTERSTITIAL_ERROR"`; missing Chrome ⇒
  `The CHROME_PATH environment variable must be set to a Chrome/Chromium executable no older than
  Chrome stable.`

### Two ways `assert` silently passes

1. **Zero LHRs.** With an empty `.lighthouseci/`, `assert` prints
   `Checking assertions against 0 URL(s), 0 total run(s)`, writes `[]`, and exits `0` — **verified**.
   `getAllAssertionResults` simply has nothing to iterate and `hasFailure` stays `false`
   ([`assertions.js#L535-L557`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/utils/src/assertions.js#L535-L557)).
2. **`numberOfRuns <= 0`.** `collect` accepts `-1`, prints `Running Lighthouse -1 time(s)`, writes
   nothing and exits `0` — **verified**. Nothing validates the value against a positive integer.

So the job must treat `assert`'s exit code as meaningful only after it has confirmed that the expected
number of LHRs exists. `4 URLs × 3 runs = 12` files:

```bash
set -euo pipefail
rm -rf .lighthouseci lhci-reports

collect_status=0
pnpm dlx @lhci/cli@0.16.1 collect --config=.lighthouserc.json || collect_status=$?

runs=0
for f in .lighthouseci/lhr-*.json; do
  [ -e "$f" ] && runs=$((runs + 1))
done

if [ "$collect_status" -ne 0 ] || [ "$runs" -ne 12 ]; then
  echo "::error::collect status ${collect_status}, ${runs} of 12 runs - infrastructure failure" >&2
  exit 2
fi

assert_status=0
pnpm dlx @lhci/cli@0.16.1 assert --config=.lighthouserc.json || assert_status=$?

if [ "$assert_status" -ne 0 ]; then
  # assertion-results.json exists and carries the failed rows; do not fail the job yet.
  jq '[.[] | select(.level == "error" and (.passed | not))] | length' \
    .lighthouseci/assertion-results.json
fi
```

`exit 2` here is the workflow's own "infra" marker: every LHCI failure path observed exits `1`, so
the job needs a second code to tell "budgets failed" from "could not measure". The LHR count catches
the case where `collect` returned `0` but wrote fewer runs than expected, and the zero-LHR case where
`assert` would happily pass.

With `autorun` instead of separate commands, the order is fixed: `healthcheck --fatal`, then
`collect`, then `assert`, then `upload`; each child's non-zero status short-circuits, and an assert
failure ends with `assert command failed. Exiting with status code 1.`
([`autorun.js#L122-L153`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/autorun/autorun.js#L122-L153)).
`autorun` aborts before `collect` when Chrome is missing, printing `Healthcheck failed!` (with
`--fatal`) — another signal that is clearly not a budget failure.

## 5. Node 26 and Chrome in GitHub runners

- `@lhci/cli@0.16.1` declares `"engines": {"node": ">=22.19.0"}` and depends on
  `lighthouse@13.6.0`, which declares `"engines": {"node": ">=22.19"}`
  (<https://registry.npmjs.org/@lhci/cli/0.16.1>,
  <https://registry.npmjs.org/lighthouse/13.6.0>). Node 26 satisfies both.
- **Verified on Node v26.13.0 / pnpm 12.18.0**: `collect`, `assert`, `upload --target=filesystem` and
  `healthcheck` all ran through `pnpm dlx @lhci/cli@0.16.1`. `pnpm dlx` resolves the package into its
  own store; each invocation costs a few seconds but no `package.json` entry is needed.
- The repo already pins `node = "26"` in `mise.toml`, so the runner gets a compatible runtime with no
  extra setup.
- Chrome: the official `ubuntu-latest` runner image ships Google Chrome preinstalled. Both the 24.04
  and the 26.04 images list `Google Chrome 157.0.8103.78`
  (<https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>,
  <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md>), and
  LHCI's own GitHub Actions example installs no browser
  ([getting-started.md#configure-your-ci-provider](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/getting-started.md#configure-your-ci-provider)).
- Path resolution order is `--chromePath`, then `CHROME_PATH`, then a Puppeteer-managed Chromium, then
  `chrome-launcher`'s auto-detection
  ([`utils.js#L56-L64`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/utils.js#L56-L64)).
  On a runner with Chrome at the standard location nothing has to be set; pin it only if a specific
  build is required (`CHROME_PATH: /usr/bin/google-chrome`).
- Headless is automatic: `--headless=new` is appended unless `collect.headful` is set
  ([`node-runner.js#L48`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/collect/node-runner.js#L48)).
- `--no-sandbox` is only needed in containers without a user namespace
  ([troubleshooting.md](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/docs/troubleshooting.md)),
  not on `ubuntu-latest`.
- If Chrome is missing, `healthcheck` reports `Chrome installation not found` and `autorun` stops
  there; with plain `collect` the failure surfaces as the `CHROME_PATH` message above
  ([`healthcheck.js#L64-L70`](https://github.com/GoogleChrome/lighthouse-ci/blob/v0.16.1/packages/cli/src/healthcheck/healthcheck.js#L64-L70), **verified**).

## 6. Workflow recipe (for the implementation ticket)

Artifact and summary inputs, once the commands above have run:

```yaml
- name: Upload Lighthouse artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: lighthouse-report-${{ github.run_id }}
    path: |
      .lighthouseci
      lhci-reports
    retention-days: 30
```

- `.lighthouseci/` gives `lhr-*.html` (humans), `lhr-*.json` (extractor) and
  `assertion-results.json` (budget/fact rows).
- `lhci-reports/manifest.json` is the cheap way to pick the representative report per URL without
  recomputing medians.
- `.lighthouseci/` must be gitignored; the map requires it but the repo's `.gitignore` does not list it
  yet.
- `jq` is preinstalled on `ubuntu-latest`, so the summary/issue step can read
  `assertion-results.json` directly without a Node script if the logic stays short.

## Confidence / open questions

Verified by reproduction (Node 26.13.0, Chromium 156, four local URLs, three runs):

- file names and counts in `.lighthouseci/` after `collect` and `assert`;
- `assertion-results.json` schema, `actual`/`values` semantics, median vs optimistic;
- exit codes `0`/`1` for pass, budget failure, collect failure, missing Chrome, config error;
- silent pass on zero LHRs and on `numberOfRuns: -1`;
- `manifest.json` shape and one representative entry per URL;
- `aggregationMethod` at `ci.assert` level and per assertion;
- `Cannot use assertMatrix with other options`;
- desktop `formFactor` without `screenEmulation` aborting the run.

Not verified, stated from source only:

- Chrome 157 (what the runner image ships) against Lighthouse 13.6.0 — locally tested with Chromium 156;
  the protocol error documented in `troubleshooting.md` is the failure mode if the gap is too large.
- `actions/upload-artifact@v4` behaviour on this repo — version choice should follow the SHAs already
  pinned in `.github/workflows/`, which is out of scope for a research note.
- Whether a Render cold start (90 s+) trips `maxWaitForLoad` before the warm-up step exists; the map
  handles warm-up separately, and `45000` in the snippet is Lighthouse's default
  ([`constants.js#L55`](https://github.com/GoogleChrome/lighthouse/blob/v13.6.0/core/config/constants.js#L55)),
  not a tuned value.
- The exact `LHR` count to gate on depends on the final URL list; `12` assumes four URLs and three
  runs.
- `assertion-results.json` ordering follows `readdirSync` order of `.lighthouseci/`, so `values[]` is
  collection order, not sorted. Use `actual` (or sort `values` yourself) for any "median of runs"
  column.
