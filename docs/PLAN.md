# ProofPath MVP plan

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

### 2. Close local verification gaps — October 29–30

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

Owner decisions still required before deployment: hosting provider and cost
limit; numerical per-run/total API spending boundaries; attempt counts and
ingress limits. Selecting the access policy does not authorize API spending
or paid hosting.

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
