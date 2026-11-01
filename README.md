# ProofPath

ProofPath turns a plain-language browser journey into an approved run and an evidence-linked verdict.

The selected next product direction is a checkout/order QA workbench: acceptance
criteria → reviewed suites → paired release evidence → saved regression cases
and exports. The [v2 PRD/design](docs/superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md)
and [implementation plan](docs/superpowers/plans/2026-10-28-proofpath-checkout-qa-implementation.md)
now have local fixture and guarded Meta Responses implementations. One authorized
live v2 proposal completed local review, seeded-defect execution and saved fixed
rerun on October 31. See the [canary record](docs/evaluations/v2-live-canary.md)
and [admission basis](docs/evaluations/v2-responses-admission-basis.md).
The frozen holdout, independent review and managed-host deployment remain open.

Controlled live mode enforces 3 proposals per allowlisted reviewer code,
50 globally, and US$0.05 reserved per proposal including retries (US$2.50 total).
Signed durable state retains reservations after failure and restart. This is a
local admission control, not account-wide billing reconciliation or proof of a
deployed reviewer service. The older mock-only ledger remains test evidence.

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

### V2 local workbench

At `/workbench.html`, an owned checkout requirement becomes an inspected,
reviewed suite with bounded semantic actions. The independent typed oracle derives
expected results; an exact one-use approval runs a baseline and candidate release
in fresh contexts. The report keeps per-action evidence, coverage gaps, and the
separate candidate and suite verdicts, so a passing candidate can still leave the
suite `INCONCLUSIVE` when accepted coverage is partial. A reviewed regression can
be saved, rebound to a compatible release pair without another planner call, and
downloaded as an evidence-linked bug packet or Playwright test. These are local
capabilities. The guarded live canary exercised the same workflow with a real
Meta-generated suite; that selected case does not establish general reliability.

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
The v1 direct adapter has no proposal-budget ledger; use the controlled v2
bootstrap below for budgeted Meta work. It disables v1 mutation/model routes.

The legacy `PLANNER_MODE=baseten` V1 scaffold remains disabled before transport.
The implemented V2 Baseten backend uses the awarded
`meta-models/muse-spark-open-1026` Responses profile with one generation attempt,
4,096 output tokens and mandatory local schema/semantic validation. Baseten's
Muse model accepts schema guidance without enforcing it. V2 Meta and Baseten
share one signed aggregate budget after explicit migration; switching providers
cannot replenish quotas. The earlier US$5 independent-canary proposal was never
approved and is superseded by the existing US$0.05/proposal policy.

Baseten product wiring and mocked browser tests are complete locally. Actual
grant-key metadata, exact input counting and model generation remain unverified;
no real Baseten request or operator migration had occurred at the October 31
checkpoint. On November 1 the configured hackathon key successfully read the
inference catalog, but management metadata returned 403 and the candidate
Responses input-count endpoint returned 404. No model generation or migration
has occurred. Live enablement remains blocked on a documented input bound. See the
[integration readiness record](docs/evaluations/v2-baseten-integration-readiness.md).

### Controlled local v2 Meta mode

Configure `MODEL_API_KEY` only in ignored `.env`. Explicit initialization creates
one private reviewer code and a fresh version-2 live ledger; **run it once for a
new operator directory**, never to replenish an existing budget:

```sh
pnpm operator:v2:init
V2_PLANNER_MODE=meta PLANNER_MODE=fixture \
  DATA_DIR=runs/v2-live/data V2_OPERATOR_DIR=runs/v2-live/operator \
  PORT=3010 pnpm dev
```

Open `http://127.0.0.1:3010/workbench.html`. Retrieve the code locally from
`runs/v2-live/operator/reviewer-code.txt`; never paste it into chat or a URL.
The code stays in page memory and is needed again after reload. “Open protected
workbench” reopens saved reports without spending a proposal, even after quota
exhaustion. Counts and generation use the exact same immutable Responses body.
Oversized input, invalid authentication, quota exhaustion or unavailable durable
state prevents generation; no fixture fallback occurs.

The October 31 setup already exists and its preview uses port 3010. Do not
initialize it again or start a second owner while that server is running. Keep
the private operator directory and data on durable storage; normal startup
refuses missing/corrupt state, old mock state and another owner. Crash-left locks
require explicit operator investigation, never automatic deletion or budget
reset. This loopback-only bootstrap does not authorize public hosting or more
live requests. The canary used one proposal; 2 remain for that code and 49
globally, with US$0.05 permanently reserved.

### Controlled local v2 Baseten readiness

Preserve the existing `.env`; do not copy the example over it. Open it locally
with `open -e .env`, add `BASETEN_API_KEY=your_key`, retain `MODEL_API_KEY`, and
restrict its permissions with `chmod 600 .env`. Never put keys in chat, commands,
screenshots or Git. `.env` is ignored. This integration does not retrieve a
one-time credential link, configure billing or change account budgets.

Run the non-generating compatibility check:

```sh
pnpm baseten:preflight
```

