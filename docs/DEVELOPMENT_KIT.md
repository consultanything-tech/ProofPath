# ProofPath Development Kit

**Companion to:** [PRD](PRD.md)  
**Status:** updated 28 October 2026 (Asia/Singapore); all fixture journeys, core browser safety checks and the Meta adapter are implemented. One live add-to-cart run, eight fixed live planning cases and a saved Meta quantity plan's seeded FAIL/fixed PASS are verified; broader live reliability remains unverified.

## First deliverable

Build one working vertical slice before adding scope: a written add-to-cart
requirement becomes a validated plan, a human-approved run, quantity and total
assertions, screenshots, and one report. It must include validation, approval,
and origin controls before quantity or validation journeys are added.

The candidate is one Node.js/TypeScript process serving static HTML/JavaScript
and API routes. Use platform `fetch` for Meta and Playwright at runtime for
bounded browser execution. On October 26 the user approved Playwright at runtime, TypeScript and Node
typings for development. Kickoff notes confirm functional work starts after the
kickoff ends at approximately 00:23 SGT on October 27. See `BUILD_LOG.md` for
the exact recorded boundary and pre-event planning disclosure.

```text
Browser UI -- POST /plans --> Meta planner -- validate --> in-memory plan
     |                                                     |
     +-- POST /plans/:id/approve --> immutable fingerprint |
     +-- POST /plans/:id/run -----> controlled runner -----> evidence manifest
                                                   |
                                            synthetic shop only
```

Skip a framework, database, UI kit, provider abstraction, and persistent suite
storage for this MVP.

## Candidate map

The implementation follows this layout. Model fixtures live inline in focused tests.

```text
src/
  server.ts          routes, static files, host limits
  planner.ts         explicit fixture or Meta planner; no fallback
  meta-planner.ts    native fetch, strict schema, bounded response/retry/timeout
  contracts.ts       runtime validation and domain types
  plan-store.ts      in-memory candidate and approval state
  scenarios.ts       server-owned criteria, revisions and semantic targets
  runner.ts          allowlisted Playwright dispatcher
  verdict.ts         deterministic aggregation
  evidence.ts        manifest and screenshot writing
public/
  index.html         requirement, plan, approval, report UI
  app.js
  styles.css
  shop.html          synthetic checkout only
  shop.js            deterministic seeded/fixed shop behavior
tests/               contract, approval, verdict, safety, and journey tests
runs/                ignored generated artefacts
.env.example         PLANNER_MODE and MODEL_API_KEY names; no secrets
```

Use `pnpm` for the approved dependencies. Keep secrets server-side in an
ignored local environment file. They must never enter browser code, artefacts,
logs, repository, or video. The submission requires a public GitHub repository,
prior-work disclosure, and a three-minute narrated demo. Keep optional bonus
prize promotion separate from the MVP.

## Single planner contract

The adapter uses `POST https://api.meta.ai/v1/chat/completions`, `muse-spark-1.3`
and strict `response_format` JSON Schema via native server-side `fetch`. The
official Chat Completions guide was refreshed on October 27 and documents
`max_completion_tokens`; the adapter caps it at 4096 with low reasoning, a
30-second total deadline, a 64 KiB response cap and at most one transient retry.
Response model must match the requested model. Mock tests validate request shape
and failure handling. A real authorized add-to-cart smoke request and its
chat-authorized local browser run passed on October 27; broader language
behavior still requires evaluation.

Use `response_format.json_schema.strict: true`. Meta's documentation requires a
plain-object root, `additionalProperties: false` on every object, and every
property listed in `required`. Keep it flat: `kind` identifies the result and
both `question` and `plan` are required nullable fields. Do not use `oneOf` or
`allOf`; `anyOf` is permitted below the root but is unnecessary here.

```ts
type PlannerResponse = {
  kind: "clarification" | "plan";
  question: string | null;
  plan: PlanCandidate | null;
};

type PlanCandidate = {
  contractVersion: "1";
  scenarioId: "add-to-cart" | "quantity-update" | "required-fields";
  actions: Array<{
    id: string;
    kind: "navigate" | "click" | "fill";
    target: "shop" | "add-desk-lamp" | "quantity" | "checkout" | "continue-checkout";
    value: string | null;
  }>;
  assertions: Array<{
    id: string;
    predicate: "cart-quantity-equals" | "cart-total-minor-equals" |
      "required-errors-visible" | "checkout-stayed";
    expected: string;
  }>;
};
```

