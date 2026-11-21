import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./lighthouse-findings.mjs", import.meta.url));
const workdir = mkdtempSync(join(tmpdir(), "lighthouse-findings-"));

test.after(() => rmSync(workdir, { recursive: true, force: true }));

let counter = 0;

function run(rows) {
  counter += 1;
  const input = join(workdir, `input-${counter}.json`);
  const output = join(workdir, `output-${counter}.md`);
  writeFileSync(input, JSON.stringify(rows));
  const result = spawnSync(process.execPath, [SCRIPT, input, output], { encoding: "utf8" });
  return {
    status: result.status,
    stderr: result.stderr,
    output: result.status === 0 ? readFileSync(output, "utf8") : "",
  };
}

const category = (url, property, actual, passed = false) => ({
  url,
  auditId: "categories",
  auditProperty: property,
  name: "minScore",
  operator: ">=",
  expected: 0.9,
  actual,
  passed,
  level: "error",
});

const metric = (url, auditId, actual, expected, passed = false) => ({
  url,
  auditId,
  name: "maxNumericValue",
  operator: "<=",
  expected,
  actual,
  passed,
  level: "error",
});

test("an empty result set is an infrastructure failure", () => {
  const result = run([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /no assertion results/);
});

test("a passing run writes no page sections", () => {
  const result = run([
    category("https://example.test/", "performance", 0.95, true),
    metric("https://example.test/", "largest-contentful-paint", 1800, 2500, true),
  ]);

  assert.equal(result.status, 0);
  assert.match(result.output, /Все бюджеты пройдены на 1 страницах\./);
  assert.doesNotMatch(result.output, /<!-- lighthouse:/);
});

test("failed budgets become a page section with a stable marker", () => {
  const result = run([
    category("https://example.test/owner", "accessibility", 0.86),
    metric("https://example.test/owner", "largest-contentful-paint", 3120, 2500),
  ]);

  assert.equal(result.status, 0);
  assert.match(result.output, /<!-- lighthouse: \/owner -->/);
  assert.match(result.output, /\| Accessibility \| ≥ 0\.90 \| 0\.86 \|/);
  assert.match(result.output, /\| Largest Contentful Paint \| ≤ 2500 ms \| 3120 ms \|/);
});

test("the booking page keeps one stable fingerprint across ids", () => {
  const result = run([
    category("https://example.test/book/1f0d8f2e-0000-4000-8000-000000000001", "seo", 0.5),
  ]);

  assert.match(result.output, /<!-- lighthouse: \/book\/\{id\} -->/);
});

test("at most three pages are reported, worst first", () => {
  const result = run([
    category("https://example.test/one", "performance", 0.79),
    category("https://example.test/two", "performance", 0.78),
    category("https://example.test/two", "seo", 0.5),
    category("https://example.test/three", "performance", 0.77),
    category("https://example.test/three", "seo", 0.5),
    category("https://example.test/four", "performance", 0.76),
    category("https://example.test/four", "seo", 0.5),
  ]);

  const sections = result.output.match(/^## .+$/gm) ?? [];
  assert.deepEqual(sections, ["## /four", "## /three", "## /two"]);
});

test("the same input produces byte-identical output", () => {
  const rows = [
    category("https://example.test/", "best-practices", 0.8),
    metric("https://example.test/", "cumulative-layout-shift", 0.24, 0.1),
  ];

  const first = run(rows);
  const second = run(rows);
  assert.equal(first.output, second.output);
});
