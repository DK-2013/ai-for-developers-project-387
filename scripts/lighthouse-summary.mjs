#!/usr/bin/env node

// Appends the findings document to the GitHub Actions step summary.
// The summary is deterministic: it never depends on the agent's output.

import { appendFileSync, readFileSync } from "node:fs";

const INPUT = process.argv[2] ?? ".lighthouseci/findings.md";
const SUMMARY = process.env.GITHUB_STEP_SUMMARY;

let findings;
try {
  findings = readFileSync(INPUT, "utf8").trim();
} catch (error) {
  console.error(`infra: cannot read ${INPUT}: ${error.message}`);
  process.exit(2);
}

const lines = ["## Lighthouse CI", "", findings, ""];

if (process.env.RUN_URL) {
  lines.push(`[Прогон](${process.env.RUN_URL})`);
  lines.push("");
}

if (process.env.ARTIFACT_NAME) {
  lines.push(`Артефакт: \`${process.env.ARTIFACT_NAME}\` (30 дней).`);
  lines.push("");
}

const summary = lines.join("\n");

if (SUMMARY) {
  appendFileSync(SUMMARY, summary);
  console.log(`Wrote the step summary to ${SUMMARY}`);
} else {
  console.log(summary);
}
