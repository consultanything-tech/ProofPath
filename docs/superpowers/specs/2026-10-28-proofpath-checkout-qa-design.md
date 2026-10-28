# ProofPath v2: checkout and order QA workbench

Date: October 28, 2026, Asia/Singapore. Status: design approved as development
input by the user's request to begin development. The [implementation plan](../plans/2026-10-28-proofpath-checkout-qa-implementation.md)
is ready for its written review before code changes. This document does not
claim that v2 is implemented, evaluated or deployed.

## Purpose and success

Help a developer or QA reviewer verify a checkout change without writing a test
for each acceptance criterion. The input is a change request and an authorised
staging release. The output is reviewed regression cases, observed failures,
release comparisons and reproducible evidence, with explicit coverage gaps.

The defining demonstration is an unseen requirement producing useful tests
without a selected scenario, supplied action recipe, defect label or expected
case totals. Meta interprets requirements, identifies ambiguity and chooses
cases/interactions. Deterministic code checks observations against the reviewed
interpretation. This is a hypothesis about usefulness, not validated market
differentiation or a guarantee that a whole release is correct.

The first user is a developer or QA reviewer of an owned, synthetic-data staging
checkout. Production/customer data and authenticated third-party sites are not
the initial target. One supported checkout adapter is the hackathon delivery;
the design must not require a new hardcoded scenario for each requirement.

## Accepted product scope

All six capabilities are part of the minimal v2 flow:

1. Select a registered authorised app and exact release identities; inspect its
   available UI capabilities.
2. Interpret pasted acceptance criteria, retaining source text, ambiguities,
   contradictions and unsupported clauses.
3. Propose happy, negative, boundary and interaction cases where meaningful.
4. Review and approve an immutable suite, then execute it with synthetic inputs.
5. Compare releases and show criterion-level observations and coverage gaps.
6. Save reviewed regression definitions and export an evidence-linked bug packet
   and a usable Node/Playwright regression test.

Keep the current v1 implementation and evidence as a working fallback at
`4ace907`. Its three scenario-bound plans and eight-case language evaluation
remain v1 evidence; none establishes v2 capability.

## First checkout and business-rule vocabulary

Use an owned staging checkout with a small configurable catalogue, cart,
coupon, delivery calculation, required contact fields and synthetic order
confirmation. No real order, payment, email, inventory write or external
integration exists in the reference target.

Proposed demonstration catalogue: Desk Lamp S$40.00, Notebook S$35.00 and
Cable S$4.99. Reference policies: valid quantities 1–5; `SAVE10` discounts the
cart subtotal by 10%; discount rounds half up once per cart; delivery is free
when the discounted subtotal is at least S$75.00, otherwise S$5.00; contact
email/postal code must satisfy the stated required-field rules. These are
reviewable demo facts, not replacements for the source requirements of future
apps. Tax and stacking multiple coupons are unsupported.

The supported typed rules cover quantity bounds, coupon eligibility/percentage,
discount rounding, delivery threshold/basis/fee, required-field constraints and
synthetic checkout state. Only supported rule combinations may execute. Missing
rounding/order/boundary semantics that affect an answer require clarification
or explicit selection of an independently authored reference policy.

Example: S$80 before a 10% discount gives S$72 after discount; delivery is S$5,
so expected total is S$77. A seeded implementation that checks S$80 before
discount incorrectly produces S$72. That expected result is calculated by the
independent oracle, not accepted from model prose or copied from the target app.

The catalogue permits a S$75 basket and a S$74.99 basket. If a requested exact
boundary cannot be constructed from permitted catalogue/quantity inputs, record
that limitation; do not invent a product, price or reachable UI state.

## Workflow and visible states

Select app/releases → inspect → enter criteria → propose suite → review
interpretation/cases/gaps → approve → run → compare → save/export/rerun.

The workbench shows original criteria beside normalized rules and source quotes,
case purpose and inputs, independently computed expected values, and the exact
approval snapshot. There is no test-scenario selector. App/release selection
describes the actual target, not the expected test outcome.

A proposal is either executable with explicit coverage or needs clarification.
Blocking contradictions prevent affected execution. Independent supported
criteria may form a partial suite only when all omitted criteria remain visible
and the reviewer explicitly accepts partial coverage. All-passing executed cases
must not conceal an unsupported or untested criterion.

