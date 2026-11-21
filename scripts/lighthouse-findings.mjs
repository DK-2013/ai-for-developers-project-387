#!/usr/bin/env node

// Deterministic extractor: .lighthouseci/assertion-results.json → lighthouse-findings.md
// No external dependencies. Sorts pages by severity (most failures first, then lowest
// performance score), emits at most three pages, each with a stable fingerprint comment.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const INPUT = process.argv[2] ?? ".lighthouseci/assertion-results.json";
const OUTPUT = process.argv[3] ?? "lighthouse-findings.md";

const results = JSON.parse(readFileSync(INPUT, "utf-8"));

// Group by URL path (strip origin to get a clean path)
const byPath = new Map();
for (const r of results) {
  const path = new URL(r.url).pathname;
  if (!byPath.has(path)) byPath.set(path, []);
  byPath.get(path).push(r);
}

// For each path, separate failed and passed assertions
const pageFindings = [];

for (const [path, assertions] of byPath) {
  const failed = assertions.filter((a) => !a.passed && a.level === "error");
  const hasInfraError =
    assertions.length === 0 || assertions.every((a) => a.level !== "error");

  // If no assertions ran at all, skip (infra error, not a finding)
  if (assertions.length === 0) continue;

  const performanceAssertion = assertions.find(
    (a) => a.auditId === "categories:performance"
  );
  const performanceScore = performanceAssertion ? performanceAssertion.actual : null;

  pageFindings.push({
    path,
    failed,
    totalAssertions: assertions.length,
    failCount: failed.length,
    performanceScore,
    isInfraError: hasInfraError,
  });
}

// Sort by severity: most failures first, then lowest performance score
pageFindings.sort((a, b) => {
  if (a.failCount !== b.failCount) return b.failCount - a.failCount;
  if (a.performanceScore != null && b.performanceScore != null) {
    return a.performanceScore - b.performanceScore;
  }
  return 0;
});

// Take top 3 pages
const topPages = pageFindings.slice(0, 3);

// Build the markdown output
const totalFailures = topPages.reduce((sum, p) => sum + p.failCount, 0);
const lines = [];
lines.push("# Lighthouse Findings");
lines.push("");
if (totalFailures > 0) {
  lines.push(
    `Generated from ${totalFailures} failed assertions across ${topPages.length} pages.`
  );
  lines.push("");
}

const budgetLabels = {
  "categories:performance": "Performance score",
  "categories:accessibility": "Accessibility score",
  "categories:best-practices": "Best Practices score",
  "categories:seo": "SEO score",
  "largest-contentful-paint": "Largest Contentful Paint",
  "cumulative-layout-shift": "Cumulative Layout Shift",
  "total-blocking-time": "Total Blocking Time",
};

const auditUnit = (auditId) => {
  if (auditId === "largest-contentful-paint") return "ms";
  if (auditId === "cumulative-layout-shift") return "";
  if (auditId === "total-blocking-time") return "ms";
  if (auditId.startsWith("categories:")) return "";
  return "";
};

const formatValue = (auditId, value) => {
  const unit = auditUnit(auditId);
  if (auditId.startsWith("categories:")) {
    // Scores are 0-1, show as 0.XX
    return value.toFixed(2);
  }
  if (unit === "ms") return `${Math.round(value)} ms`;
  return String(value);
};

for (const page of topPages) {
  if (page.failCount === 0) continue;

  // Fingerprint for deduplication
  const fingerprints = page.failed.map(
    (f) => `<!-- lighthouse: ${page.path}#${f.auditId} -->`
  );

  lines.push(`## ${page.path}`);
  lines.push("");

  for (let i = 0; i < page.failed.length; i++) {
    const f = page.failed[i];
    const label = budgetLabels[f.auditId] ?? f.auditId;
    const op = f.operator;
    const budget = formatValue(f.auditId, f.expected);
    const actual = formatValue(f.auditId, f.actual);

    lines.push(fingerprints[i]);
    lines.push(
      `- **${label}**: budget ${op} ${budget}, actual ${actual}`
    );
  }
  lines.push("");
}

// If no findings at all
if (topPages.every((p) => p.failCount === 0)) {
  lines.push("No failed assertions found.");
  lines.push("");
}

const output = lines.join("\n");
writeFileSync(OUTPUT, output);

console.log(`Wrote ${OUTPUT} (${topPages.length} pages, ${topPages.reduce((sum, p) => sum + p.failCount, 0)} findings)`);

// Print summary for CI
for (const page of topPages) {
  if (page.failCount > 0) {
    console.log(`  ${page.path}: ${page.failCount} failure(s)`);
  }
}
