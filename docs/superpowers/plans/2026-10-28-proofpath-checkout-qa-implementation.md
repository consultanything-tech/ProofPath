# ProofPath v2 Checkout QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Preserve the user's selected planner → implementer → parent validation method; do not ask them to select it again.

**Goal:** Deliver the six-capability checkout QA workbench locally, retaining the verified v1 application and evidence.

**Architecture:** Add versioned v2 contracts and routes beside v1. Meta proposes a requirement interpretation and bounded semantic cases; a human reviews them and independent oracle code computes expected results. A one-use approval launches an asynchronous paired run with durable evidence, comparison, saved-suite reuse and deterministic exports.

**Tech Stack:** Node 26, TypeScript, pnpm, native HTTP/fetch/filesystem/crypto/node:test, installed Playwright; no new dependency.

**Spec:** [Approved v2 design](../specs/2026-10-28-proofpath-checkout-qa-design.md). The user approved development from this design on October 28 and instructed continuation after this concrete plan was written. Execution uses the agreed planner → implementer → parent validation method.

## Global Constraints

- Preserve fallback commit `4ace907`, v1 routes/root UI and existing evidence bytes/hashes. Develop v2 at `/workbench.html` and `/api/v2/*`.
- New records use contract/artifact version `"2"`; old records are never relabelled v2.
- Owned synthetic checkout only: no arbitrary URLs, authentication, payment, real order/email/inventory writes or customer data.
- Catalogue minor units: Desk Lamp `4000`, Notebook `3500`, Cable `499`. Quantity range `1..5`.
- Reference coupon `SAVE10`, `1000` basis points; half-up discount rounding once per cart.
- Reference delivery is free when discounted subtotal is at least `7500`, otherwise `500`.
- Maximum five cases, ten actions and six assertions per case, two releases per execution.
- Case deadline `30_000ms`; suite deadline `180_000ms`; one active job, no queue or automatic resume.
- Preserve one-use ten-minute approval, deterministic FAIL precedence and exact resource restrictions.
- Use one Meta proposal response for rules/cases/gaps, with existing `4096` completion cap and at most one transient retry. No hidden model call on input, run, save, export or reuse.
- Start with fixture/mocked transport. Live v2 stays disabled pending a verified larger-request cost bound and applicable spending authorization. Selected `3 proposals/code`, `50 global`, `US$0.05/proposal`, `US$2.50 total` remain targets; their v2 cost fit is not established.
- Separate browser execution accounting from Meta proposals: persist a local execution limit of fifty accepted suite jobs per runtime-data set; reviewer-code accounting belongs to the later deployment policy. No new paid host, key, code distribution or public visibility change.

## Review Focus

1. A valid source quote can still misinterpret/omit a clause: require explicit per-criterion human decisions and visible full-source/gap review (Task 2).
2. Model-declared inputs can disagree with the actual actions: derive oracle inputs from the validated sequence, never a second unverified input description (Tasks 1–2).
3. A changed build/reference can invalidate an apparently approved suite: reject fingerprint drift and incompatible saved definitions before browser launch (Task 3).
4. Restart after a failure can erase context or suggest success: preserve known FAIL, mark unfinished work interrupted/not-run, never restore approval or resume (Task 3).
5. Delayed responses, duplicate starts and expired approvals can combine: synchronous client guards plus authoritative atomic admission, with no queued second job (Tasks 3–4).

## File/Responsibility Map

Create `src/v2-contracts.ts` (types/strict validation), `src/v2-checkout.ts`
(registered targets/fingerprints), `src/v2-oracle.ts` (independent rule arithmetic),
`src/v2-planner.ts` (inspection/proposals/review compilation), `src/v2-store.ts`
(definitions/approvals/progress), `src/v2-runner.ts` (paired execution/comparison),
`src/v2-artifacts.ts` (exports), and `src/v2-http.ts` (route dispatch).

Create `public/workbench.html`, `public/workbench.js`, and the reference target
under `public/v2-target/`: common `checkout.css`, common UI `checkout-ui.js`, and
neutral release directories `r1/`, `r2/`, `r3/`, each with `index.html` and
`checkout.js`. Release calculation code must not import the oracle; shared UI
code may manage controls, not the expected-result authority.

