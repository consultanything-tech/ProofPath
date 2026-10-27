# ProofPath build handoff

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

The quantity-proof checks now have focused validation recorded in `BUILD_LOG.md`.
The remaining checks above are still incomplete; keep recording exact verified
behavior and gaps rather than treating the list as complete.

## Open owner decisions

Payment readiness and live API access remain unverified. The prior Billing check
showed $150 free credits and no payment method. Never paste keys in chat; configure
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
