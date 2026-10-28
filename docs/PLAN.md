# ProofPath MVP plan

**Scope transition, October 28:** the user selected the expanded checkout/order
QA workbench. Review the [v2 design](superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md)
before creating its implementation plan. The v1 sequence below, including host
resource assumptions, is retained as reference and must not be treated as a v2
implementation plan. Verified fallback checkpoint: `4ace907`.

## Outcome

Prove that a small team can turn a written checkout expectation into a reproducible browser finding with evidence. The demo must show a seeded defect, its evidence-backed failure, a developer fix, and a successful rerun.

Budget: one developer, 3–4 focused hours daily, approximately 27–36 hours across the nine build days. If one complete journey is not working by October 29, cut optional visual interpretation and interface polish before expanding scope.

## Demo journeys

The controlled demo shop has one product: Desk Lamp at S$39. There is no tax, shipping, coupon, or real payment flow.

| Journey | Request and expected result |
| --- | --- |
| Add to cart | Add one Desk Lamp; the cart shows quantity 1 and total S$39. |
| Quantity update | Change the Desk Lamp quantity from 1 to 2; the expected total is S$78. The seeded state keeps the total at S$39, producing a cited `FAIL`; the fixed state shows S$78 and produces `PASS`. |
| Required checkout fields | Try to continue with required checkout fields blank; visible validation prevents submission and no payment is attempted. |

## Remaining execution plan — October 28, 2026

This is a planning checkpoint, not authorization for new API spending, paid
hosting, public access or final submission. The development branch is
`codex/proofpath-development`; the repository stays private until publication.

Verified baseline: all three fixture journeys; core local approval, HTTP and
Chromium safety tests; eight fixed live planning cases; one live-generated
add-to-cart browser run; and the same saved Meta quantity plan producing seeded
FAIL and fixed PASS with separate chat-authorized programmatic approvals.
These do not prove a real UI approval of a fresh live proposal or deployment.
See [build log](BUILD_LOG.md) and [saved quantity evidence](evaluations/saved-quantity-runs-v1.md).

### 1. Readable review and complete reports — October 28–29

Completed locally on October 28: action outcomes, readable review/report,
reopenable report links, legacy handling and targeted UI race protection are
implemented and verified. See `BUILD_LOG.md` for evidence and limits. Stage 2
is next; fresh live-proposal UI approval remains a separate hosted smoke gate.

Scope: `public/index.html`, `public/app.js`, `public/styles.css`; the action
evidence gap also reaches `src/runner.ts`, `src/evidence.ts`, `src/server.ts`
and their callers/tests. Reuse native HTML and installed packages; no new
production dependency or plan-contract expansion is intended.

- Show the original requirement, scenario/revision, planner provenance, ordered
  actions, expected checks and full approval digest before approval. Keep the
  exact snapshot in an expandable raw view; derive the summary from the returned
  envelope rather than mutable form inputs.
- Show textual verdict, execution status, expected/observed values, readable SGD
  totals, screenshots, replay steps and manifest link. Preserve raw values and
  hashes; model text uses `textContent`, never HTML.
- Complete the existing manifest requirement for action outcomes and sanitized
  errors. Distinguish completed, failed, blocked, timed-out and not-run actions;
  never mark unexecuted work successful. Preserve existing verdict semantics.
  Older manifests must still open with action history labelled unavailable;
  do not rewrite or fabricate historical evidence.
- Let a run URL reopen the readable saved report without proposing a plan or
  executing again. This is one report view, not a gallery or stored-suite feature.
- Disable duplicate approval/run submissions while pending, preserve stale
  response rejection, and keep keyboard focus/loading/error states clear.

Done when a keyboard user can understand, approve and run the exact snapshot,
then reopen matching readable/raw evidence. Rapid clicks produce one request;
input changes during a delayed proposal never expose stale approval/report UI.
Unknown or malformed report IDs fail clearly without a model call.

Validation: add one focused Playwright UI integration using controlled responses
and update affected runner/evidence/server/safety tests. Check old-manifest
compatibility, action failure/interruption records, amount formatting and raw
snapshot agreement. Run unit/server and Chromium checks for the changed shared
code; do not repeat passing checks without a new reason.