The server owns the exact target registry below. Reject other kind/target/value
combinations, unknown keys, duplicate IDs, or model-supplied selectors, URLs,
JavaScript, shell, headers or credentials. `value` is null unless filling quantity.

| Action kind | Target | Implementation mapping | Value |
| --- | --- | --- | --- |
| navigate | shop | Fixed `/shop` route | null |
| click | add-desk-lamp | Exact Add Desk Lamp button | null |
| fill | quantity | Exact Quantity input | `"1"` or `"2"` |
| click | checkout | Exact Checkout button | null |
| click | continue-checkout | Exact Continue button | null |

The executor reads quantities as integers and totals as integer SGD cents from
visible rendered values; malformed or conflicting values are inconclusive.
Canonical `expected` strings are decoded by predicate, never evaluated as code:
`"1"`/`"2"` for quantity, `"3900"`/`"7800"` for total, `"true"` for the two
boolean predicates. Scenario coverage requires quantity + total for cart and
quantity journeys, and both boolean predicates for required-fields. All
assertions run after actions, in declared order. For required-fields, the shop
exposes two visible required-error markers, an active checkout-state marker and
a confirmation marker only on advancement. `required-errors-visible` requires
both errors; `checkout-stayed` requires active checkout and absent confirmation.

The server owns the original requirement, selected scenario ID, revision and
expected criteria. The model returns the contract version, matching scenario ID,
actions and assertions only. It receives the requirement, fixed scenario facts
and valid target names, but never the revision, seeded defect or expected verdict.
The validator checks the returned scenario ID against the stored request. Review displays the original prose beside
normalized criteria; the user must resolve contradictory or ambiguous prose.
For the quantity journey, required expected total is `7800` in both revisions;
a plan that asserts `3900` to match the defect is rejected. Add-to-cart requires
quantity `1` and total `3900`; quantity-update requires `2` and `7800`.

For `kind=plan`, plan is non-null and question is null. For clarification, plan
is null and question is a nonempty string. Enforce those cross-field rules
locally even when the provider accepts the JSON schema. Reject zero assertions
and incomplete coverage before offering approval.

Initial implementation limits: 2,000 requirement characters, 20 actions,
10 assertions, 30-second model timeout, 10-second action timeout, 90-second run
limit, one concurrent run. These are engineering defaults, not spending consent.
A network/429/5xx planner error may be retried once with bounded backoff;
401/402, refusal, truncation, schema failure and unsupported requests surface
without automatic retry. Never retry a whole browser run or a mutating click.
Missing response content is an error, never an empty successful plan.

## Explicit planner provenance

Require `PLANNER_MODE=fixture|meta` at startup; there is no default. Fixture mode
uses canned plans to exercise the validator, approval, runner and evidence, and
every UI/report says **Fixture planner — Meta not used**. It does not establish
natural-language understanding or eligible Meta use. Meta mode without a local
key fails startup; errors never fall back to fixtures. Preserve planner mode,
provider and model in every approved envelope and report (model is null for
fixtures). The adapter has offline tests and one validated real add-to-cart
response; the initial eight-case selected-scenario evaluation passed; broader language coverage remains open.

## Approval integrity

Canonicalize the validated plan with stable key order. Hash this exact envelope
and display it before approval:

```json
{
  "originalRequirement": "Change lamp quantity from 1 to 2; total is S$78.",
  "scenario": {"id": "quantity-update", "revision": "seeded-bug"},
  "contractVersion": "1",
  "targetRegistryVersion": "2",
  "planner": {"mode": "fixture", "provider": null, "model": null},
  "plan": {"...": "validated candidate"}
}
```

Store an immutable canonical envelope, its plan ID and digest, approval timestamp,
and a 10-minute expiry. Approve/run endpoints accept only the plan ID, never a
client-supplied plan. They load and validate the server-stored snapshot. Consume approval when a run starts; a rerun needs a new approval.
Before launch, revalidate and recompute. A developer fix changes scenario
revision to `fixed`, so it needs fresh approval even where actions remain the
same. Rejection creates no `runs/` directory.

## Runner and host boundary