Input, target, catalogue, rule or release changes invalidate the proposal and
approval. Editing the original criteria requires explicit reproposal; no hidden
model call runs on typing. Loading reports, saving/exporting a suite and rerunning
an unchanged reviewed definition require no model call.

Keyboard review/run/export, pending controls, stale-response rejection, textual
verdicts, focus, narrow-screen layouts and escaped source text remain required.

## Grounding and target boundary

An operator registers a data-only app contract: app ID, exact approved origins,
release paths, readonly assets/endpoints, semantic targets, bounded input domains,
observable fields and reset behaviour. The initial contract supports the owned
reference checkout. An arbitrary pasted URL is not an execution target.

Inspection is an explicitly requested page load using a fresh restricted browser
context. Permit only registered readonly documents/resources; no clicks, fills,
form submissions, credentials, browser storage extraction or external egress.
Do not claim that all GET requests on arbitrary sites are side-effect free.

Capture a bounded visible/accessibility inventory, not raw HTML, hidden values,
customer records or scripts. Separate targets observed now from capabilities
declared by the adapter for later checkout states. A declared hidden control
is not labelled visibly grounded until runtime verifies it. Page text is
untrusted data and cannot change execution instructions.

The model selects semantic target IDs. Adapter-owned locators resolve them;
zero or multiple matches stop the affected check. No model selector, JavaScript,
formula, URL or automatic locator healing is accepted. Existing redirect,
popup, download, WebSocket and service-worker controls are preserved and extended
to the exact v2 resource contract, not replaced with a whole-origin allowlist.

## Model proposal and oracle authority

One explicit suite proposal is one logical Meta request, with at most its existing
one transient retry. The response contains normalized criteria/rules, exact source
quotes, cases and proposed action sequences, coverage mappings, and questions/gaps.
It does not contain executable code or authoritative expected totals.

The model receives the source criteria, reviewed reference facts, bounded UI
capabilities and allowed vocabulary. It does not receive a defect location,
baseline/candidate expected result, a prescribed case sequence or seeded-bug label.
Labels used for release selection must be neutral in the model payload.

The authority chain is:

1. User-reviewed interpretation of the supplied acceptance criteria.
2. Independently authored, versioned reference facts where explicitly adopted.
3. Allowlisted deterministic calculations over those reviewed inputs.
4. Browser observations, used only as actual behaviour.

UI grounding and baseline behaviour are never normative expected results.
Exact source-quote matching verifies traceability, not semantic correctness;
the model can still misunderstand or omit a clause. The review must display the
full source and coverage mapping. Every executable assertion needs a reviewed
criterion/reference source and an allowed derivation. Unsupported or ambiguous
assertions become questions/gaps, not guessed facts.

Implement the oracle separately from the staging application's calculations;
the app must not import the oracle as its runtime implementation. Use integer
minor units and specified rounding. Oracle tests include hand-checked truth
tables and boundary cases. Matching two implementations is still not proof that
the human-approved interpretation is the intended business policy.

## Versioned data and approval

Use an isolated v2 contract/route namespace while v1 remains available. Reuse
reviewed policy/evidence primitives instead of duplicating a second general
browser agent. The conceptual records are:

- AppContract and ReleaseRef: app/adapter versions, allowed resources, catalogue
  fingerprint, release identity and asset/build fingerprints.
- RequirementContract: original source, atomic criteria, source quotes, typed
  rules, adopted reference version, ambiguities and accepted coverage gaps.
- SuiteDefinition: version, case IDs, criteria links, purpose, bounded inputs,
  semantic actions and oracle-backed assertions.
- SuiteApproval: immutable reviewed contract, suite, expected values, target
  snapshots, both release references, provenance and digest.
- SuiteRun/Comparison: case/release outcomes, action records, evidence references,
  coverage, progress/completion status and explicit comparison classification.
- SavedRegression: an immutable reviewed definition with its original provenance;
  execution approvals are never saved for reuse.

The approval binds every field that can alter meaning or side effects, including
the oracle/reference version, expected values, gaps and target/build identities.
Recompute validation/derivations before execution. Ten-minute expiry and one-use
consumption remain. A new candidate or saved-suite rerun gets a fresh approval;
no saved definition silently authorizes another run.