#### Next implementation handoff: two sequential slices

**Slice 1 — Action evidence.** The current runner returns only assertions.
Introduce a result containing `assertions` and `actionResults`, and carry both
through `RunnerExecutionError` and the server into the manifest. Each action
record contains its approved action ID, execution status, nullable start/end
timestamps, nullable observed URL and optional fixed sanitized error. Resolve
action kind/target/value from the approved envelope instead of duplicating them.

Record every action once, in plan order. Completed actions retain their result
even if evidence capture or browser cleanup later fails. An interrupted active
action records blocked/timed-out/failed status; unreached actions are `not-run`
with null timestamps/URL. Setup failure before any action records all as
`not-run`. Preserve the existing execution-status precedence and verdict rules;
action success never overrides a failed or inconclusive assertion.

Reach: `src/runner.ts`, `src/evidence.ts`, `src/server.ts`,
`tests/evidence.test.ts`, `tests/safety.integration.ts`. These are the maintained
runner/manifest callers identified in this planning pass; search again before
editing. New manifest writers supply action results; legacy JSON remains
unchanged. Do not introduce a general event logger or export internals solely
to test them.

Slice 1 acceptance: normal execution has all completed action records; blocked
and timed-out execution identifies the active action and leaves later work
not-run; sanitized failures expose no raw browser/provider error. Manifest
writing preserves action records under its sidecar hash. All previous verdict,
approval and egress tests still pass. Validate with `pnpm test` and
`pnpm test:safety` after updating affected callers and fixtures.

**Slice 2 — Readable UI.** Own `public/index.html`, `public/app.js`,
`public/styles.css`, a focused `tests/ui.integration.ts`, and a `test:ui` package
script using the existing build/Node test pattern. No new backend route,
framework or dependency is required.

Plan review order: requirement and journey/revision; planner provenance;
numbered semantic actions; expected checks; full digest; expandable exact JSON;
approve control. Report order: textual verdict/execution status; provenance and
times; action outcomes; expected/observed assertion cards and screenshots;
replay steps; readable report link and raw manifest link. Display integer cents
as SGD currency without changing stored values; render boolean checks as plain
sentences. Keep all source content as text, with keyboard focus and narrow-screen
layouts checked.

Reuse one report renderer for the run response and `/?run=<uuid>`. Validate the
run ID before fetching the existing manifest endpoint; reopening a report makes
no plan/run request. Legacy reports show an explicit action-history-unavailable
note while retaining their actual assertions/verdict. Missing/invalid reports
show a clear error and never fabricate a result.

Capture the proposal's input version and ignore stale results after input
changes. Disable approval/run buttons synchronously before awaiting requests;
lock inputs while approval/execution is pending, then restore the appropriate
controls. While an approved plan is idle, input edits may still discard the
visible approval through existing invalidation; do not require execution to
unlock editing. The server remains authoritative for one-use approval and
concurrency. Do not add automatic request retries or claim an ambiguous network
failure means execution never started.

Slice 2 acceptance: a fixture-mode keyboard flow produces a readable report
matching its exact snapshot and raw manifest; copied report links reopen the
same evidence; duplicate clicks make one request; delayed stale proposals never
reveal approval controls; legacy reports remain readable. UI tests use local
fixtures/controlled responses, not Meta calls. Add assertions for currency
formatting, sanitized text rendering, invalid IDs and visible focus. Run
`pnpm test:ui`, affected existing checks and `git diff --check`. Update the build
log/readiness notes with actual results after validation, not planned successes.

Keep unchanged: plan schema, model prompt, digest inputs, approval lifetime,
server-owned scenarios, deterministic verdicts and exact local fixture allowlist.
The runner return shape is the main integration risk; complete and validate
slice 1 before implementing slice 2. Neither slice authorizes live spending,
hosting changes or repository publication.

### 2. Close local verification gaps — October 29–30

