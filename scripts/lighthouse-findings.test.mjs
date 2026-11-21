#!/usr/bin/env node

// Verify that the findings extractor handles edge cases correctly:
// 1. Empty results → no findings (infra error, not a finding)
// 2. All-passed results → no findings
// 3. Stable fingerprints across multiple runs

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./lighthouse-findings.mjs", import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), "lh-findings-test-"));

let passed = 0;
let failed = 0;

function runScript(input, label) {
  const inputFile = join(tmp, `input-${label}.json`);
  const outputFile = join(tmp, `output-${label}.md`);
  writeFileSync(inputFile, JSON.stringify(input, null, 2));

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SCRIPT, inputFile, outputFile]);
    let stdout = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stdout += d));
    proc.on("close", (code) => resolve({ code, stdout, outputFile }));
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

// Test 1: Empty results → no findings
await test("empty results produce no findings", async () => {
  const result = await runScript([], "empty");
  assertEqual(result.code, 0, "exit code");
  const output = readFileSync(result.outputFile, "utf-8");
  assertEqual(output.includes("No failed assertions found."), true, "output message");
});

// Test 2: All passed → no findings
await test("all-passed results produce no findings", async () => {
  const allPassed = [
    {
      url: "http://localhost:3000/",
      auditId: "categories:performance",
      passed: true,
      level: "error",
      actual: 0.95,
      expected: 0.8,
      operator: ">=",
      auditProperty: "categories:performance",
    },
  ];
  const result = await runScript(allPassed, "all-passed");
  const output = readFileSync(result.outputFile, "utf-8");
  assertEqual(output.includes("No failed assertions found."), true, "no findings");
});

// Test 3: Stable fingerprints across two runs
await test("fingerprints are stable across runs", async () => {
  const sampleData = JSON.parse(
    readFileSync(".lighthouseci/assertion-results.json", "utf-8")
  );
  const run1 = await runScript(sampleData, "stable-1");
  const run2 = await runScript(sampleData, "stable-2");
  const out1 = readFileSync(run1.outputFile, "utf-8");
  const out2 = readFileSync(run2.outputFile, "utf-8");
  assertEqual(out1, out2, "identical output");
});

// Test 4: Mixed infra + findings (empty array means infra)
await test("infra error (empty results) does not produce findings", async () => {
  const result = await runScript([], "infra");
  const output = readFileSync(result.outputFile, "utf-8");
  assertEqual(output.includes("Generated from"), false, "no findings header");
  assertEqual(output.includes("No failed assertions"), true, "infra message");
});

// Cleanup
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
