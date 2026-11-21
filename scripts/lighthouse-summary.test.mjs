import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./lighthouse-summary.mjs", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "lighthouse-summary-"));

test.after(() => rmSync(workdir, { recursive: true, force: true }));

test("the summary embeds the findings and the run link", () => {
  const findings = join(workdir, "findings.md");
  const summary = join(workdir, "summary.md");
  writeFileSync(findings, "# Lighthouse findings\n\n<!-- lighthouse: /owner -->\n");

  const result = spawnSync(process.execPath, [SCRIPT, findings], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_STEP_SUMMARY: summary,
      RUN_URL: "https://example.test/run/1",
      ARTIFACT_NAME: "lighthouse-report-1",
    },
  });

  assert.equal(result.status, 0);
  const written = readFileSync(summary, "utf8");
  assert.match(written, /## Lighthouse CI/);
  assert.match(written, /<!-- lighthouse: \/owner -->/);
  assert.match(written, /https:\/\/example\.test\/run\/1/);
  assert.match(written, /lighthouse-report-1/);
});

test("a missing findings file is an infrastructure failure", () => {
  const result = spawnSync(process.execPath, [SCRIPT, join(workdir, "missing.md")], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_STEP_SUMMARY: join(workdir, "summary-missing.md") },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /cannot read/);
});