Create `tests/v2-core.test.ts`, `tests/v2-planner.test.ts`,
`tests/v2-runtime.test.ts`, `tests/v2-artifacts.test.ts`,
`tests/v2-browser.integration.ts`, `tests/v2-ui.integration.ts`.
Modify `src/server.ts` for one v2 dispatch hook, `public/styles.css` for scoped
styles, `package.json` for tests and `.env.example` for disabled live settings.
Do not refactor v1 into a new general browser framework as part of this work.

## Shared Contract Decisions

Define/export these records in `src/v2-contracts.ts`; all persisted/API shapes
have strict unknown-field rejection and bounded strings/arrays.

- `Catalog`: readonly SKU/unit-price facts; `ReleaseRef`: neutral ID, document
  path, exact resource list and content fingerprint; `AppContract`: app/adapter
  version, catalogue, semantic targets, readonly inspection policy.
- `CheckoutRules`: SGD currency, quantity bounds, coupon code/basis points,
  half-up rounding, delivery basis/threshold/inclusivity/fee, required-field and
  synthetic-confirmation policy. Values are parameterized reviewed inputs, not
  compile-time expected answers.
- `RequirementContract`: original text, atomic criterion IDs/exact source quotes,
  normalized rules, adopted reference IDs, expectation scope and coverage gaps.
- `SemanticAction`: discriminated open-app, add-product, set-quantity,
  remove-product, fill/apply-coupon, open-contact, fill-contact and
  confirm-synthetic-order. Targets/values come from the bounded adapter domain.
- `CaseDefinition`: ID, criterion links, category/rationale, semantic actions,
  and assertion IDs/predicates. Model-supplied expected totals are prohibited.
- `CaseInput`: cart/coupon/contact/state derived by validating the action
  sequence; `ExpectedCase`: resulting deterministic values/observations.
- `GroundingBundle`: both release snapshots, observed versus declared targets
  and pair fingerprint; `ProposalResult`: proposal or clarification with gaps.
- `ReviewDecision`: per criterion, accepted interpretation and
  `unchanged | new-or-changed` scope, adopted references and accepted gaps.
- `SuiteDefinition`: versioned requirement, cases and adapter/reference identity;
  `SuiteApproval`: exact reviewed definition, derived expectations, both release
  refs/grounding, provenance, digest/expiry and one-use state.
- `SuiteRun`: run ID, approval digest, status, ordered case/release records,
  existing action/assertion evidence fields and coverage; `SavedRegression`:
  immutable reviewed definition/provenance, never execution permission.
- `PreparedProposal`: immutable model proposal/context plus ID;
  `PreparedSuite`: reviewed compiled envelope, independent expectations, ID and
  digest, not yet approved; `ApprovalReceipt`: approval ID/digest/expiry.
- `V2Context`: trusted app/catalogue/reference/releases/grounding plus original
  requirement. It contains no browser response treated as normative policy.

Unknown quantity-rejection UI semantics must not be invented. Core negative
browser cases use explicitly defined invalid-coupon and blank-required-field
behaviour; out-of-domain quantity actions reject, and untested UI rejection is
a visible gap if requested. Contact data uses non-deliverable synthetic values.

---

### Task 1: Registered Checkout, Strict Cases and Independent Oracle

**Files:** `src/v2-contracts.ts`, `src/v2-checkout.ts`, `src/v2-oracle.ts`,
`public/v2-target/*`, `tests/v2-core.test.ts`, initial browser target checks in
`tests/v2-browser.integration.ts`.

**Interfaces:**
`registeredCheckoutApp(origin: string): AppContract`;
`resolveRelease(id: string): ReleaseRef`;
`deriveCaseInput(actions: SemanticAction[], context: V2Context): CaseInput`;
`calculateCheckout(input: CaseInput, rules: CheckoutRules, catalog: Catalog): ExpectedCase`;
`validateCase(value: unknown, context: V2Context): CaseDefinition`;
`digestV2(value: unknown): string`.

- [ ] Write failing strict-shape/action/bounds tests and the following independent truth table. `inputFor` and `rulesFor` are test fixtures built from the shared records, not production constructors.

