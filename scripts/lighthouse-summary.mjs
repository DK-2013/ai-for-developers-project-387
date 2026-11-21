#!/usr/bin/env node

// Deterministic step-summary generator: reads lighthouse-findings.md and writes
// a GitHub Actions step summary. No LLM, no model, no external dependencies.

import { readFileSync, writeFileSync } from "node:fs";

const INPUT = process.argv[2] ?? "lighthouse-findings.md";
const SUMMARY = process.env.GITHUB_STEP_SUMMARY;

if (!readFileSync(INPUT, "utf-8")) {
  process.stdout.write("No findings file.\n");
  process.exit(0);
}

const content = readFileSync(INPUT, "utf-8");

// Parse sections
const pages = [];
const lines = content.split("\n");
let currentPath = null;
let currentFindings = [];

for (const line of lines) {
  const headingMatch = line.match(/^## (.+)/);
  if (headingMatch) {
    if (currentPath) {
      pages.push({ path: currentPath, findings: currentFindings });
    }
    currentPath = headingMatch[1];
    currentFindings = [];
    continue;
  }
  const findingMatch = line.match(/^- \*\*(.+)\*\*: budget (.+?), actual (.+)$/);
  if (findingMatch && currentPath) {
    currentFindings.push({
      label: findingMatch[1],
      budget: findingMatch[2],
      actual: findingMatch[3],
    });
  }
}
if (currentPath && currentFindings.length > 0) {
  pages.push({ path: currentPath, findings: currentFindings });
}

// Build summary
const summaryLines = [];

if (pages.length === 0) {
  summaryLines.push("## Lighthouse CI: No findings");
  summaryLines.push("");
  summaryLines.push("All budgets passed.");
} else {
  const totalFailures = pages.reduce((sum, p) => sum + p.findings.length, 0);
  summaryLines.push(`## Lighthouse CI: ${totalFailures} failed budget(s) on ${pages.length} page(s)`);
  summaryLines.push("");

  for (const page of pages) {
    summaryLines.push(`### ${page.path}`);
    summaryLines.push("");
    summaryLines.push("| Budget | Budget | Actual |");
    summaryLines.push("| --- | --- | --- |");
    for (const f of page.findings) {
      summaryLines.push(`| ${f.label} | ${f.budget} | ${f.actual} |`);
    }
    summaryLines.push("");
  }
}

const summary = summaryLines.join("\n");

if (SUMMARY) {
  writeFileSync(SUMMARY, summary, { flag: "a" });
  console.log(`Wrote step summary to ${SUMMARY}`);
} else {
  // Not in GitHub Actions — print to stdout
  console.log(summary);
}