Completed locally on October 28: saved `required-a` Meta plan execution passed
with a fresh chat-authorized approval, four completed actions, two PASS
assertions and verified evidence hashes. Targeted UI race/legacy checks passed
in stage 1. Reopening this new report in the in-app browser was unavailable;
its manifest and screenshot HTTP endpoints were verified directly. No new
model request was made. Stage 3 hosting/access-limit decisions are next.

Execute the saved Meta required-fields plan with a fresh chat-authorized
approval, preserving source hash/model provenance and recording the actual
approval source. It must show both visible errors and an active checkout, with
matching screenshot/manifest hashes. This needs no new Meta request and does
not establish a fresh live-proposal UI approval.

Verify UI behavior with the controlled test transport and existing supported
journeys, including duplicate clicks, stale responses and interrupted evidence.
Do not re-run the completed eight-case planning batch or three-run fixture
reliability batch merely for completeness. Fix failures within this scope.
Record exact results/limitations in `BUILD_LOG.md` and the readiness documents.

Done when all changed-code checks pass, the missing saved-plan execution has
evidence, and no local blocker prevents the hosted walkthrough. Combine the
fresh live-proposal UI check with stage 3 to avoid duplicate paid smoke tests.

### 3. Bounded interactive deployment — October 30–November 1

Access decision confirmed by the user on October 28: reviewers with an access
code and limited attempts may run live Meta requests. Anonymous live requests
remain disabled; no team-account system is needed.

Owner selections confirmed on October 28:

| Setting | Selected planning target |
| --- | --- |
| Hosting | Managed container service with persistent storage |
| Access | Unique reviewer codes; no anonymous live requests |
| Proposal allowance | 3 per issued code; 50 across the hosted demo |
| Reservation per proposal | US$0.05, including the possible transient retry |
| Total reservation budget | US$2.50 for the hosted demo |

An attempt allowance belongs to a code, not a verified person. Sharing a code
shares its three-proposal allowance; a new browser/session must not reset it.
These are selected planning targets, not creation of a paid service or proof of
an account-wide billing cap. The actual provider/tier/hosting quote still needs
owner approval before paid provisioning.

The current server hardcodes exact localhost Host/Origin checks. Deployment
therefore reaches `src/server.ts`, relevant HTTP-policy tests, minimal hosting
configuration, `.env.example` and README instructions; budget enforcement also
reaches the planning boundary and its tests.

- Select a host supporting Node, Chromium, server-side secrets and persistent
  evidence. Keep browser fixture execution on a separate controlled loopback
  origin while validating the configured public HTTPS Host/Origin at ingress.
  Do not trust arbitrary forwarded headers or broaden fixture egress.
- Enforce chosen access, planning concurrency, ingress limits and request/spend
  quotas before provider calls. Account for transient retries and reserve a
  conservative request allowance before sending; exhaustion/uncertain state
  must fail closed. Restart must not silently reset an exhausted allowance.
  Billing email alerts are not a hard cap.
- Bound stored proposals and evidence retention for this event; preserve issued
  demo-report links through restart. Document that in-memory pending approvals
  expire on restart and need a new proposal/approval.
- Under a newly authorized smoke budget, generate a fresh required-fields Meta
  proposal remotely and verify the actual UI approval/run path. Record who or
  what clicked approval accurately; do not describe an automated click as a
  human click. Verify both assertions, readable/raw agreement and hashes.

Done when the interactive demo works remotely over HTTPS, wrong-origin and
unauthorized/exhausted requests are rejected before provider/browser work,
reports survive restart, and a fresh reviewer can use the intended access path.
Check keys never reach responses, client files, logs, evidence or Git. A static
gallery alone does not close the working-product gate.

#### Deployment handoff: three small implementation slices

**A. Package and separate public ingress from fixture execution.** Use one
portable Docker service/process with the existing pnpm lock and Node 26. Install
the Chromium build matching the locked Playwright version; do not copy the Mac's
dependencies/browser cache into the image. No additional npm dependency,
database, queue or autoscaling is planned.

