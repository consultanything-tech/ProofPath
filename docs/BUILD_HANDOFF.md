# ProofPath build handoff

**Current direction, October 31:** the checkout/order QA workbench has fixture
and guarded Meta Responses implementations. Preserve `4ace907` as the v1
fallback and `d6b345b` as the mock-budget checkpoint. The [v2 design](superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md)
and [implementation plan](superpowers/plans/2026-10-28-proofpath-checkout-qa-implementation.md)
remain the product contract.

**Baseten credential check, November 1:** the hackathon-issued key is configured,
ignored and restricted to mode 600. Inference catalog access succeeded (HTTP
200) and listed the exact hackathon model and expected prices. The management
metadata endpoint returned 403; the candidate Responses input-count endpoint
returned 404. The current preflight therefore cannot qualify the adapter's
US$0.05 admission. No generation or actual accounting migration occurred.
The diagnostic CLI now uses the inference catalog only and explicitly reports
partial readiness with exit 2; it does not produce a generation admission.
The award email documents Chat Completions with the exact suffixed model;
it does not establish grant-specific Responses compatibility. Resolve a
documented input bound before enabling live Baseten. See the
[dated evidence](evaluations/v2-baseten-grant-preflight-2026-11-01.json).

**Baseten integration continuation, October 31:** the user confirmed account and
credit readiness and requested completion. V2 transport, local schema/semantic
enforcement, provider-aware workbench and signed shared-v3 accounting are now
implemented. Unit checks passed 121/121 and the final V2 browser regression
passed 11/11 with mocked providers. The local key was absent, so actual
metadata/count compatibility and generation remained unverified at that
checkpoint. No real operator
migration or Baseten call occurred. Run the non-generating `pnpm baseten:preflight`
after local key setup; unsupported exact counting stops before generation.
Preserve the original Meta reservation and owner lock. The shared migration is
explicit, preserves quotas, and must follow clean shutdown and readiness review.
No US$5 budget was approved. See the [current readiness record](evaluations/v2-baseten-integration-readiness.md)
and [Baseten plan](superpowers/plans/2026-10-31-proofpath-baseten-integration.md).
The [offline record](evaluations/v2-baseten-offline-readiness.md) remains historical.

**Completed direct-Meta continuation:** the user-authorized restricted Responses admission,
private local operator bootstrap and one live canary are verified. The exact
counted/generated body uses `muse-spark-1.3`, at most 6,073 rendered input tokens,
4,096 output tokens and two generation attempts. A fresh signed version-2 ledger
reserves US$0.05 before generation and journals attempts, usage and durable
failure blocks. It enforces 3 proposals/code, 50 global and US$2.50 total with no
refund. The controlled bootstrap disables v1 mutation/model routes and protects
v2 reports, artifacts and saved-workbench reopening with the reviewer code.
These are local controls; managed-host ingress and persistent-volume operations
remain unverified. See [admission basis](evaluations/v2-responses-admission-basis.md)
and [live canary](evaluations/v2-live-canary.md).

The one live proposal used 1,996 rendered input tokens; provider usage was
1,853 input and 2,758 output tokens in one attempt, estimated US$0.01403775.
US$0.05 remains reserved. The model-generated suite found the seeded r2
delivery regression; saved reuse on r3 passed all three candidate cases without
another model call. The fixed suite remains INCONCLUSIVE because two accepted
coverage gaps remain. Fresh automated UI approvals used the exact saved live
receipt after review of unchanged numeric rules; no human click or uninterrupted
walkthrough is claimed. Full evidence and integrity hashes are in the canary
record. No additional live request is authorized by this handoff.

Next gates: owner review of frozen annotations, explicitly bounded holdout
evaluation, independent review, then managed-container/persistent-storage
hosting and deployment verification. The selected access/spend limits are
implemented locally; they do not authorize hosting charges. No public host,
repository visibility change, push or billing change occurred.

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
chat-authorized approval, with no new model request. Those are historical v1
results. The October 31 continuation above supersedes the earlier next-step
status: hosting path and proposal limits are selected and
locally enforced; actual managed deployment and hosted review remain open.

Basic direct-Meta live API access is verified. The prior Meta Billing check showed $150 free
credits and no payment method; current card/balance state was not reinspected. Never paste keys in chat; configure
locally in an ignored environment file. No billing changes are authorized here.
The submission requires a public GitHub repository and a three-minute narrated
demo video. Keep the repository private during active work if desired, but make
it public before submission and verify it logged out. The video is a major
judging factor: explain the project, show the live product, and demonstrate its
behavior. Review the submission form early. The owner selected managed-container
hosting with persistent storage and 3 proposals/code, 50 total, US$0.05/proposal and US$2.50 total. Hosting charges,
provider-specific operations and a public deployment still require concrete
review; the one authorized direct-Meta local canary is complete.
The optional Most Viral bonus prize requires an X post and its URL in the
submission; it is not a core product requirement.

## Sources

- [Participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
- [Kickoff announcement](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557)
- [Kickoff meeting notes](https://southern-neon-d03.notion.site/Meeting-405b81574b6780a995efc33d55856c0a)
- [PRD](PRD.md)
- [Development kit](DEVELOPMENT_KIT.md)
