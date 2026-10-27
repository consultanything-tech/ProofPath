# ProofPath

ProofPath turns a plain-language browser journey into an approved run and an evidence-linked verdict.

## Hackathon scope

- Event: Meta Global AI Developer Hackathon
- Track: Indie Developer — Build for Your World
- Participation: accepted and solo; acceptance was confirmed in the setup conversation on 26 October 2026.
- Status: all fixture journeys and core local safety checks are implemented. One live-generated add-to-cart browser run passed, and eight fixed live planning cases met their declared expectations (six plans, two clarifications). The same saved Meta quantity plan produced seeded FAIL and fixed PASS with separate chat-authorized approvals and no new model requests; see [browser evidence](docs/evaluations/saved-quantity-runs-v1.md). Broader reliability and deployment remain open.

The planned demo is deliberately narrow:

1. A participant describes a checkout journey.
2. A Meta model proposes a constrained action and assertion plan.
3. A human reviews and approves the plan.
4. Playwright runs the approved plan only on the controlled demo origin.
5. ProofPath reports cited `PASS`, `FAIL`, or `INCONCLUSIVE` findings.
6. A developer fixes the seeded defect and the same journey is rerun.

`PASS` and `FAIL` come from deterministic assertions. The model may explain linked browser evidence but cannot override a verdict. Missing or conflicting evidence is `INCONCLUSIVE`.

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

For a future live test, copy `.env.example` to the ignored `.env` and configure
the key locally; `pnpm dev` loads that optional file. Meta mode requires
`PLANNER_MODE=meta` and `MODEL_API_KEY`. Missing/invalid mode or a missing key
fails startup. Keep fixture mode selected until account readiness and a live
test spending boundary are confirmed. Never put keys in chat or commit them.
There is no startup/background model call. Propose plan in Meta mode sends the
synthetic requirement and public scenario facts to Meta; a clarification creates
no approvable plan, and provider errors never substitute a fixture.

## Implementation

The stack is Node.js, TypeScript, pnpm, Playwright and a thin local server. Fixture mode creates canned plans and explicitly says it does not interpret text or call Meta. Meta mode uses a direct Model API adapter with strict schema validation and no fallback; live-generated add-to-cart and saved quantity plans have controlled local browser evidence. UI labels and immutable approval/report provenance identify the selected mode.

The server hashes the requirement, scenario revision, target registry, planner provenance and validated plan into a one-use ten-minute approval. A fresh browser context permits only the synthetic shop and its two assets. Runs are serialized, bounded and reported as completed, blocked, timed-out or failed. The seeded quantity revision observes 3900 cents for quantity 2 and fails; the fixed revision observes 7800 and passes. Blank checkout requires both visible errors and an active checkout state. Reports retain approval snapshots, replay, URL/time, screenshots and hashes. Missing evidence cannot produce PASS, and a known failure survives interrupted execution.

The October 26 Billing inspection showed $150 free credits, $0 balance and no payment method. On October 27 one authenticated Meta request returned a valid plan (estimated token cost US$0.003463), and the exact plan passed its controlled local browser run. Current card/credit balance was not reinspected and no billing setting changed. The initial eight-case live planning evaluation passed; broader language reliability and public deployment remain open. See [evaluation results](docs/evaluations/live-results-v1.md) and BUILD_LOG for exact evidence and limitations.

## Submission checklist

The Cerebral Valley submission requires new event-period work or prior-work disclosure, Build for Your World theme fit, material Meta model tooling, a public GitHub repository, and a narrated three-minute demo. The participant guide judges impact (30%), Meta tooling (25%), technical depth (20%), and demo quality (25%), and names a working live product as a judging artifact. The reviewed form did not present a live-product URL field. The deadline is November 5, 2026, 10:00 SGT; an X post/URL is optional for Most Viral.

## Not in the MVP

Arbitrary websites, authentication, real payments, cross-browser support, team features, persistent suites, self-healing selectors, automatic fixes, autonomous execution, and unproven visual comparison are out of scope.

The event guide is the current rules reference: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details>.
