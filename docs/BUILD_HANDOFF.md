# ProofPath build handoff

**Current direction, October 28:** the user selected the checkout/order QA
workbench expansion. The [v2 design](superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md)
and [implementation plan](superpowers/plans/2026-10-28-proofpath-checkout-qa-implementation.md)
now have a local fixture implementation. This handoff records v1 decisions and
verification separately; preserve checkpoint `4ace907` as the fallback. V2 live
model, hosted reviewer access, and deployment are still unverified.

**October 30 continuation:** all six v2 capabilities have local fixture tests.
The next development gate is defensible real-input admission and production
wiring of the mock-verified proposal ledger, followed by bounded live evaluation
and reviewer hosting.
The selected managed-container/persistent-storage path and limits (3 proposals
per code, 50 total, US$0.05 reserved per proposal, US$2.50 total) remain planning
targets for the production path. The local mock-only service now enforces them;
the separate 50-browser-job limit does not. See the
[cost assessment](evaluations/v2-cost-readiness.md) and
[fixture readiness record](evaluations/v2-fixture-readiness.json).

The local mock-only proposal ledger now durably reserves the whole US$0.05
before each mocked dispatch and retains it on failure or restart. It requires
an allowlisted code digest and a test-only accounting certificate. Real input
accounting, code issuance, managed-host wiring, recovery of stale locks and
protection of the separate V1 model route remain open.

Prepared October 26, 2026, Asia/Singapore. Updated October 27 after reviewing the kickoff notes and transcript.

## Decisions and start gate

The user approved Playwright as the sole runtime dependency, plus TypeScript
and `@types/node` for development. Use pnpm and Node 26; no framework, SDK,
database or extra package is authorized by this decision.

The user initially selected **Prepare now; wait for confirmed start**. The
October 27 kickoff transcript subsequently stated that the 10-day hacking period
starts after kickoff. The transcript reaches the closing “happy hacking” at
about 00:23 SGT on October 27; functional work may start after that point.
Record this as the coding boundary in BUILD_LOG. Do not treat planning documents
or setup work as functional implementation. Clearly identify the first
functional commit and disclose the pre-event planning/docs in the submission.

The existing filesystem project is `/opt/homebrew/var/www/ProofPath` (Git main,
no initial commit or remote at preparation time). Add that folder manually to
Codex Projects if desired; no supported project-creation tool is available here.

## First implementation sequence

Use the reviewed development kit as the implementation contract. Delegate to
one implementer after the start gate clears, then validate before reporting.

1. Create the smallest Node/TypeScript server, package scripts and static UI/shop.
   Install only the approved packages and Chromium. Use native Node HTTP, fetch,
   crypto, filesystem and node:test. Avoid a build pipeline unless necessary.
2. Implement strict plan validation, server-owned scenario criteria, immutable
   approval snapshots, expiry and one-use run authorization. Model output must
   not contain the fixture revision or original requirement envelope.
3. Build add-to-cart end to end: explicit fixture planner, review, approval,
   isolated browser run, deterministic observations, screenshots and manifest.
4. Add seeded/fixed quantity and required-field journeys using the same pipeline.
   Require a fresh approval for each revision. Render a clear fixture-mode label.
5. Implement the direct Meta adapter after billing/key readiness and verify one
   real eligible-model response. Never silently substitute a fixture on failure.

The fixture slice may proceed after the confirmed coding start even if live
credentials are not ready. It proves local mechanics only. Live Meta remains a
separate completion gate for the product and hackathon submission.

## Scope and validation

Implementation reaches package/config files, server routes, contracts/scenarios,
planner, plan store, runner/verdict/evidence, public UI/shop, fixture data and tests.
Preserve the existing docs and ignore secrets, dependencies and generated runs.
No existing product data or application callers exist to migrate.

Required checks:

- Contract rejection: unknown keys/actions, invalid IDs or values, zero assertions,
  wrong scenario, missing coverage and invalid clarification union.
- Approval: absent, expired, consumed, modified or revision-changed snapshots reject
  before creating a run directory; valid approval works once.
- Server and runner: Host/Origin/body/path protections; block external resources,
  redirected destinations, popups, downloads, WebSockets and service workers.
- Verdict: known false plus missing evidence is FAIL; missing only is INCONCLUSIVE;
  incomplete/blocked runs never PASS. Preserve a manifest after any launched run.
- Journeys: one lamp gives quantity 1 / 3900; seeded quantity 2 / 3900 fails;
  fixed quantity 2 / 7800 passes; blank checkout shows both errors and stays put.
- Reliability: three seeded failures and three fixed passes with evidence hashes.
- Browser: keyboard approval flow, visible focus/status/errors, correct screenshot
  links and agreement between the rendered report and stored manifest.

Live language evaluation is six unseen paraphrases, one ambiguous and one
unsupported request. Canned fixture success cannot satisfy this check.

All three fixture journeys now have local browser evidence recorded in
`BUILD_LOG.md`, including blank-field validation, keyboard approval/run controls,
and screenshot/manifest hash checks. Incomplete execution cannot aggregate to
PASS, while known failures still dominate. The core loopback safety matrix and
approval expiry/tamper checks are now recorded below in `BUILD_LOG.md`.
Asynchronous UI races, broader browser edge cases and live language evaluation
remain incomplete; keep recording exact verified behavior and gaps.

## Open owner decisions

The direct Meta planner adapter has offline tests plus one successful real
`muse-spark-1.3` add-to-cart response on October 27. The user authorized a smoke
test up to US$1; one request, no retry, used 1160 tokens at an estimated
US$0.003463 token cost. The exact returned envelope was reconstructed with an
identical digest and run after the user authorized continuation in chat. Both
browser assertions passed; no UI approval click is claimed. This proves basic
live access and one local model-plan execution, not full language evaluation.
The local app is configured for Meta mode. A subsequent separately authorized
eight-case live planning evaluation met all declared expectations: six valid
plans and two appropriate clarifications, with no browser execution. See
`evaluations/live-results-v1.md`. On October 28, the same saved quantity plan
completed seeded FAIL and fixed PASS with separate chat-authorized approvals
and no new model call; see `evaluations/saved-quantity-runs-v1.md`. Readable
plan/report UI, per-action evidence and saved-report reopening were verified
locally in fixture mode on October 28. The saved Meta required-fields plan then
completed all four actions and both assertions passed under a fresh
chat-authorized approval, with no new model request. Next: select hosting and
numerical access/spend limits, then verify a fresh live-proposal UI approval
during the bounded hosted smoke.
Deployment/public execution budgets remain undecided.

Basic live API access is verified. The prior Billing check showed $150 free
credits and no payment method; current card/balance state was not reinspected. Never paste keys in chat; configure
locally in an ignored environment file. No billing changes are authorized here.
The submission requires a public GitHub repository and a three-minute narrated
demo video. Keep the repository private during active work if desired, but make
it public before submission and verify it logged out. The video is a major
judging factor: explain the project, show the live product, and demonstrate its
behavior. Review the submission form early. Hosting and live spending/rate
limits still need owner decisions before any public deployment or live runs.
The optional Most Viral bonus prize requires an X post and its URL in the
submission; it is not a core product requirement.

## Sources

- [Participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
- [Kickoff announcement](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557)
- [Kickoff meeting notes](https://southern-neon-d03.notion.site/Meeting-405b81574b6780a995efc33d55856c0a)
- [PRD](PRD.md)
- [Development kit](DEVELOPMENT_KIT.md)
