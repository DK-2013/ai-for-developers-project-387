#!/usr/bin/env node

// Verify that the summary generator is deterministic.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./lighthouse-summary.mjs", import.meta.url));
const FINDINGS = fileURLToPath(new URL("../lighthouse-findings.md", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "lh-summary-test-"));

let passed = 0;
let failed = 0;

function runScript(findingsPath, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT, findingsPath], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stdout += d));
    proc.on("close", (code) => resolve({ code, stdout }));
    proc.on("error", reject);
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected "${expected}", got "${actual}"`);
  }
}

// Test 1: Deterministic across two runs
await test("summary is deterministic across two runs", async () => {
  const run1 = await runScript(FINDINGS);
  const run2 = await runScript(FINDINGS);
  assertEqual(run1.stdout, run2.stdout, "identical output");
});

// Test 2: Empty findings → "No findings"
await test("empty findings produce no-findings summary", async () => {
  const emptyFile = join(tmp, "empty-findings.md");
  writeFileSync(emptyFile, "# Lighthouse Findings\n\nNo failed assertions found.\n");
  const result = await runScript(emptyFile);
  assertEqual(result.stdout.includes("No findings"), true, "no findings message");
});

// Cleanup
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