Bind the server to `127.0.0.1` and require an exact Host header. Mutation routes
require same-origin Origin, JSON content type and a bounded body; do not enable
CORS. Apply CSP and security headers. Serve evidence only by validated run ID
and a filename listed in its manifest, never a client-supplied filesystem path.

Only the action dispatcher calls Playwright. It resolves a semantic target to
one known locator and refuses zero or multiple matches. It accepts fixed
same-origin paths only. Each fresh browser context must:

- intercept requests and redirects before egress;
- abort external subresources, popups, downloads, permissions, WebSockets, and
  service-worker egress;
- cap steps, action timeout, and total run time; permit at most one bounded
  retry for a transient locator wait;
- reject model-produced code, scripts, raw-URL navigation, and automatic product fixes.

The local owner grants each run through approval. On a hosted build, anonymous
live runs remain disabled until the owner selects deployment, per-run and total
spend budgets, request-size and ingress rate limits, and concurrency. Do not
invent those values. A public site may show labelled pre-recorded synthetic
reports, while an owner-performed live run can supply the video. A report gallery alone
is not proof of the required live product: before submission enable a bounded
interactive demo under the chosen budget, then verify it as a fresh reviewer.

## Verdict and manifest

No model determines factual verdicts:

```text
if any deterministic assertion is known false: FAIL
else if execution is incomplete or an assertion is missing, timed out, ambiguous, or conflicting: INCONCLUSIVE
else if at least one assertion exists and all are true: PASS
else: reject the plan (no verdict)
```

A planning/approval rejection has no run verdict. A safety block after launch
stops the run, records a separate `blocked` execution status, and aggregates
known failures before marking remaining observations inconclusive. A timeout or
runner crash cannot turn already-passing partial results into an overall PASS.

Write a synthetic manifest after the approved run starts. This is illustrative,
not a completed run:

```json
{
  "runId": "run-example",
  "planId": "plan-example",
  "approvalDigest": "sha256:example",
  "scenario": {"id": "quantity-update", "revision": "seeded-bug"},
  "planner": {"mode": "fixture", "provider": null, "model": null},
  "origin": "http://127.0.0.1:3000",
  "verdict": "FAIL",
  "assertions": [{
    "id": "total-is-78", "predicate": "cart-total-minor-equals",
    "expected": "7800", "observed": "3900", "currency": "SGD",
    "verdict": "FAIL", "url": "/shop",
    "timestamp": "2026-10-26T00:00:00.000Z", "screenshot": "total-is-78.png"
  }],
  "replay": ["Open synthetic shop", "Add Desk Lamp", "Set quantity to 2"]
}
```

The complete manifest must include start/end times, requirement, approved
envelope, target-registry version, action results and errors, and a record for
every planned assertion. The example abbreviates these fields. Hash each
screenshot and write the manifest digest in a separate sidecar file; do not
place a self-referential hash inside the manifest. Reports render cents as S$39
and S$78 and escape all requirement/model text as text, never HTML. It must never
record keys, authorization headers, card details, cookies, browser storage, or
unrelated content.

New manifests include `actionResults` in approved plan order. Each record has
the action ID, `completed`/`blocked`/`timed-out`/`failed`/`not-run` status,
nullable start/end timestamps, nullable observed URL and an optional sanitized
local error. The approved envelope supplies the action kind, target and value.
Completed steps remain completed if later evidence capture or cleanup fails;
unreached steps have null timestamps/URL. Historical manifests are unchanged
and may lack action history; readers must label that absence explicitly.

## Evaluation plan

| Layer | Minimum proof | Status |
| --- | --- | --- |
| Contract | Valid plan, clarification, unknown key/action/target, zero assertions, missing coverage | Partial: valid fixture and external action/missing action coverage checks |
| Approval | Missing approval, changed plan, changed scenario revision, valid envelope | Local checks cover one-use, exact ten-minute expiry, stored-envelope tampering, and busy-run rejection without consumption |
| Safety | External route/redirect/subresource, popup, download, WebSocket, service worker | Core loopback Chromium matrix passed: redirect/escape zero egress, popup/download/WS blocking, worker registration suppression, post-click URL check and in-flight timeout; not an exhaustive security audit |
| Verdict | All true; known false plus missing observation; only missing observation | Local fixture PASS/FAIL verified; unit checks distinguish missing/false markers, preserve known failure and prevent incomplete execution from passing |
| Journey | Add to cart, seeded quantity, fixed quantity, blank required fields | All three fixture journeys have local browser evidence; blank checkout shows both errors and stays active; run IDs and hash checks are in BUILD_LOG.md |
| Reliability | Three seeded `FAIL`s at `S$39`; three fixed `PASS`es at `S$78` | Verified locally: three per revision, with screenshot and manifest hashes checked |
| Live language | Six supported paraphrases, one ambiguous, one unsupported | 8/8 fixed cases met expectations: six covered plans, two appropriate clarifications; no browser runs in this batch; see evaluations/live-results-v1.md |
| Action evidence / UI | Ordered action records; readable/raw agreement; saved/legacy reports; duplicate/stale UI behavior | Verified locally in fixture mode on October 28; no new Meta requests; see BUILD_LOG.md |
| Human review | Fresh logged-out review of public source, deployment, and video | Not run |