It now makes one documented inference-catalog GET, validating the exact suffixed
model, context and prices. It never generates, probes a counter, opens/migrates
an operator ledger or consumes a proposal reservation. A valid catalog produces
`catalogProfileVerified: true` but keeps `ready: false`,
`exactInputAdmissionVerified: false` and `modelGenerationVerified: false`, with
reason `exact-input-count-unavailable` and exit status 2. This is partial
readiness, not a verified generation admission. November 1 diagnostics found
management metadata forbidden (403) and the provisional Responses counter
absent (404); see the [dated evidence](docs/evaluations/v2-baseten-grant-preflight-2026-11-01.json).
Do not substitute a byte estimate, silently truncate the reviewed prompt or
expand the reservation. The [coordination plan](docs/superpowers/plans/2026-10-31-proofpath-baseten-integration.md)
contains the precise provider clarification needed.

The operational steps below remain deferred until a documented input-admission
mechanism is implemented and verified. Only after that readiness gate and
review of the retained operator state,
cleanly stop the existing controlled server and verify that no job/owner is
active. Never delete a crash-left lock. The explicit migration command is:

```sh
V2_OPERATOR_DIR=runs/v2-live/operator pnpm operator:v2:migrate-shared
```

It preserves the original reviewer code, signed Meta source and consumed quota,
then publishes a verified shared v3 state and retires the legacy writer. Verify
one imported reservation, US$0.05 retained, 2 proposals left for the original
code and 49 globally before any new request. New private reviewer material is
under `runs/v2-live/operator/v3/`; do not print it. Migration recovery validates
published state rather than reimporting or resetting. Partial unpublished
staging directories are retained for operator investigation. A failed/blocked
source cannot be migrated to clear its latch. Never run either initialization
command on this existing setup or choose a fresh directory to obtain more quota.

Once readiness, migration and the concrete live-call authorization are settled:

```sh
V2_PLANNER_MODE=baseten PLANNER_MODE=fixture \
  DATA_DIR=runs/v2-live/data V2_OPERATOR_DIR=runs/v2-live/operator \
  PORT=3010 pnpm dev
```

Startup reads model metadata but never generates. Each authenticated proposal
counts the exact immutable body before reserving US$0.05 and making one request.
The UI identifies Baseten-hosted Meta, retains the explicit review/approval
boundary, and protects historical report/download access after proposal
exhaustion. Selecting `V2_PLANNER_MODE=meta` later uses the same v3 aggregate;
there is no client provider selector or fallback to another provider. Baseten
has one attempt and no retry; the existing Meta profile still permits two attempts.
Successful local setup is not proof of a live model response or deployment.

## V1 implementation and evidence

The stack is Node.js, TypeScript, pnpm, Playwright and a thin local server. Fixture mode creates canned plans and explicitly says it does not interpret text or call Meta. Meta mode uses a direct Model API adapter with strict schema validation and no fallback; live-generated add-to-cart and saved quantity plans have controlled local browser evidence. UI labels and immutable approval/report provenance identify the selected mode.

The v2 workbench has fixture and controlled Meta/Baseten backends. Baseten is
mock-verified locally; its live model compatibility remains unverified. V1
evidence is separate. Its agent-drafted [frozen holdout](docs/evaluations/v2-frozen-requirements.json)
awaits owner annotation review; annotations stay outside product planner
requests. Strict structured output was accepted by direct Meta in the one
recorded v2 live canary. No frozen-holdout reliability claim is made.

The server hashes the requirement, scenario revision, target registry, planner provenance and validated plan into a one-use ten-minute approval. A fresh browser context permits only the synthetic shop and its two assets. Runs are serialized, bounded and reported as completed, blocked, timed-out or failed. The seeded quantity revision observes 3900 cents for quantity 2 and fails; the fixed revision observes 7800 and passes. Blank checkout requires both visible errors and an active checkout state. Reports retain approval snapshots, replay, URL/time, screenshots and hashes. Missing evidence cannot produce PASS, and a known failure survives interrupted execution.

The October 26 Billing inspection showed $150 free credits, $0 balance and no payment method. On October 27 one authenticated Meta request returned a valid plan (estimated token cost US$0.003463), and the exact plan passed its controlled local browser run. Current card/credit balance was not reinspected and no billing setting changed. The initial eight-case live planning evaluation passed; broader language reliability and public deployment remain open. See [evaluation results](docs/evaluations/live-results-v1.md) and BUILD_LOG for exact evidence and limitations.

## Submission checklist

The Cerebral Valley submission requires new event-period work or prior-work disclosure, Build for Your World theme fit, material Meta model tooling, a public GitHub repository, and a narrated three-minute demo. The participant guide judges impact (30%), Meta tooling (25%), technical depth (20%), and demo quality (25%), and names a working live product as a judging artifact. The reviewed form did not present a live-product URL field. The deadline is November 5, 2026, 10:00 SGT; an X post/URL is optional for Most Viral.

## Not in the MVP

Arbitrary websites, authentication, real payments, cross-browser support, team features, self-healing selectors, automatic fixes, autonomous execution, and unproven visual comparison are out of scope. V2 supports saved reviewed regression definitions only; it does not add team accounts or a general persistent-suite service.

The event guide is the current rules reference: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details>.