```ts
assert.equal(calculateCheckout(inputFor([["desk-lamp", 2]], "SAVE10"), rulesFor(), catalog).totalMinor, 7700);
assert.equal(calculateCheckout(inputFor([["desk-lamp", 1], ["notebook", 1]], null), rulesFor(), catalog).totalMinor, 7500);
assert.equal(calculateCheckout(inputFor([["notebook", 2], ["cable", 1]], null), rulesFor(), catalog).totalMinor, 7999);
assert.equal(calculateCheckout(inputFor([["notebook", 2], ["cable", 1]], "SAVE10"), rulesFor(), catalog).totalMinor, 7249);
assert.equal(calculateCheckout(inputFor([["desk-lamp", 2]], "SAVE10"), rulesFor({deliveryThresholdMinor: 7000}), catalog).totalMinor, 7200);
```

- [ ] Verify the tests fail because the interfaces are absent; do not accept an unrelated syntax/environment failure as red.
- [ ] Implement typed rules and integer arithmetic, exact target validation and action-state derivation. Reject unknown SKUs, duplicate IDs, code/URLs/selectors, excessive actions and quantity `0`/`6`; invalid coupon is an allowed bounded test input with explicit expected error behaviour.
- [ ] Implement neutral release bundles: r1 correct, r2 before-discount delivery defect, r3 fixed. Their HTML/resources have stable distinct fingerprints. No query flag changes a release's implementation; no release imports expected-value code.
- [ ] Test actual DOM totals: two lamps/SAVE10 gives r1/r3 `7700`, r2 `7200`; verify synthetic validation/confirmation and context-local reset. Test rule changes alter oracle expectations without changing oracle code.
- [ ] Run `pnpm build && node --test dist/tests/v2-core.test.js`, then the targeted v2 browser checks with Chromium permissions. Require all green; review diff and commit only this task's files.

**Deliverable:** A real richer target and rule-driven expected-result engine, independent of Meta and the target's calculation code.

### Task 2: Grounded Suite Proposal and Explicit Review

**Files:** `src/v2-planner.ts`, `tests/v2-planner.test.ts`, extend v2 browser checks.

**Interfaces:**
`inspectRegisteredTarget(context: V2Context): Promise<GroundingBundle>`;
`buildMetaSuiteRequest(context: V2Context): object`;
`validateSuiteProposal(value: unknown, context: V2Context): ProposalResult`;
`compileReviewedSuite(proposal: ProposalResult, review: ReviewDecision, context: V2Context): SuiteDefinition`;
`createV2Planner(env: NodeJS.ProcessEnv, fetcher?: typeof fetch): {propose(context: V2Context): Promise<ProposalResult>}`.

- [ ] Write failing request/validation/review tests. Assert unreviewed exact-quote proposals cannot compile; contradictory adopted policies block; accepted gaps remain visible and prevent complete coverage.
- [ ] Test input/action agreement through `deriveCaseInput`. A proposal claiming a SAVE10 case whose actions never apply a coupon cannot be labelled as covering coupon interaction. Expected values must come only from `calculateCheckout`.
- [ ] Implement explicit readonly inspection with exact registered GET resources and no interactions/storage/hidden-value extraction. Known owned scripts may render the UI under the same egress policy; do not claim JS-disabled inspection works for every app. Label later-state controls declared-but-not-observed, and validate them when execution reaches that state.
- [ ] Implement fixture transport and strict native-fetch Meta request/parser. Fixture mode remains explicit. No fallback or automatic follow-up call; invalid/truncated output produces no executable suite.
- [ ] Test that non-source payload metadata has neutral releases and no recipe, expected totals or defect annotation. Do not censor words such as “candidate” from the user's original criteria.
- [ ] Preserve the 4096 completion limit, thirty-second provider deadline, response-size bound and at most one transient retry. Production v2 live dispatch remains disabled until the new cost gate is verified; injected mocks are used in tests.
- [ ] Run `pnpm build && node --test dist/tests/v2-planner.test.js` and affected v2 inspection checks. Require all green; review and commit the task.

**Deliverable:** Meaningful, reviewable case/rule proposals from criteria and capabilities, with no scenario selector and no browser test execution yet.

### Task 3: One-Use Suite Approval, Durable Paired Jobs and Comparison

**Files:** `src/v2-store.ts`, `src/v2-runner.ts`, `src/v2-http.ts`, the v2 hook in
`src/server.ts`, `tests/v2-runtime.test.ts`, extend v2 browser checks.

**Interfaces:**