Use eight evaluation inputs: six unseen requirements (two paraphrases for each
supported journey), plus
one ambiguous and one unsupported request. Record valid covered plan,
clarification, or rejection. This is narrow demo evaluation, not broad
natural-language coverage.

## 27-hour schedule

| SGT date | Three-hour outcome |
| --- | --- |
| Oct 27 | Confirm current rules/build start; redacted live smoke call; public repository and deployment choice; freeze contracts. |
| Oct 28 | Build synthetic shop with seeded/fixed modes; test total and blank-field validation. |
| Oct 29 | Usable add-to-cart vertical slice: plan, strict validation, approval digest, runner, assertion, screenshot, report. |
| Oct 30 | Harden origin controls, retry/timeouts, manifest, safety and approval tests. |
| Oct 31 | Add quantity and blank-required-fields journeys and replayable report UI. |
| Nov 1 | Execute matrix plus three seeded and three fixed reliability runs; fix demonstrated failures only. |
| Nov 2 | Deploy, verify logged out, and obtain one independent attempt. |
| Nov 3 | Audit public repo/evidence; record three-minute video; prepare submission. |
| Nov 4, 14:00–17:00 | Logged-out final check, links/video audit, and submit by 17:00 SGT. |

October 27–November 3 blocks are 19:00–22:00 SGT. The hard deadline is
November 5 at 10:00 SGT, leaving a 17-hour buffer after the internal target.
If the first complete journey is not working by October 29, freeze scope and
finish it before adding the other journeys. Do not describe a partial MVP as complete.

Cut model narrative, screenshot interpretation, visual polish, then extra
paraphrases if behind. Never cut schema validation, approval integrity, origin
blocking, deterministic verdicts, evidence provenance, or logged-out review.

## Readiness ledger

| Item | Evidence updated 27 October | Status |
| --- | --- | --- |
| Credits | Billing showed `Free credits in use $150.00`; balance `$0.00`. | Verified visually |
| Payment readiness | October 26 showed no method; October 27 authenticated request returned HTTP 200. | API access works for the smoke test; card/current balance not reinspected |
| Model integration | Native-fetch adapter, offline tests, one smoke and eight live evaluation responses. | Initial fixed evaluation passed; broader reliability unproven |
| Structured response | Strict schema/local checks accepted six evaluation plans and two clarifications. | All eight fixed planning cases met declared expectations |
| Public repository/deployment | Private GitHub repository is configured; no deployment exists. | Publication/deployment not started |
| Functional ProofPath | Three fixture journeys, local safety matrix, fixed planning evaluation and local browser evidence for live-generated plans across all three journeys. | Saved quantity plan gave seeded FAIL/fixed PASS; saved required-fields plan passed both checks; fresh live-proposal UI approval and deployment remain open; see BUILD_LOG.md |

## Build handoff

See [BUILD_HANDOFF](BUILD_HANDOFF.md) for the approved dependency scope,
confirmed start boundary, first implementation sequence and verification
requirements.

## References

- [Participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
- [Meta Model API quickstart](https://dev.meta.ai/docs/quickstart)
- [Structured output guide](https://dev.meta.ai/docs/structured-output)
- [Chat Completions parameters](https://dev.meta.ai/docs/protocols/chat-completions)
- [Official kickoff](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557)
- [Official temporary-hold note](https://discord.com/channels/1557169028080869426/1557169028626251801/1564266493875585025)
- Local scope: `/opt/homebrew/var/www/ProofPath/README.md` and `docs/PLAN.md`

