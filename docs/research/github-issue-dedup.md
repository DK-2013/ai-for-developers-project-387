# Deduplicating Lighthouse issues by a body fingerprint

Question: how does the daily Lighthouse run avoid creating a duplicate issue for a finding it already
reported? The finding carries a hidden fingerprint in the issue body:

```markdown
<!-- lighthouse: /owner#performance -->
```

This note answers whether GitHub issue search can match that fingerprint, what the list-and-match
alternative costs, the exact `gh` flags, and the edges that bite in a scheduled workflow. Everything
below was checked on 2026-11-21 with `gh` 2.103.3 against GitHub.com.

**Verdict: do not use search. List every issue and match the fingerprint locally.**

## 1. Does GitHub issue search index HTML comments?

### What the docs say

Issue search covers the title, body, and comments. Without an `in:` qualifier all three are searched;
`in:body` restricts to the body ([Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-the-title-body-or-comments)).

GitHub renders an HTML comment as hidden content ([Hiding content with comments](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#hiding-content-with-comments)),
but the docs never say whether hidden comment text is in the search index. That part is
**undocumented**.

What the docs do say, and it matters more:

- "Currently our search doesn't support exact matching."
  ([About searching on GitHub](https://docs.github.com/en/search-github/getting-started-with-searching-on-github/about-searching-on-github))
- "Issues and pull requests are indexed when they are created or modified." — same page. No indexing
  delay is documented.

### What the index actually does (empirical)

Hidden comment text **is** indexed today. Two read-only probes:

1. `cli/cli` issues created from the bug template contain
   `<!-- Note: Set GH_DEBUG=true ... verbose logs with HTTP traffic details. -->`, and a separate
   hidden comment with `https://hackerone.com/github`. Issue
   [#15126](https://github.com/cli/cli/issues/15126) has `hackerone` only inside the hidden comment —
   removing comments from the raw body yields zero occurrences, and the issue has no comments — yet
   `gh search issues 'hackerone in:body' --repo cli/cli` returns it. Issues 13022, 14317 and 10998 show
   the same: no visible `hackerone`, still matched.

2. In this repository, issue #34 has `<!-- пусто: ни один тикет ещё не закрыт -->` and no comments.
   The phrase occurs nowhere outside the comment, yet
   `gh search issues '"ни один тикет ещё не закрыт"' --match body` returns #34.

So `gh search issues` *can* match text inside `<!-- ... -->`. But that is not enough to make it a
deduplication key.

### Why search still cannot be the key

- **No exact matching** (docs above). A hit is a relevance match, not equality.
- **Punctuation is parsed as syntax.** The literal fingerprint query fails:

  ```text
  $ gh search issues '"lighthouse: /owner"' --repo DK-2013/ai-for-developers-project-387
  Invalid search query "( \"lighthouse:\" /owner\" ) repo:... type:issue".
  The search query contains invalid syntax.
  ```

  `"lighthouse /owner"` succeeds but matches #37 by tokens, not by the fingerprint string.
  `"/owner#performance"` returns nothing; `"#performance"` returns unrelated issues. You would have to
  search a token subset, which can collide across findings (`/owner` also appears in visible prose).
- **Result caps.** The search API returns at most 1,000 results per query and 100 per page
  ([Search issues and pull requests](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-issues-and-pull-requests));
  `gh search issues --limit` is validated to 1–1000
  ([`pkg/cmd/search/issues/issues.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/search/issues/issues.go)).
- **Rate limit.** 30 search requests per minute for authenticated requests
  ([Search](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28)).
- **Freshness.** The index is updated on create/modify, but no lag bound is documented. A run that
  searches immediately after a previous run may miss the issue it just created.

`gh search issues` also injects `type:issue`, so PRs are excluded
([source](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/search/issues/issues.go)); that is fine, but
it does not fix the exactness problem.

## 2. The alternative: list issues and match locally

`gh issue list` has two backends, and the difference is invisible in the help text:

- Plain `gh issue list` (state/assignee/author filters only) uses the GraphQL `Repository.issues`
  connection ([`pkg/cmd/issue/list/http.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/http.go#L18-L80)).
- Adding `--label`, `--search`, `--milestone`, or `--type` switches to the search backend
  ([`list.go` L235](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/list.go#L235)).

That is the trap: `gh issue list --label lighthouse` is a search query under the hood, with the 1,000
result cap and index-freshness caveats. To stay on the reliable path, filter labels in `jq` instead of
passing `--label`.

### Pagination and limits

- `--limit` defaults to 30; the GraphQL query fetches pages of at most 100
  ([`http.go` L85](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/http.go#L85)), issuing
  as many requests as needed until `--limit` is reached. There is no 1,000-item cap on this path.
- Measured against `cli/cli` on 2026-11-21: `--limit 250` returned 250 rows in ~2.0 s; `--limit 1000`
  returned 1000 rows in ~7.65 s (including `--json number` only). Bodies make responses larger but do
  not change the request count.
- Ordering is `CREATED_AT DESC`; if the repo holds more issues than `--limit`, the oldest are dropped.
  Treat `returned == limit` as "possibly truncated" and raise the limit.

### Cost

`gh issue list` is GraphQL. A 1,000-issue snapshot is 10 requests of 100 nodes. GraphQL cost is the
number of requests per connection divided by 100, rounded, minimum 1 point
([Resource limitations](https://docs.github.com/en/graphql/overview/resource-limitations)); so the
snapshot costs **1 point**. `GITHUB_TOKEN` gets 1,000 points/hour per repository (same page), and a
release with a handful of findings costs 1–2 more points. Cost is a non-issue at 100+ issues.

REST fallback, if you ever need it:

```bash
gh api --paginate "repos/$GITHUB_REPOSITORY/issues?state=all&per_page=100" \
  --jq '.[] | select(.pull_request == null) | {number, state, body}'
```

REST `per_page` maxes at 100 and defaults to 30
([List repository issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#list-repository-issues)).
Remember REST returns PRs as issues, hence the `select(.pull_request == null)`; REST `state` is
lowercase (`open`/`closed`) and must be normalised against `gh`'s uppercase `OPEN`/`CLOSED`.

### JSON shape

`--json number,state,body,labels` yields `state: "OPEN" | "CLOSED"`, `labels` as objects
(`[{"name": ...}]`), and the raw markdown body, comments included. Verified with
`gh issue list --state all --limit 2 --json number,state,labels,url` in this repository.

## 3. Exact `gh` flags

### Create

```bash
gh issue create \
  --title "Lighthouse: /owner performance" \
  --label lighthouse \
  --body-file /tmp/body.md
```

- `-l, --label name` is a string slice: repeat it or pass a comma-separated list
  (`--label "bug,help wanted"`). See `gh issue create --help`.
- `-F, --body-file file` reads the body from a file; `-` reads stdin.
- On success the command prints **only the new issue URL to stdout**
  ([`create.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/create/create.go)); parse the
  number from it. Errors go to stderr with a non-zero exit.
- `gh issue create --label missing` does **not** create anything: `gh` resolves label names against
  the repo first and fails with `could not add label: 'missing' not found`
  ([`LabelsToIDs`](https://github.com/cli/cli/blob/v2.103.3/api/queries_repo.go#L809-L824)). Create
  the label first.

### Edit

```bash
gh issue edit 42 --body-file /tmp/body.md
```

`-F, --body-file` (stdin via `-`) replaces the whole body; `--add-label` appends a label. On success
each edited issue URL is printed to stdout
([`edit.go` L526](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/edit/edit.go#L526)).
Editing works on closed issues — `PATCH /repos/{owner}/{repo}/issues/{n}` has no state precondition
([Update an issue](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28#update-an-issue)).

### Close

```bash
gh issue close 42 --comment "Budget is met again." --reason completed
```

`-c, --comment` posts a comment, then closes; `-r, --reason` accepts `completed`, `not planned`, or
`duplicate`. The comment is posted *before* the state mutation
([`close.go` L148](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/close/close.go#L148)), so a
failed close leaves the comment behind — the operation is not atomic.

**Already-closed issue:** `gh` fetches the state, prints
`! owner/repo#42 (title) is already closed` to stderr, returns success, and **never posts the
comment** ([`close.go` L116-L119](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/close/close.go#L116-L119)).
Exit code 0 plus a dropped comment is the failure mode to guard against: check `state` from the
listing, or run `gh issue reopen 42` first.

`gh issue reopen <n> [--comment text]` exists and is the right move when a closed issue's finding
returns.

### Labels

```bash
gh label create lighthouse \
  --color FBCA04 \
  --description "Lighthouse CI budget finding" \
  --force
```

- Without `--force`, a duplicate exits 1 with
  `label with name "lighthouse" already exists; use --force to update its color and description`.
  Verified live against an existing label; the label was unchanged.
- With `--force`, the create is idempotent: on HTTP 422 `already_exists`, `gh` PATCHes color and
  description instead ([`create.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/label/create.go)).
- Always pass an explicit `--color`: without it `gh` picks a random color, so a forced create would
  repaint the label on every run.

## 4. Permissions

- Creating or editing a label requires **write** access to the repository
  ([Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)).
  Applying a label only needs triage, but creating one does not.
- The label endpoints are governed by the repository **Issues** permission with write access — the
  permissions reference lists `POST /repos/{owner}/{repo}/labels` under `Issues: write`
  ([Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)).
- In Actions, grant it explicitly: `permissions: issues: write` (`issues` is defined as "Work with
  issues", and the same permission names back `GITHUB_TOKEN`)
  ([Workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)).
  A read-only token makes the first `gh label create` fail with 403/404.

## 5. Reporting "created" vs "updated" in the step summary

Branch on the lookup result, not on parsing API responses:

- Hit → `gh issue edit <n> --body-file ...` → `updated #<n>`.
- No hit → `gh issue create ...` → capture the printed URL → `created #<n>`.
- Closed hit → `gh issue reopen <n>` first → report `reopened #<n>`, then `updated`.

Write the rows to `$GITHUB_STEP_SUMMARY` as a Markdown table; the variable holds a per-step file and
appending is the documented interface
([Adding a job summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)).
Keep it small: 1 MiB per step. Do not try to infer the outcome from `gh` output text beyond the URL.

## 6. Edge cases

| Case | Handling |
| --- | --- |
| Closed issue with the same fingerprint | List `--state all`, not `--state open`. A closed match must be reopened and rewritten, otherwise the next run creates a fresh duplicate and the closed one becomes noise. |
| More than 100 issues | `--limit 1000` pages internally at 100/request (10 requests, 1 GraphQL point). If the result length equals the limit, raise it or switch to the REST `--paginate` fallback. |
| Label missing | `gh issue create --label` fails before creating anything. Bootstrap with `gh label create ... --force` and an explicit color/description. |
| Search index lag | Irrelevant on the list path: it reads the issues connection directly. Do not reintroduce search with `--label`. |
| Two findings, same fingerprint in one run | Deduplicate findings in memory before publishing; the snapshot map is stale after the first create. |
| Concurrent workflow runs | Both can list before either writes and create duplicates. Add a `concurrency:` group to the workflow ([Workflow syntax: concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)) or accept the rare duplicate. |
| Fingerprint normalisation | Emit exactly one canonical line, no whitespace variance, no `>` in the value: `<!-- lighthouse: /owner#performance -->`. Match by exact string equality, never by regex on user text. |
| Body rewrite drops the fingerprint | The rendered body must always be generated from the template that contains the fingerprint line. |
| Issues disabled in the repo | `gh issue list` fails with "the 'owner/repo' repository has disabled issues" ([`http.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/http.go#L63-L65)); fail the job rather than silently skipping. |

## 7. Recommended matching scheme

Ready to drop into the workflow step. `set -euo pipefail` is assumed; `jq` is preinstalled on
`ubuntu-latest`.

```bash
repo="${GITHUB_REPOSITORY:?}"
label="lighthouse"
limit=1000
issues_json="$(mktemp)"
fp_map="$(mktemp)"
trap 'rm -f "$issues_json" "$fp_map"' EXIT

# 1. Idempotent label. Needs Issues: write.
gh label create "$label" \
  --color "FBCA04" \
  --description "Lighthouse CI budget finding" \
  --force >/dev/null

# 2. Snapshot every issue, open and closed. No --label/--search/--milestone/--type:
#    those switch gh to the search backend.
gh issue list --repo "$repo" --state all --limit "$limit" \
  --json number,state,body > "$issues_json"

if [ "$(jq 'length' "$issues_json")" -eq "$limit" ]; then
  echo "::warning::issue snapshot hit --limit=$limit; dedup may miss older issues"
fi

# 3. Exact fingerprint -> issue map, built from the raw body (comments included).
jq -r '
  .[] as $i
  | ($i.body // "")
  | [scan("<!-- lighthouse: [^>]+ -->")][]
  | [., ($i.number | tostring), $i.state] | @tsv
' "$issues_json" > "$fp_map"

find_issue() {
  awk -F'\t' -v fp="$1" '$1 == fp { print $2 "\t" $3; exit }' "$fp_map"
}

{
  echo "### Lighthouse CI"
  echo
  echo "| Result | Issue | Fingerprint |"
  echo "| --- | --- | --- |"
} >> "$GITHUB_STEP_SUMMARY"

publish_finding() {
  local fp="$1" title="$2" body_file="$3"
  local hit number state url

  hit="$(find_issue "$fp")"
  if [ -n "$hit" ]; then
    number="${hit%%$'\t'*}"
    state="${hit##*$'\t'}"
    if [ "$state" = "CLOSED" ]; then
      gh issue reopen "$number" >/dev/null
    fi
    gh issue edit "$number" --body-file "$body_file" >/dev/null
    printf '| updated | #%s | `%s` |\n' "$number" "$fp" >> "$GITHUB_STEP_SUMMARY"
  else
    url="$(gh issue create --title "$title" --label "$label" --body-file "$body_file")"
    number="${url##*/}"
    printf '| created | #%s | `%s` |\n' "$number" "$fp" >> "$GITHUB_STEP_SUMMARY"
  fi
}
```

Call `publish_finding "<!-- lighthouse: /owner#performance -->" "Lighthouse: /owner performance" /tmp/body.md`
once per finding, after deduplicating the findings list by fingerprint. The body file must contain the
same fingerprint line that was passed as the key.

If the issue volume ever outgrows the limit, replace step 2 with:

```bash
gh api --paginate "repos/$repo/issues?state=all&per_page=100" \
  --jq '[.[] | select(.pull_request == null) | {number, state, body}]' \
  | jq -s 'add' > "$issues_json"
```

and map `state` with `ascii_upcase` when building `fp_map`.

## 8. Unverified points and assumptions

- **HTML-comment indexing is undocumented.** It works on 2026-11-21 (probes above), but GitHub can
  change the analyser without notice. This is exactly why the recommendation does not depend on it.
- **Search index lag for issues is undocumented.** The docs only state that issues are indexed on
  create/modify; no latency bound is published, and no lag was measured (that would need a disposable
  repository plus write access).
- **Read-after-write freshness of `gh issue list` is assumed.** GitHub does not document that the
  issues connection is immediately consistent; it reads the primary store, so it is expected to be.
- **The 1,000-result behaviour of `gh issue list --label` beyond the warning was not exercised.** The
  source sets `SearchCapped` when `--limit > 1000` and prints a warning
  ([`list.go` L219](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/list.go#L219)); the
  actual truncation point was not tested.
- **`gh issue create --label` failing on a missing label** is source-verified, not exercised live
  (creating an issue was out of scope).
- **GitHub Enterprise Server** may differ in search backend, label permissions, and `gh` feature
  detection; not tested.
- **`gh issue close` on a closed issue** was not run against a live issue; the early return and dropped
  comment are read from the v2.103.3 source linked above.

## Sources

- [Searching issues and pull requests](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests)
- [About searching on GitHub](https://docs.github.com/en/search-github/getting-started-with-searching-on-github/about-searching-on-github)
- [Basic writing and formatting syntax — hiding content with comments](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#hiding-content-with-comments)
- [REST: search issues and pull requests](https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-issues-and-pull-requests)
- [REST: issues](https://docs.github.com/en/rest/issues/issues?apiVersion=2022-11-28)
- [REST: labels](https://docs.github.com/en/rest/issues/labels?apiVersion=2022-11-28)
- [Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
- [Permissions required for GitHub Apps](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [Workflow syntax: permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [Workflow commands: adding a job summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)
- [GraphQL resource limitations](https://docs.github.com/en/graphql/overview/resource-limitations)
- `gh` manual: [issue create](https://cli.github.com/manual/gh_issue_create),
  [issue edit](https://cli.github.com/manual/gh_issue_edit),
  [issue close](https://cli.github.com/manual/gh_issue_close),
  [issue list](https://cli.github.com/manual/gh_issue_list),
  [label create](https://cli.github.com/manual/gh_label_create),
  [search issues](https://cli.github.com/manual/gh_search_issues)
- `gh` v2.103.3 source:
  [`issue/list/list.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/list.go),
  [`issue/list/http.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/list/http.go),
  [`issue/close/close.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/close/close.go),
  [`issue/create/create.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/create/create.go),
  [`issue/edit/edit.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/issue/edit/edit.go),
  [`label/create.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/label/create.go),
  [`api/queries_repo.go`](https://github.com/cli/cli/blob/v2.103.3/api/queries_repo.go),
  [`search/issues/issues.go`](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/search/issues/issues.go)
