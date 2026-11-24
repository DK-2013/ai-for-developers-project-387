#!/usr/bin/env bash
# Record an admitted /oc attempt in the budget ledger.
#
# Usage:
#   oc-record.sh
#
# Reads the ledger script from the default branch so the record step
# cannot forge a counter entry.  Dispatches the ledger workflow and
# polls until the entry is visible.
#
# Env: GH_TOKEN, REPO, RUN_ID, RUN_ATTEMPT, PR_NUMBER, DEFAULT_BRANCH
set -euo pipefail

if [ -z "${PR_NUMBER:-}" ]; then
  echo "::notice::Not a pull request; no ledger entry is recorded."
  exit 0
fi

info=$(
  gh api --paginate \
    "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT/jobs?per_page=100" \
    --jq '.jobs[] | select(.name == "opencode") | [
      ([.steps[]? | select(.name == "Preflight") | .conclusion][0] // ""),
      ([.steps[]? | select(.name == "Mark agent start") | .conclusion][0] // ""),
      (.conclusion // ""),
      (.started_at // "")
    ] | @tsv' |
    head -n 1
)
IFS=$'\t' read -r preflight_result marker opencode_result opencode_started <<< "$info"

# The jobs endpoint also returns jobs from earlier attempts.  If the
# opencode job started before this attempt, only this job was rerun
# (for example `record`), so it must not create a second entry.
attempt_started=$(
  gh api "repos/$REPO/actions/runs/$RUN_ID/attempts/$RUN_ATTEMPT" \
    --jq '.run_started_at'
)
if [ -n "$opencode_started" ] && [[ "$opencode_started" < "$attempt_started" ]]; then
  echo "::notice::The opencode job did not run in attempt $RUN_ATTEMPT; no ledger entry."
  exit 0
fi

if [ "$preflight_result" != "success" ]; then
  echo "::notice::Preflight did not pass (${preflight_result:-absent}); no ledger entry."
  exit 0
fi

if [ "$marker" != "success" ]; then
  case "${opencode_result:-}" in
    cancelled|skipped|"")
      echo "::notice::The admitted attempt stopped before the model boundary; recording it."
      ;;
    *)
      echo "::notice::The model boundary was not reached (marker: ${marker:-absent}, opencode: ${opencode_result}); no ledger entry."
      exit 0
      ;;
  esac
fi

# Download the ledger script from the default branch so the record step
# cannot forge a counter entry.
script="$RUNNER_TEMP/oc-budget.sh"
if ! gh api \
  "repos/$REPO/contents/scripts/oc-budget.sh?ref=$DEFAULT_BRANCH" \
  --jq .content |
  base64 -d > "$script"; then
  echo "::error::Cannot read scripts/oc-budget.sh from $DEFAULT_BRANCH."
  exit 1
fi

ledger_has() {
  local result
  if ! result=$(bash "$script" has); then
    echo "::error::Cannot read the ledger."
    exit 1
  fi
  [ "$result" = "true" ]
}

if ledger_has; then
  echo "::notice::This attempt already has a ledger entry; nothing to record."
  exit 0
fi

gh workflow run oc-budget-ledger.yml \
  --repo "$REPO" --ref "$DEFAULT_BRANCH" \
  -f pr="$PR_NUMBER" -f run="$RUN_ID" -f attempt="$RUN_ATTEMPT"

# Wait until the entry is visible so the next queued /oc counts it.
for _ in $(seq 1 5); do
  if ledger_has; then
    echo "::notice::Ledger entry recorded for PR #$PR_NUMBER."
    exit 0
  fi
  sleep 2
done

echo "::error::The ledger entry did not appear; the budget may undercount."
exit 1
