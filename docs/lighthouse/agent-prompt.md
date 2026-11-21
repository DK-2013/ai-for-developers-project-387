# Agent prompt for Lighthouse findings

You are given `lighthouse-findings.md` — a deterministic summary of Lighthouse CI budget
failures across up to three pages, ranked by severity.

## Task

For each page section in `lighthouse-findings.md`:

1. Read the `<!-- lighthouse: ... -->` fingerprints.
2. Check if an existing GitHub issue already contains that exact fingerprint:
   - `gh issue list --state all --limit 1000 --json number,state,body`
   - Parse issue bodies locally to find matching fingerprints (do NOT use `gh issue list --label`).
3. Act accordingly:

| State | Action |
| --- | --- |
| No matching issue | Create a new issue with `lighthouse` label using the issue template |
| Matching open issue | Update the body with the new findings (overwrite), no comment |
| Matching closed issue | Reopen it and update the body |
| Fingerprint gone, issue open + >7 days old | Close the issue |
| Fingerprint gone, issue open + ≤7 days old | Post one comment "The budget is now passing" (no repeats) |

## Issue template

Use `docs/lighthouse/issue-template.md` as the body template. Replace `{{placeholders}}` with actual
values from the findings and the current workflow run.

## Constraints

- At most 3 new issues per run (the script already limits to 3 pages).
- Never create a duplicate issue for the same fingerprint.
- Never delete an issue — only close it.
- If `lighthouse-findings.md` contains no failed assertions, do nothing.
- If the JSON is malformed or the file is missing, report `infra` and exit 0.

## Output

Write a JSONL file `lighthouse-agent-log.jsonl` with one line per action taken:

```jsonl
{"action":"created","issue":42,"path":"/owner","fingerprints":["<!-- lighthouse: /owner#categories:performance -->","<!-- lighthouse: /owner#cumulative-layout-shift -->"]}
{"action":"updated","issue":37,"path":"/","fingerprints":["<!-- lighthouse: /#categories:performance -->"]}
{"action":"closed","issue":29,"path":"/old-page","reason":"budget passing"}
{"action":"none","reason":"no findings"}
```

This log enables deterministic step-summary generation by the CI workflow.
