#!/usr/bin/env node

// Turns .lighthouseci/assertion-results.json into a deterministic findings document.
// No dependencies, no model: the GitHub Actions workflow reads the result and the
// agent only publishes it.
//
// Exit codes: 0 — findings written (possibly none); 2 — the input is unusable, so the
// failure is infrastructure, not a budget finding.

import { readFileSync, writeFileSync } from "node:fs";

const INPUT = process.argv[2] ?? ".lighthouseci/assertion-results.json";
const OUTPUT = process.argv[3] ?? ".lighthouseci/findings.md";
const MAX_PAGES = 3;

const CATEGORY_LABELS = {
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best Practices",
  seo: "SEO",
};

const METRICS = {
  "largest-contentful-paint": { label: "Largest Contentful Paint", unit: "ms" },
  "cumulative-layout-shift": { label: "Cumulative Layout Shift", unit: "" },
  "total-blocking-time": { label: "Total Blocking Time", unit: "ms" },
};

function infra(message) {
  console.error(`infra: ${message}`);
  process.exit(2);
}

function labelOf(row) {
  if (row.auditId === "categories") {
    return CATEGORY_LABELS[row.auditProperty] ?? row.auditProperty;
  }
  return METRICS[row.auditId]?.label ?? row.auditId;
}

function formatValue(row, value) {
  if (row.auditId === "categories") return value.toFixed(2);
  if (METRICS[row.auditId]?.unit === "ms") return `${Math.round(value)} ms`;
  return String(value);
}

function operatorOf(row) {
  if (row.operator === ">=") return "≥";
  if (row.operator === "<=") return "≤";
  return row.operator;
}

function pagePath(url) {
  const path = new URL(url).pathname;
  // The seeded meeting type changes the booking id; the page stays the same.
  return path.replace(/^\/book\/[^/]+$/, "/book/{id}");
}

let results;
try {
  results = JSON.parse(readFileSync(INPUT, "utf8"));
} catch (error) {
  infra(`cannot read ${INPUT}: ${error.message}`);
}

if (!Array.isArray(results) || results.length === 0) {
  infra(`${INPUT} has no assertion results`);
}

const pages = new Map();

for (const row of results) {
  if (
    !row ||
    typeof row !== "object" ||
    typeof row.url !== "string" ||
    typeof row.auditId !== "string" ||
    typeof row.passed !== "boolean"
  ) {
    infra(`unexpected assertion row: ${JSON.stringify(row)}`);
  }

  const path = pagePath(row.url);
  if (!pages.has(path)) pages.set(path, []);
  pages.get(path).push(row);
}

const findings = [];

for (const [path, rows] of pages) {
  const failed = rows.filter((row) => !row.passed && row.level === "error");
  if (failed.length === 0) continue;

  const performance = rows.find(
    (row) => row.auditId === "categories" && row.auditProperty === "performance",
  );

  findings.push({ path, failed, performance: performance?.actual ?? 1 });
}

findings.sort((a, b) => {
  if (a.failed.length !== b.failed.length) return b.failed.length - a.failed.length;
  return a.performance - b.performance;
});

const selected = findings.slice(0, MAX_PAGES);
const lines = ["# Lighthouse findings", ""];

if (selected.length === 0) {
  lines.push(`Все бюджеты пройдены на ${pages.size} страницах.`, "");
} else {
  lines.push(
    `Провалено бюджетов: ${selected.reduce((sum, page) => sum + page.failed.length, 0)} ` +
      `на ${selected.length} из ${pages.size} страниц.`,
    "",
  );

  for (const page of selected) {
    lines.push(`## ${page.path}`, "", `<!-- lighthouse: ${page.path} -->`, "");
    lines.push("| Метрика | Бюджет | Замер |", "| --- | --- | --- |");

    for (const row of page.failed) {
      const budget = `${operatorOf(row)} ${formatValue(row, row.expected)}`.trim();
      lines.push(`| ${labelOf(row)} | ${budget} | ${formatValue(row, row.actual)} |`);
    }

    lines.push("");
  }
}

writeFileSync(OUTPUT, lines.join("\n"));

console.log(`Wrote ${OUTPUT}: ${selected.length} page(s) with findings`);
for (const page of selected) {
  console.log(`  ${page.path}: ${page.failed.length} failed budget(s)`);
}