Old manifests retain their exact bytes/hashes and v1 labels. Do not fabricate
v2 build identities, coverage or per-action records for historical runs. Versioned
readers continue to open them. Promote the v2 workbench only after its full flow
passes; the existing UI remains usable during development.

## Execution and release identity

Initial technical limits: at most five cases per suite, ten actions and six
assertions per case, two releases per execution. Run sequentially in fresh
contexts with independent synthetic state. A case has a 30-second limit inside
a 180-second suite deadline; remaining cases are explicitly not-run if exhausted.
These are proposed engineering limits to validate, not performance claims.

Use immutable registered release bundles/fingerprints. A query label or
self-reported DOM version alone does not prove build identity. In the owned demo,
record the served asset manifest/hash and fixture source difference. For a future
external app, distinguish owner-declared build IDs from independently verified
ones. A fingerprint provides consistency, not universal deployment attestation.

One approval launches one bounded paired suite. Return a run ID promptly and
expose read-only progress, avoiding a long HTTP request. Use one in-process
execution slot, no distributed queue. Persist progress and final evidence;
after process interruption, mark unfinished execution interrupted/inconclusive
and never auto-resume or reuse its approval.

Preserve action status, observed values, URL/time, screenshots, hashes and replay.
The deterministic FAIL/PASS/INCONCLUSIVE rules remain; absence, conflicting or
unavailable observations never become PASS. Preserve known failures on interruption.

## Comparison and coverage

Each criterion declares whether its expectation is unchanged or newly introduced/
changed. The reviewer confirms this scope. Apply the approved oracle to both
releases; never infer correctness from their agreement alone.

For unchanged expectations: baseline PASS/candidate FAIL is a regression for the
tested case; FAIL/PASS is a resolved failure; FAIL/FAIL is a persistent failure;
PASS/PASS is a stable passing observation. Missing/incomplete observations make
the comparison inconclusive. Verify compatible inputs, rule/reference versions
and evidence before assigning these relations.

For a new/changed expectation, baseline failure followed by candidate success
means the candidate meets that approved expectation; it is not automatically a
regression or a reproduced old defect. Incompatible contracts/releases are shown
as non-comparable rather than given a misleading delta.

Coverage concerns the submitted criteria, not the whole app. For each criterion
show proposed, executed, passed, failed, inconclusive and uncovered cases, plus
boundary/negative obligations that could not be exercised. Model coverage labels
are checked against the typed rule/case data where possible and reviewed by a
human where semantic judgement is required. Do not market a coverage percentage
as general release confidence.

Overall FAIL dominates known failures. Otherwise incomplete execution or accepted
coverage gaps prevent a complete PASS. Display candidate verdict, coverage and
comparison separately so a partial suite cannot look like whole-release approval.

## Reuse and artifacts

Save immutable suite definitions and their source/reference/adapter versions in
the runtime-data tree. Selecting another compatible candidate regenerates only
the approval envelope and expected derivations, not the case definition or a
model response. Changed requirements, capabilities or oracle versions require
review/reproposal; corruption or incompatibility blocks execution.

Export a Markdown bug packet containing criterion/source, reviewed rule, case
inputs, exact target/build scope, replay steps, expected/observed values,
execution/comparison status, screenshot references/hashes and coverage gaps.
Use deterministic descriptions; an unverified cause must not be labelled proven.

Export a standalone `.test.mjs` using Node's test/assert modules and the installed
Playwright package. Use reviewed adapter-owned templates and correctly escaped
literal test data, never model-written code/selectors. Include approved target
scope, suite digest and rules/adapter versions; exclude keys, sessions and real
customer data. Preserve the fixture resource restrictions and synthetic-only
order boundary. Verify exported tests against the staged builds before labelling
them usable. No new test framework dependency is required for this design.

## Budgets, persistence and hosting

The selected hosting direction remains a managed container with a persistent
volume and unique reviewer codes. Selected Meta targets remain three logical
proposals/code, fifty globally, US$0.05 reserved per proposal including retry,
and US$2.50 total. They do not automatically authorize larger v2 prompts/calls.

