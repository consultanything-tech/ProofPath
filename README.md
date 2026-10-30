# ProofPath

ProofPath turns a plain-language browser journey into an approved run and an evidence-linked verdict.

The selected next product direction is a checkout/order QA workbench: acceptance
criteria → reviewed suites → paired release evidence → saved regression cases
and exports. The [v2 PRD/design](docs/superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md)
and [implementation plan](docs/superpowers/plans/2026-10-28-proofpath-checkout-qa-implementation.md)
now have a local fixture implementation. It has no v2 live-model or deployment
evidence: `V2_PLANNER_MODE=meta` remains fail-closed pending the recorded
[cost readiness assessment](docs/evaluations/v2-cost-readiness.md), a separately
authorised request, and evaluation of the frozen holdout.

The test-only budgeted mock path enforces 3 proposals per allowlisted reviewer
code, 50 globally, and US$0.05 reserved per proposal (US$2.50 total). It records
reservations and retry attempts on disk and retains them after failures or
restart. It is not a live-cost meter or a deployed reviewer access system;
V2 Meta dispatch remains disabled.

## Hackathon scope

### V1 baseline evidence

- Event: Meta Global AI Developer Hackathon
- Track: Indie Developer — Build for Your World
- Participation: accepted and solo; acceptance was confirmed in the setup conversation on 26 October 2026.
- Status: all fixture journeys and core local safety checks are implemented. Eight fixed live planning cases met their declared expectations (six plans, two clarifications). Live-generated plans have local browser evidence for all three journeys: add-to-cart PASS, saved quantity seeded FAIL/fixed PASS, and saved required-fields PASS. Saved-plan executions used fresh chat-authorized approvals without new model requests; see [quantity evidence](docs/evaluations/saved-quantity-runs-v1.md) and [build log](docs/BUILD_LOG.md). Readable review/report UI and per-action evidence are verified locally in fixture mode. Fresh live-proposal UI approval, broader reliability and deployment remain open.

The V1 demo is deliberately narrow:

1. A participant describes a checkout journey.
2. A Meta model proposes a constrained action and assertion plan.
3. A human reviews and approves the plan.
4. Playwright runs the approved plan only on the controlled demo origin.
5. ProofPath reports cited `PASS`, `FAIL`, or `INCONCLUSIVE` findings.
6. A developer fixes the seeded defect and the same journey is rerun.

`PASS` and `FAIL` come from deterministic assertions. The model may explain linked browser evidence but cannot override a verdict. Missing or conflicting evidence is `INCONCLUSIVE`.

### V2 local fixture workflow

At `/workbench.html`, an owned checkout requirement becomes an inspected,
reviewed suite with bounded semantic actions. The independent typed oracle derives
expected results; an exact one-use approval runs a baseline and candidate release
in fresh contexts. The report keeps per-action evidence, coverage gaps, and the
separate candidate and suite verdicts, so a passing candidate can still leave the
suite `INCONCLUSIVE` when accepted coverage is partial. A reviewed regression can
be saved, rebound to a compatible release pair without another planner call, and
downloaded as an evidence-linked bug packet or Playwright test. These are local
fixture capabilities; they do not establish v2 live Meta behavior.

Start with [the PRD](docs/PRD.md) and [development kit](docs/DEVELOPMENT_KIT.md). See also [the plan](docs/PLAN.md) and [the build log](docs/BUILD_LOG.md).

## Prior-work boundary

TestForgeAI is prior experience, not this project’s implementation. This base contains no reused implementation. Any future reuse must be owned or permitted, disclosed, and distinguishable from hackathon work; do not use employer, private, client, or credentialed data.

## Run locally

Use Node 26 and pnpm:

```sh
pnpm install
pnpm exec playwright install chromium
PLANNER_MODE=fixture pnpm dev
```

Open `http://127.0.0.1:3000/`. This exact local host is required. Run `pnpm test`
for focused unit/server checks and `pnpm test:safety` for the loopback-only
Chromium harness. Generated screenshots and manifests stay in ignored `runs/`.
Use `pnpm test:ui` for the loopback UI regression covering review, approval,
execution, saved-report reopening, duplicate/stale requests and legacy evidence.
Both browser suites require permission to launch Chromium on the local machine.
Use `pnpm test:v2` for v2 unit/runtime checks and `pnpm test:v2:browser` for the
serial v2 Chromium checks.

For a future **v1** live test, copy `.env.example` to the ignored `.env` and configure
the key locally; `pnpm dev` loads that optional file. Meta mode requires
`PLANNER_MODE=meta` and `MODEL_API_KEY`. Missing/invalid mode or a missing key
fails startup. Keep fixture mode selected until account readiness and a live
test spending boundary are confirmed. Never put keys in chat or commit them.
There is no startup/background model call. Propose plan in Meta mode sends the
synthetic requirement and public scenario facts to Meta; a clarification creates
no approvable plan, and provider errors never substitute a fixture.
The v2 workbench remains fixture-only; configuring the v1 planner does not
enable v2 model calls.

## V1 implementation and evidence

The stack is Node.js, TypeScript, pnpm, Playwright and a thin local server. Fixture mode creates canned plans and explicitly says it does not interpret text or call Meta. Meta mode uses a direct Model API adapter with strict schema validation and no fallback; live-generated add-to-cart and saved quantity plans have controlled local browser evidence. UI labels and immutable approval/report provenance identify the selected mode.

The v2 workbench keeps its own fixture mode and does not use the v1 evidence as
v2 Meta evidence. Its agent-drafted [frozen holdout](docs/evaluations/v2-frozen-requirements.json)
awaits owner annotation review; annotations are excluded from a future product
planner request. Its strict structured-output schema has offline tests, while
v2 live dispatch stays disabled.

The server hashes the requirement, scenario revision, target registry, planner provenance and validated plan into a one-use ten-minute approval. A fresh browser context permits only the synthetic shop and its two assets. Runs are serialized, bounded and reported as completed, blocked, timed-out or failed. The seeded quantity revision observes 3900 cents for quantity 2 and fails; the fixed revision observes 7800 and passes. Blank checkout requires both visible errors and an active checkout state. Reports retain approval snapshots, replay, URL/time, screenshots and hashes. Missing evidence cannot produce PASS, and a known failure survives interrupted execution.

The October 26 Billing inspection showed $150 free credits, $0 balance and no payment method. On October 27 one authenticated Meta request returned a valid plan (estimated token cost US$0.003463), and the exact plan passed its controlled local browser run. Current card/credit balance was not reinspected and no billing setting changed. The initial eight-case live planning evaluation passed; broader language reliability and public deployment remain open. See [evaluation results](docs/evaluations/live-results-v1.md) and BUILD_LOG for exact evidence and limitations.

## Submission checklist

The Cerebral Valley submission requires new event-period work or prior-work disclosure, Build for Your World theme fit, material Meta model tooling, a public GitHub repository, and a narrated three-minute demo. The participant guide judges impact (30%), Meta tooling (25%), technical depth (20%), and demo quality (25%), and names a working live product as a judging artifact. The reviewed form did not present a live-product URL field. The deadline is November 5, 2026, 10:00 SGT; an X post/URL is optional for Most Viral.

## Not in the MVP

Arbitrary websites, authentication, real payments, cross-browser support, team features, self-healing selectors, automatic fixes, autonomous execution, and unproven visual comparison are out of scope. V2 supports saved reviewed regression definitions only; it does not add team accounts or a general persistent-suite service.

The event guide is the current rules reference: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details>.
