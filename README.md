# ProofPath

ProofPath turns a plain-language browser journey into an approved run and an evidence-linked verdict.

## Hackathon scope

- Event: Meta Global AI Developer Hackathon
- Track: Indie Developer — Build for Your World
- Participation: accepted and solo; acceptance was confirmed in the setup conversation on 26 October 2026.
- Status: fixture-backed add-to-cart, seeded/fixed quantity, and blank-required-fields slices are implemented after the October 27 kickoff boundary. Local browser evidence shows the seeded quantity defect failing and the fixed revision passing; live Meta integration remains unverified.

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

## Candidate implementation

The current stack is Node.js, TypeScript, pnpm, Playwright, and a thin local server. Fixture mode creates server-owned add-to-cart, quantity-update, or required-fields plans; the UI states that it does not interpret text or call Meta. Every screen labels it **Fixture planner — Meta not used**. The server hashes the requirement, scenario revision, target registry, fixture provenance, and validated plan into a one-use ten-minute approval, then uses Playwright only against the local synthetic shop. The seeded quantity revision deliberately reports 3900 cents for quantity 2 and must `FAIL`; the fixed revision reports 7800 and must `PASS`. The required-fields plan continues with two blank synthetic fields, checks both visible errors and that checkout stayed active, and has no payment action. Reports retain the complete approval envelope, screenshots, per-assertion URL and timestamp, screenshot SHA-256 values, replay steps, and a hashed manifest. Live Meta integration remains unverified. Meta Billing was inspected on 26 October 2026: $150 free credits in use and $0 balance are verified. No payment method is on file. Live Meta API integration remains a separate gate.

## Submission checklist

The Cerebral Valley submission requires new event-period work or prior-work disclosure, Build for Your World theme fit, material Meta model tooling, a public GitHub repository, and a narrated three-minute demo. The participant guide judges impact (30%), Meta tooling (25%), technical depth (20%), and demo quality (25%), and names a working live product as a judging artifact. The reviewed form did not present a live-product URL field. The deadline is November 5, 2026, 10:00 SGT; an X post/URL is optional for Most Viral.

## Not in the MVP

Arbitrary websites, authentication, real payments, cross-browser support, team features, persistent suites, self-healing selectors, automatic fixes, autonomous execution, and unproven visual comparison are out of scope.

The event guide is the current rules reference: <https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details>.
