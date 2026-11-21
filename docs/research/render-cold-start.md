# Render free tier: cold start and a reliable CI warm-up

Research for issue #36. Question: how long does a Render Free web service take to wake, what does it
return while waking, and what warm-up budget is reliable from GitHub Actions?

Scope: primary sources only — Render documentation (and its archived copies, see
[Sources](#sources)), Render's public status API, the `curl` manual, and the GitHub Actions /
runner-images documentation. Our own measurement is reported as data, not as a docs claim.

## TL;DR

| Item | Value | Source |
| --- | --- | --- |
| Spin-down after idle | 15 minutes without inbound traffic (HTTP or WebSocket) | [Render: Deploy for Free](https://render.com/docs/free#spinning-down-on-idle) |
| Documented wake-up time | "about one minute" | [Render: Deploy for Free](https://render.com/docs/free#spinning-down-on-idle) |
| Free instance size | 0.1 CPU, 512 MB RAM | [Render: Compute Plans](https://render.com/docs/compute-plans#all-plans) |
| Instances per Free service | 1, scaling unavailable | [Render: Scaling](https://render.com/docs/scaling#scaling-limits) |
| Status while waking | `503 Service Unavailable` with a loading page | [Render: Troubleshooting Deploys](https://render.com/docs/troubleshooting-deploys#503-service-unavailable) |
| Observed here (2026-11-21) | TCP connect in 36 ms, then **0 bytes for 120 s**, curl exit 28 | This note, [Measurement](#measurement-2026-11-21) |
| Recommended CI budget | **300 s total** (275 s retry window + one 25 s attempt) | [Recommendation](#recommended-readiness-loop-for-github-actions) |

The map budget of "up to 5 minutes" is right and should stay: the documented minute is optimistic,
and this repository has already seen 90 s of silence.

## Documented free-tier behaviour

### Spin-down and wake-up

Render spins down a Free web service after **15 minutes** without inbound traffic; the next HTTP
request or WebSocket connection spins it back up, and "this process takes **about one minute**"
(<https://render.com/docs/free#spinning-down-on-idle>). The same page notes that a loading page is
shown to connecting browsers while the service starts.

Older wording of the same page is blunter about client-visible behaviour: "Spinning up a service
takes up to a minute, which causes a noticeable delay for incoming requests until the service is
back up and running. For example, a browser page load will hang temporarily."
(<https://web.archive.org/web/2024/https://render.com/docs/free.md>, archived 2024 snapshot of the
official page.)

Two Free-plan facts shape the cold start:

- The Free compute plan is **0.1 CPU / 512 MB** (<https://render.com/docs/compute-plans>). Starting
  Node, running migrations and building the HTTP server on 0.1 CPU is what makes "one minute"
  plausible rather than instant.
- A Free service has **max instance count 1 (scaling unavailable)**
  (<https://render.com/docs/scaling#scaling-limits>). There is no second instance to absorb traffic
  during a wake, so concurrent CI requests do not warm it faster; they queue behind the same single
  instance. Render does not document a separate per-request limit during start-up — the single
  instance is the limit.
- Idle spin-down is not the only suspension path: exhausting the 750 monthly instance hours
  suspends all Free web services until the start of the next month
  (<https://render.com/docs/free#free-instance-hours>). A suspended service also does not wake.

### What a sleeping service returns

Render's deploy troubleshooting page lists, under **503 Service Unavailable**, "A
[free service](https://render.com/docs/free) is spinning up from idle. Render displays a loading page
while your service starts, and deploy logs appear once the spin-up is complete."
(<https://render.com/docs/troubleshooting-deploys#503-service-unavailable>).

So the documented answer to "what does the client see" is **HTTP 503 with an HTML loading page**,
not a timeout and not an empty reply. That is the happy path. It is also the path that breaks naive
CI checks: without `--fail`, `curl` exits 0 on a 503 body, so a workflow can go green while the
service is still waking (see curl semantics below).

Render's own health checks use a **5 s** timeout and accept any `2xx`/`3xx`
(<https://render.com/docs/health-checks#success-criteria>); after a deploy, traffic is routed only
when all new instances pass, and the deploy is cancelled if that does not happen within 15 minutes.
These checks govern deploys, not idle wake-ups, and the docs do not state that a platform health
probe counts as inbound traffic that would keep a Free service awake.

### Measurement (2026-11-21)

One probe, no retries, from the research host at 20:46 MSK:

```text
curl -sS -D headers.txt -w 'code=%{http_code} connect=%{time_connect} total=%{time_total}' \
  --max-time 120 https://ai-for-developers-project-387-uzc9.onrender.com/
→ curl: (28) Operation timed out after 120001 milliseconds with 0 bytes received
   code=000 connect=0.036 total=120.002
```

TCP connected in 36 ms and stayed established, but **not a single byte of HTTP response** arrived in
120 s. That is stronger than the repository's earlier observation of no response within 90 s, and it
differs from the documented 503 + loading page: the edge accepted the connection and then sent
nothing.

Render's public status API shows no platform incident on 2026-11-21; the most recent entry is
2026-11-11 (<https://status.render.com>, `https://status.render.com/api/v2/incidents.json`). So the
silence is best explained by a slow cold start (or a suspended/over-quota Free service), not by an
outage. We cannot tell which without dashboard access — see open questions.

Consequence for CI: **the failure mode to design for is "connection accepted, no response"**, i.e. a
per-attempt timeout, in addition to the documented 503. Both must be retried.

## curl retry semantics that matter here

From the `curl` manual (<https://curl.se/docs/manpage.html>):

- `--retry N` retries only *transient* errors: a timeout, FTP 4xx, or HTTP `408`, `429`, `500`,
  `502`, `503`, `504`, `522`, `524`. Default backoff is 1 s doubling up to 10 minutes;
  `--retry-delay S` replaces it with a fixed delay. `Retry-After` is honoured and can override the
  delay, so the retry *window* — not the retry count — is the real budget.
- `--retry-all-errors` (added in 7.71.0) retries *any* error, including `curl: (52) Empty reply from
  server` and connection resets, which are not in the transient list. The manual warns not to
  combine it with redirected output.
- `--fail` is required for an HTTP error status to become a non-zero exit code. Without it a 503
  body is a successful transfer, and a retry loop that "passes" proves nothing.
- `--retry-max-time` caps the retry window but **does not cap an attempt already in flight**; use
  `--max-time` for the per-attempt cap. Total worst case ≈ retry window + one `--max-time`.
- `--connect-timeout` only bounds the TCP/TLS connect, which here is fast; the hang is after it, so
  `--max-time` is the flag that matters.

GitHub Actions specifics:

- GitHub-hosted runners ship a curl well above the 7.71.0 floor for `--retry-all-errors`: Ubuntu
  24.04 has **8.5.0**
  (<https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>) and
  Ubuntu 26.04, the `ubuntu-latest` target from November 2026, has **8.18.0**
  (<https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md>).
- A `run:` step that selects `bash` is executed as `bash --noprofile --norc -eo pipefail {0}`
  (<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>), which is
  why `set -euo pipefail` is safe and explicit below.
- Step and job `timeout-minutes` default to 360; a readiness step should set its own smaller value
  so a hung probe cannot eat the job (<https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>).

GitHub does not document curl's retry semantics; the curl manual is the owning source.

## Recommended readiness loop for GitHub Actions

Wait on `/healthz`, which this repo serves at the root and which always returns
`200 {"status":"ok"}` without touching the database (`docs/adr/0006`, `docs/adr/0007`,
`packages/server/src/http.ts`).

Budget: **300 s total**. Rationale: the documented wake is ~60 s, this repo has observed >90 s, and
the measurement above saw >120 s of silence. 300 s is ~2.5× the documented figure, absorbs one slow
image start, and still fails fast enough for CI.

```yaml
- name: Wait for the Render service to wake
  timeout-minutes: 6
  env:
    BASE_URL: https://ai-for-developers-project-387-uzc9.onrender.com
  run: |
    set -euo pipefail
    start=$SECONDS
    deadline=$((start + 300))
    last="no response"

    while (( SECONDS < deadline )); do
      status=$(curl --silent --show-error \
        --connect-timeout 5 --max-time 25 \
        --output /tmp/healthz.body \
        --write-out '%{http_code}' \
        "$BASE_URL/healthz" 2>/tmp/healthz.err) || status=000

      if [ "$status" = "200" ] && grep -q '"status":"ok"' /tmp/healthz.body; then
        echo "Render service ready after $((SECONDS - start))s"
        exit 0
      fi

      if [ "$status" = "000" ]; then
        last="no response ($(tr -d '\n' < /tmp/healthz.err))"
      else
        last="HTTP $status"
      fi
      sleep 5
    done

    echo "::error::Render service did not become ready within 300s; last attempt: $last"
    exit 1
```

Why a loop instead of only `--retry`:

- It treats `000` (timeout/empty reply) and `503` (documented wake) as "still waking", and any other
  status as a real problem, so the failure message names the cause.
- It verifies the body, so a 200 loading page or an HTML error page is not accepted as ready.
- It reports elapsed time and the last status, which is what a human needs at 3 a.m.

If you prefer the single-command form, this is the equivalent and is what
`--retry-all-errors` is for:

```bash
curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 25 \
  --retry 12 --retry-delay 5 --retry-all-errors --retry-max-time 275 \
  "$BASE_URL/healthz"
```

Budget: 275 s retry window + at most one in-flight 25 s attempt ≈ 300 s. `--fail` is mandatory here:
without it, a 503 exits 0. Caveat: combined with `--retry-all-errors` and `--fail`, a 404 is also
retried until the window expires, so a misconfigured path looks like a slow wake for five minutes.
That is why the loop is the recommendation and this one-liner is the fallback.

## Failing clearly

- Use a step-local `timeout-minutes` (6 min) so the step cannot outlive the budget; failing inside
  the loop produces a clearer message than a job-level cancellation.
- Emit `::error::` with the last observed status and elapsed seconds, and say which outcome it was:
  "no response" (connection accepted, no bytes — the case measured here), "503 while spinning up",
  or "unexpected HTTP status". The three need different reactions.
- Include a hint in the message: a Free service that stays down past ~5 minutes is more likely
  suspended (750-hour quota, spending limit, manual suspension) than slow
  (<https://render.com/docs/free#free-instance-hours>,
  <https://render.com/docs/troubleshooting-deploys#503-service-unavailable>). The fix is in the
  Render dashboard, not in a longer wait.
- Do not raise the budget past 5 minutes to "make it green": the failure then costs more CI minutes
  and still hides a suspended service.

## Confidence / open questions

High confidence (documented, multiple corroborating pages): 15-minute idle spin-down, ~1 minute
documented wake, 503 + loading page, 0.1 CPU / 512 MB, single instance, 5 s health-check timeout,
curl retry semantics, runner curl versions (8.5.0 / 8.18.0).

Medium confidence: that the wake reliably completes inside 300 s. The documented ~60 s plus this
repository's 90 s and 120 s observations are the only data points; a large image or slow start-up
work (migrations, seed) can exceed all of them. The recommendation is a budget, not a guarantee.

Open questions:

1. **Why did the probe receive zero bytes for 120 s when the docs promise a 503 loading page?** The
   docs describe browsers; there is no documented statement about a non-browser client during the
   first seconds of a wake. Possibilities: the loading page is served only after the edge decides
   the service is unreachable, or the service was suspended/over quota rather than merely asleep.
   Cannot be resolved without Render dashboard access (event log, instance hours).
2. **Do Render's own health checks count as inbound traffic for spin-down?** The Free page defines
   idle as "no inbound traffic … HTTP requests and WebSocket messages"
   (<https://render.com/docs/free#spinning-down-on-idle>) and does not mention platform probes.
   Assume they do not keep a service awake.
3. **Does a cold start run the same health-check gate as a deploy?** The 15-minute deploy grace and
   the 5 s probe are documented for deploys; wake-from-idle behaviour is not spelled out.
4. **Is the 90 s / 120 s silence region- or plan-specific?** One service, one region, two
   observations, no control sample.
5. **Source access caveat:** `render.com` (including `docs.render.com`) was unreachable from the
   research host on 2026-11-21 (TCP timeouts), so Render pages were read through Wayback Machine
   snapshots dated 2026-10-23 to 2026-11-18 and the 2024 snapshot cited above. Content matches the
   live page structure but the live pages were not fetched directly; re-check the numbers if the
   docs change.

## Sources

- Render, *Deploy for Free* — <https://render.com/docs/free> (snapshot 2026-11-18:
  <https://web.archive.org/web/20261118084145/https://render.com/docs/free>).
- Render, *Deploy for Free* (2024 wording) —
  <https://web.archive.org/web/2024/https://render.com/docs/free.md>.
- Render, *Compute Plans* — <https://render.com/docs/compute-plans> (snapshot 2026-10-23:
  <https://web.archive.org/web/20261023074123/https://render.com/docs/compute-plans.md>).
- Render, *Scaling Render Services* — <https://render.com/docs/scaling> (snapshot 2026-11-07:
  <https://web.archive.org/web/20261107190013/https://render.com/docs/scaling.md>).
- Render, *Troubleshooting Your Deploy* — <https://render.com/docs/troubleshooting-deploys>
  (snapshot 2026-11-02:
  <https://web.archive.org/web/20261102123053/https://render.com/docs/troubleshooting-deploys>).
- Render, *Health Checks* — <https://render.com/docs/health-checks> (snapshot 2026-11-12:
  <https://web.archive.org/web/20261112062056/https://render.com/docs/health-checks>).
- Render status — <https://status.render.com>, <https://status.render.com/api/v2/incidents.json>
  (read 2026-11-21).
- curl, *manpage* — <https://curl.se/docs/manpage.html> (`--retry`, `--retry-delay`,
  `--retry-all-errors`, `--retry-max-time`, `--fail`).
- GitHub, *Workflow syntax* —
  <https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax>.
- actions/runner-images, *Ubuntu 24.04 readme* —
  <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md>;
  *Ubuntu 26.04 readme* —
  <https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md>.