```ts
class V2Store {
  constructor(dataDir: string);
  createProposal(proposal: ProposalResult, context: V2Context): Promise<PreparedProposal>;
  reviewProposal(proposalId: string, review: ReviewDecision): Promise<PreparedSuite>;
  approveSuite(suiteId: string): Promise<ApprovalReceipt>;
  consumeApproval(approvalId: string): Promise<SuiteApproval>;
  readJob(runId: string): Promise<SuiteRun>;
  recoverInterruptedJobs(): Promise<number>;
  saveRegression(runId: string): Promise<SavedRegression>;
  prepareRegression(regressionId: string, context: V2Context): Promise<PreparedSuite>;
}
```

Clarifications create no prepared suite/approval. `reviewProposal` uses Task 2's
compiler and returns the exact compiled snapshot/digest for final approval;
it does not approve or run it. Pending proposals/approvals are bounded in-memory
records; durable reviewed definitions/jobs are separate. Store and runtime may
share private persistence helpers; do not create another public job framework.

`createV2Runtime(store: V2Store, origin: string)` exposes
`start(approvalId: string): Promise<{runId: string}>` and
`read(runId: string): Promise<SuiteRun>`.
`classifyComparison(previous, proposed, scope): ComparisonClass` accepts two
case/release outcomes and reviewed `unchanged | new-or-changed` scope.
`handleV2Request(req, res, context): Promise<boolean>` returns whether it handled
the route; existing v1 Host/Origin validation remains authoritative.

- [ ] Write failing approval tests for every bound field, tampering, expiry at ten minutes, consumption twice, changed fingerprint/reference and accepted partial coverage.
- [ ] Write admission/recovery tests: lock synchronously before awaiting storage; reject overlap with `409` before consuming another approval or creating another job. Persist job/admission before browser launch; disk/state failure fails closed. Execution count survives restart and blocks job 51 in that data set.
- [ ] Implement one asynchronous in-process slot and return `202/runId` promptly. Use `/api/v2/groundings`, `/proposals`, `/proposals/:id/review`, `/suites/:id/approve`, `/approvals/:id/runs` and `GET /runs/:id`. Review returns a frozen unapproved suite; approval alone grants its one use. Strict methods/JSON/body/ID/path and exact local Host/Origin rules apply; no queue or automatic resume.
- [ ] Run identical approved cases sequentially against both exact releases, fresh context/state each time, respecting 30-second case and 180-second suite bounds. Retain action results, observations, URL/time, screenshot hashes and final manifest sidecar using existing evidence conventions.
- [ ] Persist progress atomically under trusted runtime data (`runs/v2` locally unless server-configured DATA_DIR). On startup, accepted/running jobs become interrupted, preserve known FAIL and completed observations, pad remaining work not-run/inconclusive. Never recreate consumed approvals or reset accounting from missing/corrupt prior state.
- [ ] Implement/test unchanged-scope PASS→FAIL regression, FAIL→PASS resolved failure, FAIL→FAIL persistent failure and PASS→PASS stable observation. New/changed scope uses expectation-met/not-met labels; incompatible inputs/reference/builds are non-comparable. Missing observations are inconclusive; candidate verdict and coverage are separate.
- [ ] Exercise timing with trusted internal test limits/clock control rather than mandatory multi-minute sleeps. Production server always uses the specified bounds; HTTP/model input cannot choose or increase them.
- [ ] Verify missing/tampered evidence blocks complete PASS; all-passing executed cases plus an accepted gap remains partial/inconclusive. Verify fingerprints before browser launch and avoid trusting candidate behaviour as the oracle.
- [ ] Run `pnpm build && node --test dist/tests/v2-runtime.test.js` and completed v2 browser checks. Because server routing changed, run affected v1 unit/server and Chromium safety suites. Require all green; review and commit.

**Deliverable:** The complete reviewed interpretation → paired execution → comparison/evidence spine.

### Task 4: Workbench, Regression Reuse and Usable Exports

**Files:** `public/workbench.html`, `public/workbench.js`, scoped shared CSS,
`src/v2-artifacts.ts`, extend `src/v2-http.ts`, `tests/v2-artifacts.test.ts`,
`tests/v2-ui.integration.ts`.

**Interfaces:** `renderBugPacket(run: SuiteRun): string`;
`renderPlaywrightExport(approval: SuiteApproval): string`.
Use Task 3's save/prepare operations. Expose saved-definition listing/read,
save-regression, prepare, bug-packet and `.test.mjs` download routes beneath
`/api/v2`; all IDs are server-generated/validated and paths server-owned.