The complete v2 payload/schema/output and at most two attempts need a refreshed,
verified conservative cost bound. Keep the existing 4096 completion limit until
evidence and owner approval justify changing it. If a useful v2 proposal cannot
fit the selected reservation, report the measured limitation and obtain a new
decision; do not weaken accounting or silently raise limits. No automatic
post-run explanation call is part of the core.

Saved reruns use no Meta call but do consume host/browser capacity. Proposed
additional execution limits are three suite executions/code and fifty globally,
including saved reruns; each paired execution contains at most ten case contexts.
Thus the old assumption of at most fifty browser contexts no longer applies:
up to five hundred contexts and their evidence need measured resource/storage
budgets. These new execution limits need review with this design.

Persist code quotas, reservations, suite definitions, run progress and evidence
before relevant side effects. Missing/corrupt state fails closed; restart does
not reset allowances. Pending approval/session loss is explicit. Preserve
issued evidence links through judging and reject work before storage exhaustion.
Use the existing single-instance host plan as a reference; its cost/storage
estimate must be rebased for v2 before provisioning. No paid host is selected
or created by this document.

## Evaluation and delivery gate

Local correctness gates cover typed validation, independent oracle arithmetic,
source traceability, ambiguity/gap handling, approval tamper/expiry/reuse, exact
resource policy, fresh-case isolation, interrupted suites, all comparison
relations, saved-definition compatibility, artifact fidelity and v1 compatibility.
Exported tests must produce the same observations/verdicts against the reference
builds, not merely pass a syntax check.

Before new live evaluation, freeze unseen requirement packs with human-annotated
critical criteria/coverage obligations, including changed numeric policies,
ambiguous/contradictory wording and an unsupported requirement. Meta receives
permitted facts and capabilities, not the expected test plan or defect label.
Report omissions and semantic failures; do not turn prompt-tuning retries into
independent successes. The v1 eight-case result is not carried forward.

The complete demo must accept a fresh requirement, surface an ambiguity/gap,
generate an interaction case, obtain approval, expose the coupon/delivery defect,
compare exact releases, rerun the saved definition against a fixed build with
fresh approval, and export a reproducible bug packet/test. Disclose seeded
defects and prepared release bundles. No broad reliability or time-saving claim
is made without measurements and a relevant baseline.

Target a working interpretation → approval → paired execution → evidence spine
by October 31. Reserve November 1 for reuse/export/evaluation, November 2 for
deployment/reviewer fixes, November 3 for the narrated demo and final checks,
and November 4, 17:00 SGT for submission. The recorded hard deadline is
November 5, 10:00 SGT and must be refreshed before submission.

If the spine is not demonstrated by October 31, present an explicit scope
decision to the user. Do not silently drop accepted reuse/export capabilities
or weaken oracle/approval/browser/evidence boundaries. The verified v1 remains
a recoverable fallback, not evidence that the expanded product is complete.

## Explicit exclusions and remaining uncertainty

No arbitrary-site support, authentication/payment flows, production customer
data, autonomous application fixes, locator healing, screenshot-based factual
oracles, full CI/GitHub integrations, team administration, vector database or
extra model provider is included. App portability is limited to the supported
checkout contract; it is not established by changing a stylesheet or relabelling
the demo. A second independent app requires a separately verified adapter.

The main uncertainties are meaningful model-generated coverage under the token/
cost cap, semantic rule interpretation, adapter onboarding effort, independent
oracle correctness, execution/evidence growth and the remaining delivery time.
Review this written design before generating the v2 implementation plan.

## Context and sources

- [Implemented v1 PRD](../../PRD.md) and [verification history](../../BUILD_LOG.md).
- [Previous deployment plan](../../PLAN.md), whose resource assumptions need v2 review.
- [Playwright Test Agents](https://playwright.dev/docs/test-agents): existing
  planning/generation/healing means ordinary test generation alone does not
  establish differentiation. No comparison benchmark or novelty claim was made.
- [Participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
  and [kickoff notes](https://southern-neon-d03.notion.site/Meeting-405b81574b6780a995efc33d55856c0a).
  Submission details in project documents were reviewed previously; the public
  guide's dynamic content did not load during the latest concept-review fetch.
