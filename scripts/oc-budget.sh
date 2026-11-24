#!/usr/bin/env bash
# Ledger-backed /oc budget operations.
#
# Usage:
#   oc-budget.sh ledger   Check and enforce the budget.
#   oc-budget.sh has      Print true when this run/attempt has an entry.
#
# Env: GH_TOKEN, REPO, PR_NUMBER
# ledger additionally uses: ON_PR, LIMIT, and writes to $GITHUB_OUTPUT.
# has additionally uses: RUN_ID, RUN_ATTEMPT.
set -euo pipefail

mode="${1:-ledger}"
ledger_path="repos/$REPO/actions/workflows/oc-budget-ledger.yml/runs"

count_entries() {
  local used
  if ! used=$(
    gh api --paginate "$ledger_path?per_page=100" \
      --jq ".workflow_runs[] | select(.display_title | startswith(\"oc-chat-budget PR #$PR_NUMBER \")) | .id" |
      wc -l
  ); then
    return 1
  fi
  echo $((used + 0))
}

has_entry() {
  local expected="oc-chat-budget PR #$PR_NUMBER run $RUN_ID attempt $RUN_ATTEMPT"
  local found
  if ! found=$(
    gh api --paginate "$ledger_path?per_page=100" \
      --jq ".workflow_runs[] | select(.display_title == \"$expected\") | .id" |
      head -n 1
  ); then
    return 1
  fi
  if [ -n "$found" ]; then
    echo true
  else
    echo false
  fi
}

case "$mode" in
  has)
    has_entry
    exit 0
    ;;
  ledger) ;;
  *)
    echo "::error::Unsupported budget mode: $mode" >&2
    exit 2
    ;;
esac

write() {
  local allowed="$1" reason="$2" used="$3" limit="$4"
  {
    echo "allowed=$allowed"
    echo "reason=$reason"
    echo "used=$used"
    echo "limit=$limit"
  } >> "$GITHUB_OUTPUT"
}

fail() {
  local reason="$1" used="$2" limit="$3" message="$4"
  echo "::error::$message"
  write false "$reason" "$used" "$limit"
  exit 1
}

limit="${LIMIT:-}"
case "$limit" in
  ''|*[!0-9]*)
    fail infra 0 "${limit:-0}" "vars.OC_CHAT_LIMIT must be a non-negative integer, got '${limit:-}'"
    ;;
esac

# The model runs on an OpenCode GitHub App token exchanged via OIDC. If that
# App could write Actions, the agent could delete ledger runs and reset its own
# budget, so refuse to run at all.
if ! app_json=$(gh api apps/opencode-agent 2>/dev/null); then
  fail infra 0 "$limit" "Cannot read the opencode-agent App; refusing to run."
fi
actions_perm=$(printf '%s' "$app_json" | jq -r '.permissions.actions // "none"')
if [ "$actions_perm" = "write" ]; then
  fail infra 0 "$limit" "The opencode-agent App has actions: write; it could reset the budget."
fi

echo "limit=$limit" >> "$GITHUB_OUTPUT"
echo "pr=$PR_NUMBER" >> "$GITHUB_OUTPUT"

if [ "${ON_PR:-false}" != "true" ]; then
  {
    echo "allowed=true"
    echo "reason="
    echo "used=0"
    echo "on_pr=false"
  } >> "$GITHUB_OUTPUT"
  echo "::notice::Chat budget applies to pull requests; issue #$PR_NUMBER is not budgeted"
  exit 0
fi
echo "on_pr=true" >> "$GITHUB_OUTPUT"

# A pull request from a fork must never see the model key. Refuse it before the
# budget is even consulted; the agent never runs on it.
if ! head_repo=$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq '.head.repo.full_name'); then
  fail infra 0 "$limit" "Cannot read PR #$PR_NUMBER; refusing to run."
fi
if [ "$head_repo" != "$REPO" ]; then
  echo "::notice::PR #$PR_NUMBER is from fork '$head_repo'; refusing to run."
  write false fork 0 "$limit"
  exit 1
fi

if ! used=$(count_entries); then
  fail infra 0 "$limit" "Cannot read the /oc budget ledger; refusing to run."
fi

if [ "$used" -ge "$limit" ]; then
  echo "::notice::Chat budget exhausted: $used of $limit for PR #$PR_NUMBER"
  write false limit_exhausted "$used" "$limit"
  exit 1
fi

write true "" "$used" "$limit"
echo "::notice::Chat budget: $used of $limit used for PR #$PR_NUMBER"
