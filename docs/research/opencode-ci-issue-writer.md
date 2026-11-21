# OpenCode 1.19.6 in CI: `gh issue` allowlist, step summary, and model failures

Research for issue #38. Answers five questions about running `opencode run` 1.19.6 in GitHub Actions
with just enough permission to publish an issue, and ends with a ready-to-paste workflow fragment.

## Which docs apply

OpenCode 2 is the current release, and the docs site now serves V2 at `/docs/`. V2 renamed the
configuration surface: its own permissions page says *"V1 uses different field and action names. In
V2, use `permissions`, `shell`, and `subagent` instead of `permission`, `bash`, and `task`."*
(<https://opencode.ai/docs/permissions/>). This repo pins **1.19.6** (`.github/workflows/pr-review.yml:85`,
`.github/workflows/triage.yml:71`, `.github/workflows/interactive.yml:146`), so the applicable docs are
the **V1 set** at <https://opencode.ai/v1/docs/> — in particular
<https://opencode.ai/v1/docs/permissions/>, <https://opencode.ai/v1/docs/agents/> and the
`OPENCODE_PERMISSION` row in <https://opencode.ai/v1/docs/cli/>.

Where the V1 docs stop short (heredocs, exit codes, ask-behaviour in non-interactive runs) the source
at tag `v1.19.6` is the authority:
`packages/opencode/src/tool/shell.ts`, `packages/opencode/src/permission/index.ts`,
`packages/core/src/util/wildcard.ts`, `packages/core/src/v1/config/permission.ts`,
`packages/opencode/src/cli/cmd/run.ts`, `packages/opencode/src/agent/agent.ts`,
`packages/opencode/src/config/config.ts` (all at
<https://github.com/anomalyco/opencode/tree/v1.19.6>).

The locally installed `opencode` is **2.2.4** (`opencode --version`), so it cannot be used to observe
1.19.6 CLI behaviour. Nothing below was executed against a model.

## 1. How `OPENCODE_PERMISSION` matches multi-word bash commands

### 1.1 Where the rules come from

`OPENCODE_PERMISSION` is an inline JSON permission config. The CLI docs list it as *"Inlined json
permissions config"* (<https://opencode.ai/v1/docs/cli/>, Environment variables). Config loading merges
it **over** the JSON config file:

```ts
// packages/opencode/src/config/config.ts:559-565
if (Flag.OPENCODE_PERMISSION) {
  try {
    result.permission = mergeDeep(result.permission ?? {}, JSON.parse(Flag.OPENCODE_PERMISSION))
  } catch (err) {
    yield* Effect.logWarning("OPENCODE_PERMISSION contains invalid JSON, skipping", { err })
  }
}
```

Two consequences that matter for CI:

- **Invalid JSON is only a warning.** The variable is skipped and the permissive defaults apply
  (`{ "*": "allow" }`, `packages/opencode/src/agent/agent.ts:117`). A typo in the allowlist silently
  turns the sandbox off — validate the JSON in the workflow and fail as `infra`.
- Env rules are merged last, so they win over `.opencode`/`opencode.json` rules and over built-in agent
  defaults (`Permission.merge(defaults, …, user)` in `agent.ts:145-152,160-177`).

Object rules keep their JSON key order, and `evaluate` takes the **last** match:

```ts
// packages/opencode/src/permission/index.ts:844-854
rulesets.flat().findLast((rule) => Wildcard.match(permission, rule.permission) && Wildcard.match(pattern, rule.pattern))
  ?? { action: "ask", permission, pattern: "*" }
```

The parse-order comment in `packages/core/src/v1/config/permission.ts:19-21` says runtime parsing uses
Effect's `propertyOrder: "original"` *"so user key order is preserved for permission precedence"*. The
tests pin the semantics: `{ "*": "deny", bash: "allow" }` allows, the reversed object denies
(`packages/opencode/test/permission/next.test.ts:132-143`). So always write the catch-all
**first**, specific rules after it:

```json
{"edit":"deny","bash":{"*":"deny","gh issue create *":"allow"}}
```

### 1.2 What string is matched

The bash tool parses the command with `tree-sitter-bash` and asks for one permission pattern per
parsed `command` node, using the node's source text:

```ts
// packages/opencode/src/tool/shell.ts:124-126, 393-412
function commands(node: Node) { return node.descendantsOfType("command")… }
for (const node of commands(root)) {
  …
  scan.patterns.add(source(node))
  scan.always.add(BashArity.prefix(tokens).join(" ") + " *")
}
```

`source(node)` returns the parent's text when the command sits inside a `redirected_statement`
(`shell.ts:120-122`), which is how redirections and heredocs end up in the checked string. The tests
confirm the shape: `echo foo && echo bar` produces **two** patterns `echo foo` and `echo bar`
(`packages/opencode/test/tool/shell.test.ts:243-261`), and `echo test > output.txt` produces the single
pattern `echo test > output.txt` (`shell.test.ts:972-988`).

Matching itself is a whole-string regex with `*` → `.*`, `?` → `.`, and the `s` flag on Linux, plus one
special case — a trailing `" *"` becomes an optional group, so `"git status *"` also matches bare
`git status`:

```ts
// packages/core/src/util/wildcard.ts
let escaped = pattern.replaceAll("\\","/").replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*/g, ".*").replace(/\?/g, ".")
if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"
return new RegExp("^" + escaped + "$", process.platform === "win32" ? "si" : "s").test(normalized)
```

`packages/opencode/test/util/wildcard.test.ts:11-27` asserts `"ls *"` matches `ls`, `ls -la` and
`ls foo bar`, and does not match `lstmeval`.

### 1.3 Answers for the commands in the question

| Command the model runs | Patterns checked | `"gh issue create *": "allow"` covers it? |
| --- | --- | --- |
| `gh issue create --title "…" --body-file /tmp/body.md` | the whole line | **Yes.** `*` matches flags, quotes and spaces; the trailing-`*` rule also covers bare `gh issue create`. |
| `gh issue create --title "…" --body "- item"` | the whole line | **Yes**, quoting is irrelevant to matching (raw text, not argv). |
| `gh issue create --title "…" --body-file - <<'EOF'` + body + `EOF` | the whole redirected statement, body included; `s` flag makes `.*` span newlines | **Yes.** |
| `gh issue create … --body "$(cat <<'EOF' … EOF)"` | the outer line **and** `cat …` (command substitution is a `command` node) | **No** — `cat` is denied. This is the repo's documented convention (`docs/agents/issue-tracker.md:7`), so it will bite. |
| `cd repo && gh issue create …` | `cd repo`, `gh issue create …` | **No** — `cd` is denied. |
| `bash -c 'gh issue create …'` / `sh -c '…'` | only `bash -c '…'` (the string literal is not re-parsed) | **No.** |
| `env GH_TOKEN=… gh issue create …` / `/usr/bin/gh issue create …` | the literal text | **No** — pattern is anchored at `gh`. |
| `gh issue create … \| tee log` | both commands | **No** — `tee` is denied. |

Additional facts worth designing around:

- **Flags are not constrainable.** The pattern matches the whole command string, so an allowed
  `gh issue create *` also allows `--repo other/repo`, `--label …`, `--assignee …`. The token's scope,
  not the glob, is the real boundary. With `GH_TOKEN=${{ secrets.GITHUB_TOKEN }}` the blast radius is
  this repository; with the OpenCode App token (OIDC route) it is every repository the App is installed
  on.
- **An unmatched command is not a hang.** In non-interactive `run`, `ask` is auto-rejected:
  `permission requested: bash (…); auto-rejecting` (`packages/opencode/src/cli/cmd/run.ts:791-810`).
  The tool call fails, the model is told, and the run usually still exits 0 (§4).
- **Denied tool calls are model-visible, not workflow-visible** except in the JSON stream: a failed
  tool appears as a `tool_use` event whose `part.state.status` is `"error"`
  (`run.ts:723-733`). That is the only reliable signal that the agent tried something forbidden.
- **Do not add `"*": "allow"`.** With `"*": "deny"` first, a heredoc terminator collision that injects
  a second command is parsed as its own `command` node and denied; with a permissive catch-all it would
  execute. `"*": "deny"` also keeps `bash` visible as a tool *and* per-command checked, whereas
  `{"bash":{"*":"deny"}}` alone removes the bash tool entirely (`permission/index.ts:1020-1035`).
- **Heredoc bodies with `$(…)` still expand.** The grammar parses an unquoted heredoc body as
  `heredoc_body` containing `command_substitution`
  (<https://github.com/tree-sitter/tree-sitter-bash/blob/master/grammar.js>, `heredoc_redirect` and
  `heredoc_body` rules), so an unquoted `<<EOF` body that contains `$(date)` needs `date` allowed. A
  quoted `<<'EOF'` delimiter produces `simple_heredoc_body` with no expansions.

**Recommendation:** prefer `--body-file` over both heredocs and `$(cat …)`. If the file is written by a
previous workflow step, the agent needs no shell quoting at all and the publish is reproducible. Even
better, let the *runner* publish (§2.3), so the agent needs no write command at all.

## 2. Can the agent write `$GITHUB_STEP_SUMMARY`?

### 2.1 What the file is

`GITHUB_STEP_SUMMARY` is the per-step environment file for job summaries: *"`GITHUB_STEP_SUMMARY` is
unique for each step in a job"*, Markdown is rendered, and the usual usage is
`echo "…" >> $GITHUB_STEP_SUMMARY`
(<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands>, "Adding a job
summary").

### 2.2 Is it reachable from a locked-down agent?

The variable is in the agent's environment, because the bash tool inherits the process environment
(`packages/opencode/src/tool/shell.ts:417-427`, `{...process.env, ...extra.env}`). But all three routes
to it are closed by a tight allowlist:

1. **`edit: "deny"` blocks every file write, not just source files.** `edit` covers `edit`, `write` and
   `apply_patch` (`permission/index.ts:1020-1029`), and a `"*"` deny hides those tools from the model
   entirely (`permission/index.ts:1032-1035`).
2. **`bash` limited to `gh` blocks `echo`, `cat`, `printf`, `tee`.** Writing the summary with the shell
   needs one of those, and each is a separate `command` node (§1.3), so the deny wins.
3. **Even with `bash: allow`, the path is outside the workspace.** Absolute paths are governed by
   `external_directory`, which defaults to `"ask"` (`agent.ts:117-125`), and ask is auto-rejected in
   `run` mode. Note the scanner does not treat redirect *targets* as paths — `parts()` skips
   `redirection` nodes and `collect()` only resolves arguments of `FILES` commands such as `cat`/`cp`
   (`shell.ts:92-118, 189-219`) — so `echo x >> $GITHUB_STEP_SUMMARY` would not even raise
   `external_directory`. It is still denied by the `echo` rule, which is the point: rely on the
   allowlist, not on path scanning.

### 2.3 Recommended way to produce the summary

Do not let the model write the summary. Have the workflow write it from the machine-readable output,
exactly as `pr-review.yml` splits "model" from "publish":

- `opencode run … --format json | tee "$RUNNER_TEMP/opencode-issue.jsonl"` (stdout is one JSON event
  per line; `run.ts:669-681`).
- Extract the last completed text part with the same `jq` expression `pr-review.yml:142-146` uses.
- The publish step then writes both artifacts: `gh issue create --body-file …` and the job summary.

```bash
{
  echo "## Issue writer"
  echo
  if [ -n "${ISSUE_URL:-}" ]; then
    echo "- Created: $ISSUE_URL"
  else
    echo "- Result: no issue filed (${REASON:-no findings})"
  fi
  echo "- Model: \`$MODEL\`"
  echo "- Logs: $RUN_URL"
} >> "$GITHUB_STEP_SUMMARY"
```

This keeps the agent's blast radius at "read the repo + return text", makes publish failures ordinary
step failures, and gives the summary an artefact (the JSONL) that a human can audit.

## 3. `GH_TOKEN` + `issues: write` vs the OIDC / OpenCode App route

### 3.1 `GITHUB_TOKEN` is enough for `gh issue create|edit|close`

GitHub's own tutorial for `GITHUB_TOKEN` shows exactly this pattern — `permissions: contents: read` and
`issues: write`, then `gh issue create` with `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
(<https://docs.github.com/en/actions/tutorials/authenticate-with-github_token>, "Example 1"). The
permission table defines `issues` as *"Work with issues. For example, `issues: write` permits an action
to add a comment to an issue"*
(<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions>).
`create`, `edit`, `close` and `comment` all map to `POST /repos/{owner}/{repo}/issues` and
`PATCH /repos/{owner}/{repo}/issues/{issue_number}`, both requiring `Issues: write`
(<https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps>).

Two gotchas:

- **`permissions:` is not additive.** *"If you specify the access for any of these permissions, all of
  those that are not specified are set to `none`"* (`workflow-syntax.md`, `permissions`). A job with
  only `issues: write` cannot run `actions/checkout`; keep `contents: read`.
- **Events raised by `GITHUB_TOKEN` do not start workflows.** *"When you use the repository's
  `GITHUB_TOKEN` to perform tasks, events triggered by the `GITHUB_TOKEN` will not create a new
  workflow run"*, with narrow `pull_request` exceptions
  (<https://docs.github.com/en/actions/concepts/security/github_token>). An issue created this way will
  **not** trigger `triage.yml` (`on: issues: types: [opened]`). Neither would an App-token issue:
  `triage.yml:31-34` skips bot authors, and the App posts as `opencode-agent[bot]`.

### 3.2 What the OIDC route adds

`triage.yml` grants `id-token: write` and lets `opencode github run` exchange the OIDC token for an
OpenCode GitHub App installation token; the comment in the workflow says why: *"That token may comment
on the issue, so GITHUB_TOKEN itself stays read-only"* (`triage.yml:18-22`). The V1 GitHub docs describe
the same mechanism: *"`id-token: write` lets OpenCode exchange an OIDC token for a GitHub App token,
which supplies the permissions used to comment and push changes"*
(<https://opencode.ai/v1/docs/github/>), and `use_github_token: true` is the documented opt-out for
callers who want to supply `GITHUB_TOKEN` themselves.

Practical comparison for an issue writer that uses plain `opencode run` (not `opencode github run`):

| | `GH_TOKEN=${{ secrets.GITHUB_TOKEN }}` + `issues: write` | OIDC + OpenCode App |
| --- | --- | --- |
| Setup | nothing beyond the workflow | App installed on the repo; `id-token: write`; `opencode github run` does the exchange |
| Identity | `github-actions[bot]` | `opencode-agent[bot]` |
| Scope | this repo, capped by `permissions:` | every repo the App is installed on, capped by the App's permissions |
| Can it trigger downstream workflows? | No (by design) | Yes (installation-token events are ordinary events) — but `triage.yml` filters bot authors anyway |
| `gh issue create/edit/close` | Works | Works |

For an issue writer, `GITHUB_TOKEN` + `issues: write` is sufficient and strictly smaller. Choose the App
route only if you need the App identity, cross-repo reach, or want created issues to fire other
workflows. `opencode run` does not do the OIDC exchange itself, so mixing the two means calling
`opencode github run` instead of `opencode run`.

## 4. Model failure and timeout behaviour

### 4.1 Exit codes (source, not docs)

`opencode run` sets `process.exitCode = 1` for a prompt error and for any `session.error` event
(`run.ts:826-863`, `run.ts:768-778`):

- **1** — model/provider/agent error, or an unknown-but-fatal setup error (`run.ts:279`, `:344`, `:423`).
- **0** — the run finished, **including when the model gave up after permission denials**: a denied tool
  is a tool-level error, emitted as a `tool_use` event, not a `session.error`.
- **124 / 137** — from `timeout -k …`: expired, and killed after the grace period. `pr-review.yml:136-137`
  treats both as `timeout`.

Exit status is therefore **not** enough to tell "no findings" from "wanted to publish, was denied".
`pr-review.yml` needs three checks for the same reason: exit status, non-empty text extraction, and
`jq` parse of the JSONL (`pr-review.yml:136-146`).

### 4.2 What to log

- `--print-logs --log-level INFO`: structured logs to stderr, so stdout stays clean JSONL
  (<https://opencode.ai/v1/docs/cli/>, Global Flags).
- `--format json`: one event per line on stdout; keep the file (`tee`) — it is the only record of
  `permission.asked`, `tool_use` errors and `error` events.
- On failure, restate the reason in the log and in the summary: `echo "::error::…"` plus the run URL.
  The `report` job in `pr-review.yml:191-247` is the model: a separate job with its own budget publishes
  the outcome after the agent has been killed, because a timed-out job cannot report on itself.
- Keep the prompt and the reason out of the summary when they may contain model output; the summary is
  rendered Markdown.

### 4.3 Classification rules for an issue writer

| Evidence | Class |
| --- | --- |
| `OPENCODE_PERMISSION` fails `jq`, key/model missing, `opencode` absent, install failed, checkout failed | `infra` |
| `status == 124 \|\| status == 137` | `timeout` |
| `status != 0` | `agent_failed` |
| exit 0, JSONL has no `text` part, or the final text is neither the `NO_ISSUE` sentinel nor a valid payload | `agent_failed` |
| exit 0 + `NO_ISSUE` sentinel | **success, no findings** (`reason` empty) |
| exit 0 + valid payload, but `gh issue create` fails | `infra` (permissions/token), reported by the publish step |

The "no findings" case must be an explicit token from the model, not an empty string: an empty answer is
indistinguishable from a truncated run.

## 5. Is `--agent plan` the right tool?

`--agent plan` is a *prompt/UX* mode, not a sandbox for this job:

- Plan denies file edits, writes and patches **except** Markdown plan files under `.opencode/plans/`
  and OpenCode's data directory, and *"Does not restrict the bash tool. Commands follow your permission
  config."* (<https://opencode.ai/v1/docs/agents/>, "Use plan").
- Plan's defaults are merged **before** your config, so a global `edit: "deny"` overrides its plan-file
  exceptions (`agent.ts:156-177`, last-match-wins per `next.test.ts:132-143`). With `edit: deny` in
  `OPENCODE_PERMISSION`, plan's extra write path is closed too — but that is the permission config doing
  the work, not `--agent plan`.
- An unknown `--agent` name does **not** fail: it logs `agent "…" not found. Falling back to the default
  agent` (`run.ts:586-604`). Never treat the agent name as a security boundary.

**Recommendation:** `--agent plan` is optional and adds nothing to safety here; use the default agent
with `edit: "deny"` and a bash allowlist. A dedicated agent (`.opencode/agents/issue-writer.md`) is
worth it only to pin a prompt/model and to narrow `task` (subagents inherit permissions per
`agent.ts:277-310`), not as a security control.

**Preventing edits and commits:**

- Edits: `edit: "deny"` (hides `edit`/`write`/`apply_patch`).
- Commits: `opencode run` never commits — auto-commit/push/PR logic lives only in
  `opencode github run` (`packages/opencode/src/cli/cmd/github.handler.ts:461-463, 525-600`). With `bash`
  limited to `gh`, `git commit` is denied as well. `actions/checkout` with `persist-credentials: false`
  removes the remaining push credential.
- Never pass `--auto`, `--yolo` or `--dangerously-skip-permissions` (`run.ts:245-253`); they turn every
  `ask` into an allow.

## 6. Ready-to-paste fragment

Recommended shape: the agent only reads and returns JSON; the workflow publishes and classifies.
Model this on `pr-review.yml` (budget/checkout/install split, `timeout`, JSONL, separate report job).

```yaml
jobs:
  write:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    permissions:
      contents: read        # checkout; permissions are not additive
      issues: write         # gh issue create/edit/close/comment
    outputs:
      reason: ${{ steps.outcome.outputs.reason }}
      issue: ${{ steps.publish.outputs.issue }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
          fetch-depth: 1

      - name: Install OpenCode
        id: install
        timeout-minutes: 3
        env:
          OPENCODE_VERSION: 1.19.6
          OPENCODE_SHA256: 47734e08968b30cc22a0bffb6d9feeed76ad4aa743213a12122040392d09a057
        run: |
          set -euo pipefail
          archive="$RUNNER_TEMP/opencode.tar.gz"
          curl -fsSLo "$archive" \
            "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-x64.tar.gz"
          echo "${OPENCODE_SHA256}  ${archive}" | sha256sum -c -
          mkdir -p "$HOME/.opencode/bin"
          tar -xzf "$archive" -C "$HOME/.opencode/bin"
          echo "$HOME/.opencode/bin" >> "$GITHUB_PATH"

      - name: Write issue with OpenCode
        id: agent
        timeout-minutes: 8
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          MODEL: ${{ vars.OC_ISSUE_MODEL }}
          # Catch-all first, specific rules after: last matching rule wins.
          # The agent may read the issue tracker, nothing else.
          # To let the agent publish itself, add "gh issue create *": "allow"
          # (and nothing else) to the bash object -- see section 1.3.
          OPENCODE_PERMISSION: '{"edit":"deny","bash":{"*":"deny","gh issue view *":"allow","gh issue list *":"allow","gh label list *":"allow","gh repo view *":"allow"}}'
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          RUN_ID: ${{ github.run_id }}
        run: |
          set -uo pipefail
          fail() {
            echo "reason=$1" >> "$GITHUB_OUTPUT"
            echo "::error::OpenCode issue-writer outcome: $1"
            exit 1
          }

          # Invalid JSON is silently ignored by OpenCode, which would restore the
          # permissive defaults. Refuse to run instead.
          printf '%s' "$OPENCODE_PERMISSION" | jq -e 'type == "object"' >/dev/null || fail infra
          [ -n "${OPENCODE_API_KEY:-}" ] || fail infra
          [ -n "${MODEL:-}" ] || fail infra
          command -v opencode >/dev/null 2>&1 || fail infra
          gh auth status >/dev/null 2>&1 || fail infra

          set +e
          timeout -k 10s 420s opencode run \
            --print-logs --log-level INFO \
            --model "$MODEL" \
            --format json \
            "You are filing a GitHub issue in $GITHUB_REPOSITORY.

          Investigate the repository and decide whether a new issue is warranted.
          Read issue-tracker conventions from docs/agents/issue-tracker.md.
          Do not edit files, do not commit, do not run git, do not create branches.
          You may read existing issues with gh issue view / gh issue list.

          Reply with exactly one JSON object as your final message, no prose and no code fences:
            {\"title\": \"<one line>\", \"body\": \"<GitHub-flavoured Markdown>\"}
          or the single token NO_ISSUE when no issue is warranted.
          Keep the body under 4000 characters." \
            < /dev/null | tee "$RUNNER_TEMP/opencode-issue.jsonl"
          status=${PIPESTATUS[0]}
          set -e

          if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
            fail timeout
          elif [ "$status" -ne 0 ]; then
            echo "opencode exited with status $status" >&2
            fail agent_failed
          fi

          # Tool-level failures (denied commands, gh errors) exit 0; surface them.
          if jq -e 'select(.type == "tool_use" and .part.state.status == "error")' \
               "$RUNNER_TEMP/opencode-issue.jsonl" >/dev/null 2>&1; then
            jq -r 'select(.type == "tool_use" and .part.state.status == "error")
                   | "tool error: \(.part.state.error)"' \
              "$RUNNER_TEMP/opencode-issue.jsonl" >&2
          fi

          jq -sr 'map(select(.type == "text") | .part.text) | last // empty' \
            "$RUNNER_TEMP/opencode-issue.jsonl" > "$RUNNER_TEMP/opencode-issue.md" || true
          [ -s "$RUNNER_TEMP/opencode-issue.md" ] || fail agent_failed

          if [ "$(tr -d '[:space:]' < "$RUNNER_TEMP/opencode-issue.md")" = "NO_ISSUE" ]; then
            echo "noop=true" >> "$GITHUB_OUTPUT"
            exit 0
          fi

          # Tolerate a fenced JSON block, then require title+body.
          sed -e '/^```/d' "$RUNNER_TEMP/opencode-issue.md" > "$RUNNER_TEMP/issue.json"
          jq -e 'has("title") and has("body")' "$RUNNER_TEMP/issue.json" >/dev/null || fail agent_failed
          jq -r '.title' "$RUNNER_TEMP/issue.json" > "$RUNNER_TEMP/issue-title.txt"
          jq -r '.body'  "$RUNNER_TEMP/issue.json" > "$RUNNER_TEMP/issue-body.md"

      - name: Publish issue
        id: publish
        if: steps.agent.outputs.noop != 'true'
        timeout-minutes: 2
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GH_REPO: ${{ github.repository }}
        run: |
          set -euo pipefail
          url=$(gh issue create \
            --title "$(cat "$RUNNER_TEMP/issue-title.txt")" \
            --body-file "$RUNNER_TEMP/issue-body.md")
          echo "issue=$url" >> "$GITHUB_OUTPUT"
          echo "Created $url"

      - name: Write job summary
        if: always()
        env:
          REASON: ${{ steps.outcome.outputs.reason }}
          ISSUE: ${{ steps.publish.outputs.issue }}
          MODEL: ${{ vars.OC_ISSUE_MODEL }}
        run: |
          {
            echo "## Issue writer"
            echo
            if [ -n "${ISSUE:-}" ]; then
              echo "- Created: $ISSUE"
            else
              echo "- No issue filed (${REASON:-no findings})"
            fi
            echo "- Model: \`${MODEL:-unset}\`"
            echo "- Logs: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          } >> "$GITHUB_STEP_SUMMARY"

      - name: Classify outcome
        id: outcome
        if: always()
        env:
          INSTALL_RESULT: ${{ steps.install.outcome }}
          AGENT_RESULT: ${{ steps.agent.outcome }}
          AGENT_REASON: ${{ steps.agent.outputs.reason }}
          PUBLISH_RESULT: ${{ steps.publish.outcome }}
        run: |
          set -euo pipefail
          reason="${AGENT_REASON:-}"
          if [ -z "$reason" ]; then
            if [ "$INSTALL_RESULT" = "failure" ]; then
              reason=infra
            elif [ "$AGENT_RESULT" = "failure" ]; then
              reason=agent_failed
            elif [ "$PUBLISH_RESULT" = "failure" ]; then
              reason=infra
            fi
          fi
          echo "reason=$reason" >> "$GITHUB_OUTPUT"
          [ -z "$reason" ] || echo "::notice::Issue-writer outcome: $reason"
```

If you insist on the agent calling `gh` itself, the minimal deltas are: add
`"gh issue create *":"allow"` to `bash`; keep `--title`/`--body` inline (a `$(cat …)` body is denied);
drop the publish step; and treat exit 0 without a `gh issue create` success URL in the JSONL as
`agent_failed`, because a denied call also exits 0.

## Confidence / open questions

### High confidence

- Bash patterns are the raw tree-sitter `command` text, one pattern per command, redirects and heredoc
  bodies included; `*` is a whole-string regex wildcard with an optional trailing `" *"`
  (`shell.ts:120-126,393-412`; `wildcard.ts`; `shell.test.ts:243-261,972-988`;
  `wildcard.test.ts:11-27`).
- Last-match-wins with preserved key order; `"*": "deny"` first is the correct catch-all
  (`permission/index.ts:844-854`; `next.test.ts:132-165`).
- Invalid `OPENCODE_PERMISSION` JSON is skipped and the permissive defaults return
  (`config/config.ts:559-565`).
- `edit: "deny"` removes `edit`/`write`/`apply_patch` and denies all edit patterns
  (`permission/index.ts:1020-1035`; V1 docs).
- Ask is auto-rejected in non-interactive `run`, and permission denials do not change the exit code
  (`run.ts:791-810`; `run.ts:826-863`).
- `GITHUB_TOKEN` + `issues: write` covers `gh issue create/edit/close`; `permissions:` overrides
  unlisted scopes to `none`; `GITHUB_TOKEN` events do not start workflows (GitHub docs cited in §3).
- `--agent plan` does not restrict bash and allows plan-file writes; `edit: deny` is what actually
  blocks writes (V1 agents docs; `agent.ts:156-177`).

### Medium confidence / unverified

- **The heredoc-wide match was not executed end to end.** It follows from `source()` returning the
  `redirected_statement` text plus the `s` flag, but the 1.19.6 binary is not installed here (local
  OpenCode is 2.2.4) and I did not run it. A one-off dry run with a fake model, or a local
  `opencode debug` session, would settle it.
- **`plan_exit` in a headless run.** Plan mode allows the `plan_exit` tool (`agent.ts:164`); with
  `question: allow` it may try to ask. `pr-review.yml` uses plan successfully, and `edit: deny` still
  wins afterwards, but I did not observe the interaction.
- **Step-summary details.** The docs say the file is per step; the 1 MiB/large-summary limits are not
  stated in the page I read, so size limits are unverified.
- **App-token event triggering.** That installation-token events start workflows is general GitHub
  behaviour, not something this repo exercises; `triage.yml` would skip the bot author anyway.
- **`gh` version.** `--parent`, `--blocked-by` and `--add-sub-issue` need `gh` ≥ 2.94
  (`docs/agents/issue-tracker.md:10-11`). The runner image's `gh` version was not checked; an older
  `gh` makes those flags fail at publish time (classified `infra`).

## Sources

Repo (first-party):

- `.github/workflows/pr-review.yml` — pinned version/SHA, `OPENCODE_PERMISSION` (`:105`), the
  `timeout`/`PIPESTATUS`/`jq` block (`:107-146`), classification (`:157-187`), the `report` job
  (`:191-247`).
- `.github/workflows/triage.yml` — read-only permission object (`:94`), OIDC rationale (`:18-22`),
  `opencode github run` (`:112`).
- `.github/workflows/interactive.yml` — `opencode github run`, commit/push behaviour, `GH_TOKEN`
  rationale.
- `docs/opencode-workflows.md:82-100,118-132` — the repo's own description of the read-only triage and
  review runs.
- `docs/agents/issue-tracker.md:7-11` — heredoc convention (and why it conflicts with a strict
  allowlist).

OpenCode:

- <https://opencode.ai/v1/docs/permissions/> — V1 `permission` object, granular rules, last match wins,
  wildcard `*`/`?`, `external_directory`.
- <https://opencode.ai/v1/docs/agents/> — Plan's edit exceptions and "does not restrict the bash tool".
- <https://opencode.ai/v1/docs/cli/> — `opencode run` flags, `--print-logs`, `--format json`,
  `OPENCODE_PERMISSION`.
- <https://opencode.ai/v1/docs/github/> — OIDC vs `use_github_token`.
- <https://opencode.ai/docs/permissions/> — V2 page stating V1 uses different names (why V1 docs apply).
- Source at `v1.19.6`: `packages/opencode/src/tool/shell.ts`, `permission/index.ts`,
  `cli/cmd/run.ts`, `agent/agent.ts`, `config/config.ts`, `cli/cmd/github.handler.ts`,
  `packages/core/src/util/wildcard.ts`, `packages/core/src/v1/config/permission.ts`, plus tests
  `packages/opencode/test/tool/shell.test.ts`, `test/permission/next.test.ts`,
  `test/util/wildcard.test.ts`.
- <https://github.com/tree-sitter/tree-sitter-bash/blob/master/grammar.js> — `heredoc_redirect`,
  `heredoc_body`, `command_substitution`.

GitHub:

- <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands> — job summary.
- <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions> —
  permission table, "all of those that are not specified are set to `none`".
- <https://docs.github.com/en/actions/tutorials/authenticate-with-github_token> — `contents: read` +
  `issues: write` + `gh issue create`.
- <https://docs.github.com/en/actions/concepts/security/github_token> — events triggered by
  `GITHUB_TOKEN` do not create workflow runs.
- <https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps> — `Issues:
  write` for `POST /issues` and `PATCH /issues/{n}`.