The public listener binds the host's port and checks one configured HTTPS
`PUBLIC_ORIGIN` exactly. A separate loopback listener serves only the owned
shop document and assets; it has no planning, approval, run or evidence API.
The runner uses that internal origin and its existing exact allowlist. Never
trust arbitrary forwarded headers, replace actual evidence URLs with the public
URL, or relax local fixture egress. Keep existing local-mode defaults working.

Persist under a configured `DATA_DIR`: quota state and `runs/`. Runtime must
verify the volume/state is usable before enabling Meta; image build must not
depend on the runtime volume. Keep one service instance so filesystem state and
in-memory concurrency gates remain authoritative. Restarts discard pending
plans/approvals/sessions, but preserve quota and completed reports.

Render is the reference candidate, not a purchased/selected tier. Its official
docs support [Docker web services](https://render.com/docs/web-services) and
[persistent disks](https://render.com/docs/disks) on paid services. A disk is
runtime-only and attached to one instance; redeploys cause a short interruption.
Use `/var/data/proofpath` as the proposed data path. Verify the current account,
tier, memory requirement and full quote before provisioning; no current price
or account access is asserted here. Keep the Docker image portable.

Reach: `src/server.ts`, `src/evidence.ts`, `.env.example`, `.gitignore`,
`Dockerfile`, `.dockerignore`, README, and HTTP-policy/safety tests. Add a host
manifest only after selecting the actual provider. Done when the container
builds, starts in fixture mode, rejects wrong public Host/Origin, and runs only
the internal fixture; existing local journeys and safety checks still pass.

**B. Add reviewer access and durable limits.** Add one focused policy module
(`src/demo-policy.ts`) and tests, used by the server/planning boundary. Generate
unique high-entropy codes locally; keep raw codes and signing/session secrets
out of chat, URLs, logs, evidence and Git. Store only code fingerprints in quota
state. Exchange a code for a short-lived Secure/HttpOnly/SameSite session cookie;
apply exact Origin checks to login and other mutations. Protect live APIs and
report/evidence reads; the public landing/config response may expose only safe
metadata and sign-in state. Code distribution remains an owner action.

Enforce three proposals per code and fifty globally. Each valid, admitted
logical proposal reserves the full 50,000 micro-US-dollars (US$0.05) for up to
two provider attempts; total reservations cannot exceed 2,500,000 micro-US-dollars.
Persist the reservation before any provider call. Count clarifications, failed
provider requests and abandoned responses once admitted; never refund/reset
allowances automatically. Retries stay inside that same reservation and code
allowance; approval/run clicks are not new Meta proposals. Reject malformed,
unauthorized, busy or exhausted requests before any chargeable dispatch.
The UI must show the remaining allowance and explain which outcomes consume a
proposal before submission.

Use one concurrent proposal and one concurrent browser run, with bounded login
and mutation-rate limits; use a simple busy response rather than a queue.
Preflight the exact provider request against refreshed rates and a verified
conservative input/schema/output-token accounting bound for both attempts. If
the maximum exceeds US$0.05, reject before Meta and ask for a shorter requirement;
do not lower the existing completion cap or silently change the prompt/model
to fit. If the accounting bound cannot be verified, hosted Meta stays disabled.
The reservation ledger limits this service; it is not an invoice reconciliation
or a cap on other uses of the same Meta account/key.

For this single-instance event demo, use a serialized durable filesystem ledger
with atomic writes/flushes, not an extra datastore. Initialize it once through
an explicit owner setup step. Missing, corrupt, unwritable or incompatible state
after setup must fail closed; a restart must never interpret missing state as a
fresh budget. Test concurrent admissions and crash/restart boundaries.
After a disk recovery/backup restore, keep Meta disabled until the owner checks
the reservation totals; restoring an older ledger is not a budget reset. Bound
proposal/session maps and reject new work when storage is insufficient. Preserve
issued report links through judging rather than automatically deleting evidence
to free space; the event already limits successful browser runs to at most fifty.

Reach also: `src/meta-planner.ts`, `src/plan-store.ts`, public code-entry/status UI,
`tests/demo-policy.test.ts`, server tests and focused UI tests. Keep approval
digests/lifetime, deterministic verdicts and browser restrictions unchanged.
Done when wrong-code, exhausted, concurrent and state-failure cases make zero
provider calls, sessions cannot renew a code's allowance, and quota/reports
survive restart. Use mocked provider responses for these tests.

**C. Review the quote, deploy, then perform one bounded smoke.** Present the
completed container/configuration and actual hosting quote before the owner's
paid-provisioning decision. Configure secrets through the host's secret store,
retain private GitHub visibility, and verify HTTPS, health, logs and persistent
storage. Do not create another API key or credit claim as part of deployment.

Use one fresh required-fields Meta proposal for the hosted smoke, counted inside
the selected limits. Verify exact plan review, actual UI approval, completed
actions, both boolean assertions, screenshot/manifest hashes and reopening after
a service restart. Record the real approval source; an automated click is not
a human approval. Recheck quota after restart and demonstrate denial without
extra provider requests. A browser/control failure is a smoke blocker to resolve,
not grounds to substitute a chat/programmatic approval and call the UI verified.

Finish with an independent reviewer using an issued code. Record URL, deployed
commit, measured resource use, verified gates and remaining limits in BUILD_LOG.
No broad benchmark repeat, account system, public report gallery, extra model
provider or new application feature is part of this stage.

### 4. Independent walkthrough and submission — November 2–4

- Record one fresh reviewer's attempted journey, outcomes and blockers; fix
  material demo failures without broadening feature scope.
- Prepare a three-minute narration/script and video showing the problem, actual
  Meta plan, approval, seeded FAIL, fixed PASS and evidence. Disclose that the
  checkout/defect are synthetic and the fixed revision already exists; do not
  imply an automatic repair or general website support.
- Draft final description, impact, Meta's material role, technical boundary,
  prior-work disclosure and source/live/video links. Keep the final checklist
  with the submission draft; update README/build log rather than creating
  duplicate readiness documents.
- Audit tracked content and reachable Git history for secrets/private data,
  integrate the verified development branch into `main`, make the repository
  public when ready, and check source/live/video links from logged-out sessions.
  Reviewer access may require the chosen code; distinguish that from a broken
  link. Recheck current official requirements and submission fields before filing.
- Present the completed submission and promotional-consent terms for the user's
  final authorization, then submit only when authorized and retain confirmation.

Done when all required links work for the intended reviewer, the video is
narrated and within the recorded three-minute requirement, and the platform
confirms submission. Internal finish: **November 4, 17:00 SGT**. Recorded hard
deadline: **November 5, 10:00 SGT**; refresh official rules before final submission.

For substantial implementation in each stage, use planner → implementer →
parent validation under the working agreement. This planning pass supplies the
sequence; inspect affected interfaces before each implementation handoff.

Deferred: broad language benchmarking, exhaustive cleanup-failure injection,
extra providers, arbitrary sites, team accounts, cross-browser support,
model vision, automatic fixes and report galleries. Targeted failure-path tests
needed for changed code remain required.

## Execution boundary

The Meta model proposes a list of semantic actions and assertions. Validate that output against a constrained schema; reject arbitrary JavaScript, shell commands, and unsupported actions. The runner permits only allowlisted actions and cannot start until a human approves the plan. Block browser requests outside the controlled origin before sending them, including redirect destinations. There are no browser side effects before approval and no autonomous fixes.

Playwright captures the URL, DOM values, timestamps, and screenshots for each assertion. Deterministic comparisons decide totals and other factual checks. The model may explain evidence linked to the assertion but cannot change its result. Missing, ambiguous, or conflicting evidence is `INCONCLUSIVE`.

## Build gates

The user chose to wait for the permitted coding start on October 26. The October 27 kickoff transcript confirmed that hacking starts after kickoff, which ends at about 00:23 SGT; the gate is now cleared. Record the first functional code boundary in `BUILD_LOG.md`. An explicitly labelled fixture slice can establish local mechanics while live setup is pending. Before claiming Meta integration, make one real call using the exact eligible Meta model/API. Record the model, request, validated response, and limitations. Confirm a public repository and one deployment path are feasible, keep credentials in ignored local files, and confirm credit/payment-card/spend-limit status. Screenshot interpretation is optional: if it is not proven by the first live call, use DOM and screenshot artifacts without model vision.

On 26 October 2026, the signed-in Meta Billing page showed $150 free credits in use and a $0 balance. It also showed no payment method on file. The participant already submitted the claim; no duplicate is needed. The guide requires a credit card to use the credits for API calls. A spending email alert is not a verified hard cap. Free-credit content may be used for product improvement: use synthetic test data only. No live model call had been made at that inspection. On October 27 an authorized real add-to-cart planning request and its chat-authorized local browser execution passed; see BUILD_LOG for the exact evidence and limitations.

The [PRD](PRD.md) and [development kit](DEVELOPMENT_KIT.md) refine this plan with contracts, evaluation gates, and the 27-hour schedule. Model `muse-spark-1.3` and the Chat Completions endpoint are documented candidates verified in official docs; basic account-level planning access and the initial eight-case selected-scenario evaluation are verified; broader language reliability remains open.

## Schedule

The guide lists the building period as 27 October–4 November ET. Planning documents predate the event; distinguish them from functional code and disclose any prior work used. The kickoff confirmed functional work starts after its close at about 00:23 SGT on October 27.

| Date (SGT) | Deliverable |
| --- | --- |
| Oct 26 | Documentation-only base. |
| Oct 27 | Completed: fixture journeys, core safety checks, live access and fixed planning evaluation. |
| Oct 28–29 | Saved Meta-plan seeded/fixed evidence; readable review, complete action evidence and report UI. |
| Oct 29–30 | Saved required-fields execution and targeted UI/failure-path verification. |
| Oct 30–Nov 1 | Owner-selected hosting/access/budgets; bounded deployment and fresh live UI smoke. |
| Nov 2 | Independent reviewer walkthrough and material fixes. |
| Nov 3 | Submission draft, public-link audit and three-minute video. |
| Nov 4 | Final checks and submission, 2:00–5:00 PM SGT; finish by 5:00 PM. |

The stated deadline, 4 November at 9:00 PM ET, is 5 November at 10:00 AM SGT. The 5:00 PM November 4 submission target leaves a 17-hour buffer.

Calendar blocks are confirmed for 7:00–10:00 PM SGT daily from October 27 through November 3, then 2:00–5:00 PM on November 4: 27 working hours in total. Each block includes a concrete deliverable and a 15-minute reminder. The earlier November 4 slot avoids an existing evening commitment.

Kickoff is confirmed for October 27 at 00:00 SGT by the [October 26 Discord announcement](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557). The kickoff transcript confirms functional work starts after the session closes at about 00:23 SGT on October 27.

## Acceptance checks

- Each of the three journeys runs from request through an approved plan and report.
- Invalid model output never reaches Playwright.
- No browser action starts before approval; non-allowlisted navigation is rejected.
- Each assertion records expected value, observed value, verdict, and evidence reference.
- The seeded total defect fails three consecutive runs; the fixed state passes three consecutive runs.
- Missing or conflicting evidence becomes `INCONCLUSIVE`.
- A fresh viewer can reproduce the state using the report’s replay steps.
- The public repository, deployed demo, and video work in a logged-out browser before submission.
- The README and build log distinguish prior experience from work made during the event.

## Rubric and video

Show the impact as reproducible QA evidence from ordinary acceptance criteria. Show Meta’s material role with the actual constrained plan and linked explanation. Show technical depth through validation, approval, origin restriction, deterministic assertions, and evidence provenance.

For the three-minute video: introduce the checkout problem (0:00–0:20); show the model plan and approval (0:20–0:45); run the broken state and inspect evidence (0:45–1:35); show the fix and green rerun (1:35–2:15); show the execution boundary or inconclusive handling (2:15–2:40); close with measured benefit and the new work (2:40–3:00).

## Deliberate cuts

Do not add arbitrary-site execution, multiple providers, browser matrices, login, team accounts, stored suites, self-healing locators, automatic source changes, real transactions, or visual analysis that fails the first-day gate.
