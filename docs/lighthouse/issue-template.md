# Issue body template for Lighthouse findings

Each issue represents one page with one or more failed Lighthouse budgets.

## Structure

```markdown
## Summary

Lighthouse CI detected {{N}} failed budget(s) on {{path}} during the {{date}} run.

## Failed budgets

<!-- lighthouse: {{path}}#{{auditId1}} -->
- **{{label1}}**: budget {{op1}} {{expected1}}, actual {{actual1}}

<!-- lighthouse: {{path}}#{{auditId2}} -->
- **{{label2}}**: budget {{op2}} {{expected2}}, actual {{actual2}}

## Details

- **Run**: {{workflow_run_id}}
- **Profile**: mobile, 3 runs (median)
- **Report**: [Download artefact]({{artefact_url}})
```

## Fingerprint

The line `<!-- lighthouse: <path>#<auditId> -->` is the unique fingerprint for deduplication.
It must appear verbatim in the issue body, one per failed assertion.

## Rules

- One issue per page (path).
- All failed budgets for that page go in the same issue.
- Reopen a closed issue if the same fingerprint reappears.
- Close an issue if the fingerprint no longer appears in findings.
- Do not create an issue if `assertion-results.json` is empty (infra error, not a finding).