- [ ] Write failing artifact/reuse tests: save immutable reviewed cases, prepare a compatible new release pair without Meta, require fresh approval and reject changed/corrupt adapter/reference data.
- [ ] Test deterministic packet/export ordering and literal escaping (quotes, newline, Unicode, `</script>`). Include source/rule/case/build/digest, observed results, screenshots/hashes and gaps. Exclude keys, sessions and unverified root-cause claims.
- [ ] Generate export only with reviewed adapter-owned templates, `node:test`, `node:assert/strict` and installed Playwright. Retain target/resource and synthetic-order restrictions. Execute exports against r2/r3: the buggy case must actually fail on r2 and pass on r3; syntax success alone is insufficient.
- [ ] Implement the single workbench flow: app/releases, inspect, criteria, rule/case/gap review, one-use approval, bounded progress, candidate/coverage/comparison report, saved-suite selection and artifact downloads. Retain `/` as v1; give v2 an explicit fixture/live-disabled label until live verification.
- [ ] Test keyboard flow, readable/raw agreement, partial coverage, duplicate starts, delayed responses, malformed IDs and desktop/mobile overflow. Changing inputs/releases invalidates proposals; loading/saving/exporting/reusing makes zero planner calls. Escape all source/model text and constrain image/link paths.
- [ ] Run `pnpm build && node --test dist/tests/v2-artifacts.test.js`, v2 UI checks and affected v1 UI regression. Require all green, visually inspect the complete workflow, then review and commit.

**Deliverable:** All six accepted product capabilities work locally in explicit fixture mode.

### Task 5: Frozen Evaluation Readiness and Honest Verification Record

**Files:** `package.json`, `.env.example`, `docs/evaluations/v2-frozen-requirements.json`,
README and existing PRD/plan/kit/handoff/build-log status notes.

- [ ] Add `test:v2` for `pnpm build && node --test dist/tests/v2-*.test.js` and `test:v2:browser` for the two v2 `.integration.js` files. No new dependency or provider abstraction.
- [ ] Freeze human-annotated unseen requirement packs before live evaluation: include changed thresholds, coupon/delivery interaction, ambiguous/contradictory wording and unsupported criteria. Define critical coverage obligations, not a model-visible answer recipe.
- [ ] Verify the full fixture demonstration: inspect r1/r2; propose/review/approve; discover the delivery mismatch; save; prepare r1/r3 without Meta; freshly approve and rerun; reopen comparison; download and execute the exported test. Preserve exact labels for fixture versus eligible-model evidence.
- [ ] Run `pnpm typecheck`, `pnpm test`, `pnpm test:safety`, `pnpm test:ui`, `pnpm test:v2`, `pnpm test:v2:browser`, and `git diff --check` once the integrated changes are ready. Re-run passing suites only if subsequent changes affect them or a failure/new concern warrants it.
- [ ] Record deployed status as not deployed and v2 Meta status as unverified. Record hashes, tested builds, suite/case outcomes, coverage and skipped checks; preserve existing reports and fallback commit.
- [ ] Build and inspect the full v2 request/cost maximum offline against refreshed official rates and verified accounting. Do not dispatch a live request merely because MODEL_API_KEY exists or v1 calls succeeded. If it cannot fit selected targets, present measured options instead of raising the cap or weakening the oracle.
- [ ] Review and commit verification/docs. Only then pursue separately authorised live evaluation and rebased managed-container/reviewer-access deployment.

**Deliverable:** A locally verified v2 candidate, not a submission-ready claim until eligible live-model, hosted reviewer and submission gates also pass.

## Delivery and Review Handoff

Interpretation/approval/paired execution/evidence spine by October 31; reuse,
exports/evaluation on November 1; deployment/reviewer fixes November 2; demo
November 3; internal submission November 4 at 17:00 SGT. If the spine misses
October 31, present an explicit scope/fallback decision; do not silently drop
accepted capabilities or weaken safety.

The registered adapter, arithmetic oracle, schema version and catalogue choices
are concrete here. Remaining uncertainty is empirical: meaningful live model
coverage/cost, adapter portability and runtime/resource fit. Keep v1 usable while
resolving those. Hosting/access control and their cost approvals are subsequent
work, not implied by this local-development plan.

Use the preserved planner → implementer → parent validation method task by task,
following the user's continuation instruction. The first code deliverable is
Task 1's checkout/oracle slice. Keep completion checkboxes honest as work proceeds.
