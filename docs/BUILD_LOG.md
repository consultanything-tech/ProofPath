# ProofPath build log

Every later product claim should point to a commit or a preserved run artifact. This log records preparation separately from functional work.

| SGT date | Commit | Change | Meta model/API evidence | Validation | Limitations |
| --- | --- | --- | --- | --- | --- |
| 2026-10-26 | Not created | Documentation-only project base: scope, journeys, boundaries, and acceptance checks. | None. | Manual review of the written plan. | No functional code, model call, credentials, dependency, deployment, or public repository exists yet. |
| 2026-10-26 | Not created | Added nine calendar work blocks, kickoff reminder and deadline marker; aligned submission target to November 4 at 5 PM SGT. | None. | Read back all 11 calendar events; checked their times and reminders. Kickoff time verified from the Discord announcement. | Planning only; runtime, model access and credit redemption remain unverified. |

| 2026-10-26 | Not created | Drafted PRD and development kit; refreshed current setup status. | Official quickstart and structured-output docs inspected; no API call made. | Read signed-in Meta Billing: $150 free credits in use, $0 balance, no payment method on file. Read current participant guide; reviewed document consistency. | Documentation only. Payment-method readiness, live API access, precise permitted build start, deployment and evaluation remain open. |
| 2026-10-27 | Uncommitted local work | Implemented the fixture-backed add-to-cart slice: strict contract validation, ten-minute one-use approval, local-only server, controlled Playwright runner, deterministic verdict, synthetic shop, and review/report UI. | None. UI and API identify the fixture planner and explicitly say Meta was not used. | `pnpm typecheck` passed; `pnpm test` passed 4/4; local `GET /shop.html` returned 200; propose and approve routes worked. Manual browser run `593d8efc-f914-46c3-8523-e2063ae7ef11` returned `PASS` for quantity 1 and 3900 cents. Manifest exposes replay, per-assertion URL/time, screenshot digests matching both stored PNGs, and a manifest digest. Unlisted screenshot request returned 404. | One add-to-cart fixture run only. Quantity/required-field journeys, safety redirect matrix, repeated reliability runs, live Meta API, public repository, deployment, and logged-out review remain unverified. |
| 2026-10-27 | Uncommitted local work | Added server-owned quantity-update scenarios and seeded/fixed fixture revisions. Approval digest now covers the requirement, scenario/revision, contract/target registry, fixture provenance, and validated plan. | None. Fixture provenance remains explicit; no Meta call was made. | `pnpm typecheck` passed; `pnpm test` passed 4/4. Local Playwright run `647a6e8b-3730-46c0-a50c-2465a3f2e66b` observed quantity `2` and 3900 cents on `seeded-bug`, yielding `FAIL`; run `e3b9fe1f-2be8-40b7-9a20-ca38b1126284` observed quantity `2` and 7800 cents on `fixed`, yielding `PASS`. Each has an evidence manifest with the approved envelope and screenshot hashes. | One run per revision only. Required-field journey, redirect/popup/download/WebSocket safety matrix, three-run reliability proof, live Meta, public repository, deployment, and logged-out review remain unverified. |
| 2026-10-27 | Uncommitted local work | Corrected total observation to parse the visible `#cart-total` currency text, added strict malformed-value handling, and preserved any completed assertion result if a later capture fails. | None. Fixture provenance remains explicit; no Meta call was made. | `pnpm typecheck` passed; `pnpm test` passed 5/5. Fresh local Playwright run `b6020460-6289-44b8-9f59-1535bff89d82` observed quantity `2` and visible total 3900 cents on `seeded-bug`, yielding `FAIL`; run `830ed658-59e9-4d49-8df8-dad35632814d` observed quantity `2` and visible total 7800 cents on `fixed`, yielding `PASS`. Their approval digests differ and each manifest records screenshot hashes. | One run per revision only. Required-field journey, redirect/popup/download/WebSocket safety matrix, three-run reliability proof, live Meta, public repository, deployment, and logged-out review remain unverified. |
| 2026-10-27 | Uncommitted local work | Cleared the displayed approval and report when the requirement, journey, or revision changes; ignored stale responses from earlier inputs. | None. | `node --check public/app.js` passed. In a local browser, changing either the revision or requirement after approval hid the old run button and required a new proposal and approval. | Full keyboard and asynchronous race testing remain open. |
| 2026-10-27 | Uncommitted local work | Repeated the seeded and fixed quantity journeys using fresh plans and approvals. | None. Fixture mode only. | Three seeded runs returned `FAIL` with quantity 2 and 3900 cents: `c408d3e3-1711-40f7-a4aa-01dbc923a63c`, `764de95a-9504-4704-8ac5-5df1966e3b80`, `8f914f96-fc87-4674-b084-9aad7d5375da`. Three fixed runs returned `PASS` with quantity 2 and 7800 cents: `d1b3a4c2-df0e-4df2-9cef-2db758a2292e`, `c92ce122-7778-4871-a643-8fbbf07b7dfc`, `14f33b09-fcab-489c-96d5-8a0521c45742`. Every screenshot and manifest digest matched its file. | Synthetic localhost fixture only; required-field journey, full safety matrix, live Meta, public repository, deployment, and logged-out review remain open. |

## Required checkout fields — October 27, 2026

Implemented the third fixture journey using registry version 2: open the shop,
add the lamp, open checkout, and continue with blank email and postal-code
fields. The validator permits only that ordered workflow and both server-owned
boolean assertions. Missing or duplicate markers are inconclusive; present but
hidden errors are false. Incomplete execution cannot aggregate to PASS, while
a known failed assertion still yields FAIL. No dependencies were added.

`pnpm typecheck` and `pnpm test` passed (7/7 focused tests). Parent validation
also passed JavaScript syntax and diff checks. Fresh approved browser/API runs:

| Scenario | Observed | Verdict | Run ID |
| --- | --- | --- | --- |
| Blank required fields | Both errors visible; checkout active; no confirmation | PASS | `9ae3fc08-59cf-4b92-9167-2ea16c174dc0` |
| Add to cart | Quantity 1; 3900 cents | PASS | `951f1308-548d-4e49-bfe2-fde9e41df731` |
| Seeded quantity defect | Quantity 2; 3900 cents | FAIL | `b5f835d8-2bde-457a-99a7-df86f9ada56b` |
| Fixed quantity | Quantity 2; 7800 cents | PASS | `b22e46a8-796b-4966-afec-b89cbe5855dd` |

Every assertion had the approved local URL, timestamp, PNG screenshot and
matching screenshot hash. Manifest sidecars matched the stored manifest bytes;
served manifests and screenshots matched the files. Unapproved/reused runs and
an unsupported required-fields revision were rejected; unlisted evidence was
not served. Generated runs remain local and ignored by Git.

Browser review used Tab and Enter through proposal, approval and execution; the
UI displayed PASS with both boolean observations true in run
`e496f404-a9c8-4de2-88b7-6057b7e7c33e`. Changing the journey or requirement hid
the prior approval/run/report controls. Visual inspection confirmed both blank
field errors and active checkout. Synthetic form checks verified linked required
field errors, one-field correction, advancement with both fields filled, and
cleared inputs/confirmation when reopening checkout. No payment was attempted.

This proves controlled local fixture behavior only. Live Meta use, unseen-language
evaluation, approval expiry/tamper, asynchronous UI races, the full egress/safety
matrix, deployment and public reviewer/submission checks remain open. Local
fixture preview is served at `http://127.0.0.1:3000/` during this development
session; it is not a deployment.

## Browser/server safety gate — October 27, 2026

Added exact Host validation for every route, same-origin JSON media/body checks,
empty approve/run request bodies, and a single run slot acquired before approval
consumption. Each fresh context permits only its main page's approved document,
`shop.js` and `styles.css` GET requests. Redirects are fetched with zero follow
and blocked before fulfilling; other routes/frames/methods/types are rejected.
WebSockets never connect, popups are closed, downloads cancelled and service
workers suppressed by browser policy. Actual page URLs are checked throughout.
Per-action limits are 10 seconds and the run deadline is 90 seconds; internal
short limits are available only to tests. Reports expose completed, blocked,
timed-out or failed execution separately from the deterministic verdict.

Completed observations survive interruption and cleanup errors. Hidden,
duplicate or malformed cart observations are inconclusive; unsafe integers are
rejected. Missing screenshot files cannot leave an assertion/report at PASS.
Approval expires at the exact ten-minute boundary; a corrupted stored envelope
is rejected. No dependency or live model/API use was introduced.

Validation: TypeScript checks passed; the final default suite passed 15/15 and
the opt-in `pnpm test:safety` suite passed 10/10 with Chromium and temporary
loopback servers. The safety suite preserved local manifests and verified their
sidecar hashes. Representative run IDs:

| Case | Execution / verdict | Local run ID |
| --- | --- | --- |
| Normal controlled page | completed / PASS | `cc9ff0e1-6480-486f-826a-db7b0f3d30d7` |
| Same-origin escaped resource | blocked / INCONCLUSIVE; zero escaped hits | `88dca262-5986-46cb-b540-f85dd545e661` |
| Same-origin redirect | blocked / INCONCLUSIVE; zero destination hits | `5c1edfb4-ea6f-42e9-bb03-5f62defe6261` |
| Cross-origin redirect | blocked / INCONCLUSIVE; zero decoy connections | `b73348e5-5596-4640-96e6-e125753da080` |
| Popup / data-URL download | blocked / INCONCLUSIVE | `ecc11b48-110a-4019-ba9a-034d4f9b4ead` / `8585bca6-1bac-4ea7-80c8-7e539ed4474a` |
| WebSocket | blocked / INCONCLUSIVE; zero decoy connections | `b66afc04-12ab-4901-bbe7-46c02f6cb0dc` |
| Post-click hash navigation | blocked / INCONCLUSIVE | `e9ee88a1-db9d-4a52-8562-493df92ddf49` |
| In-flight request deadline | timed-out / INCONCLUSIVE | `6bb3b411-74ca-422f-9c54-10a4df49f432` |

Service-worker registration fetched no worker script in run
`4a0bd47e-ad10-414d-b702-3a19c125cf71`. Browser policy suppressed the registration;
no separate runner blocked event is claimed for that case.

The rebuilt real app rejected wrong Host on static/API/manifest routes, wrong
Origin, invalid media and oversized JSON. An unapproved request created no run
directory. Two overlapping approvals produced one run and one busy rejection;
the rejected approval remained usable and then worked once (`7641336b-e1a8-42bb-b574-32ec9f5fbec6`
and `5cccb370-6d2e-498a-b73f-2ade8d27ec44`). Fresh normal regressions returned
required-fields PASS (`b406560d-1e90-46ac-9817-cf4f5d875d54`), cart PASS
(`599d5474-5bf3-4550-afd0-f5ded42e0336`), seeded quantity FAIL
(`f12597a6-6ee1-49b9-bc70-8649c9c454a8`) and fixed quantity PASS
(`c7cd7fc3-d567-443e-b9d0-d8c18fc0228d`); screenshot and manifest hashes matched.

This is a core local safety matrix, not proof against every browser edge case.
Cleanup-failure injection, broader asynchronous races, live Meta behavior and
deployed/public reviewer checks remain open. The delegated implementation agent
hit a workspace credit limit during this gate; the primary agent completed the
remaining implementation, test fixes and verification.

## Direct Meta planner adapter, offline verification — October 27, 2026

Implemented an explicit fixture/meta planner selection, direct native-fetch
Chat Completions adapter, frozen strict schema and immutable mode/provider/model
provenance. Missing mode or missing Meta key fails startup. The optional ignored
`.env` is loaded by `pnpm dev`; no real environment file/key was created or read.
The endpoint and model are fixed server-side to Meta Model API and
`muse-spark-1.3`, with 4096 completion tokens, low reasoning, a 30-second total
deadline, 64 KiB response cap and at most one transient retry. HTTP redirects
are disabled. Raw provider errors/bodies and credentials are never returned.

Only the synthetic requirement and public scenario facts enter the prompt;
seeded/fixed versions yield identical requests for the same prose. No server-owned
revision, defect, expected verdict or approval envelope is appended. Returned model identity,
finish state, refusal/tool responses and local contract/scenario constraints are
checked before saving a plan. Clarification has no plan ID or approval. Meta
errors cannot substitute a fixture. UI configuration/report labels reflect the
actual startup mode; repeated proposal clicks are disabled while planning.
Approval JSON now wraps within the preview panel without horizontal overflow.

Validation: 24/24 default tests passed, including fake transport and HTTP tests
for plan/clarification, wrong models/schema/scenarios, auth/payment failures,
retry bounds, abort/deadline, oversized/unreadable bodies, no secret echo and
provenance-bound approval hashes. TypeScript build and JavaScript syntax checks
passed. The unchanged browser boundary also passed the 10/10 local safety suite
after the planner module was connected, including persisted blocked and timed-out
manifests (`01274283-c02d-47c4-abac-733b3a9822d6` cross-origin redirect and
`d0fe879d-bb5e-4153-b87f-cb70a45e1f7a` in-flight timeout).

Fixture-mode app smoke checks passed Host/Origin/media/body protections,
unapproved/no-artifact rejection and overlapping-run approval reuse
(`eb955cbb-da58-4e9b-901f-d1b24eb2d94f`, `f2970805-c6b8-4daf-85f0-3ce1937f67a6`).
Fresh journeys, with screenshot and manifest hashes checked:

| Scenario | Verdict | Local run ID |
| --- | --- | --- |
| Required fields | PASS | `27067b08-7c7d-45b8-ad21-cf7aa1b4e456` |
| Add to cart | PASS | `d39941f6-dd8c-4553-b4c4-a4146a79e425` |
| Seeded quantity | FAIL | `2aaf7031-bf0f-465f-93b4-25feb215527d` |
| Fixed quantity | PASS | `394a4b35-04f8-48f2-ae29-cfa325517958` |

The final browser preview displayed PASS, completed execution and explicit
fixture provenance with both checkout assertions true in run
`86dc9ec3-9b8b-4588-92f2-f66116388054`. The approval panel fit its 636-pixel
viewport with no horizontal overflow.
An isolated synthetic clarification server also exercised the real UI: the
question was displayed and both approval and run controls stayed hidden. That
temporary server used no model transport and was stopped after the check.

No live Meta request was made and no Meta credit, card/billing setting, public
deployment or publication was used. Mock responses prove adapter mechanics,
not live eligible-model use or natural-language quality. The next gate requires
the owner to configure the ignored local key, confirm account readiness and
authorize a smoke-test spending boundary. Six unseen paraphrases plus ambiguous
and unsupported requests, deployment and final submission artifacts remain open.

Sources refreshed October 27: [Meta Quickstart](https://dev.meta.ai/docs/quickstart),
[Structured output](https://dev.meta.ai/docs/structured-output) and
[Chat Completions parameters](https://dev.meta.ai/docs/protocols/chat-completions).

## First real Meta smoke and approved local execution — October 27, 2026

The user configured the key in ignored `.env`, authorized up to US$1 for one
synthetic smoke test with at most one transient retry, then instructed
"continue" after the validated plan was returned. The key was never displayed,
logged or committed. No billing setting or payment detail was changed.

At 17:31:41 SGT the adapter sent the synthetic add-to-cart requirement to
`https://api.meta.ai/v1/chat/completions`. One attempt returned HTTP 200,
`model=muse-spark-1.3`, `finish_reason=stop`, with 489 prompt and 671 completion
tokens (1160 total). The response passed the production schema, scenario and
server-owned criterion checks. No retry or fixture substitution occurred.

Published standard rates were refreshed from
[Meta pricing](https://dev.meta.ai/docs/pricing-rate-limits): US$1.25/M input and
US$4.25/M output tokens. The conservative preflight estimate for two maximum
attempts was US$0.043506. Actual returned usage implies an estimated token cost
of US$0.003463 before any cache discount; invoice/credit deductions were not
inspected. This is an estimate, not an asserted billed amount or hard account cap.

The sanitized request/usage/result evidence and its SHA-256 sidecar are in
`runs/meta-smoke-9289317a-6a32-4e4e-b35b-60093a12c329/`. They contain no key,
authorization header or raw error body. The proposed envelope digest was
`sha256:550b226302f6ef23948cf709be3e6e592589f59c859b6981caaf2c034ed31428`.

After chat authorization to continue, the exact validated candidate was
reconstructed and its envelope digest checked against that saved proposal.
Approval was recorded programmatically for the controlled smoke run. No human
UI click or approval in the running app's in-memory store is claimed. Local run
`96568392-a714-43e6-9bfd-b74fa51cf51f` completed with PASS: `assert-qty`
observed `1`, and `assert-total` observed `3900` cents. Screenshot and manifest
sidecar hashes matched their files, and a second consumption was rejected.
`approval-source.json` in the run directory links the source smoke hash and chat
authorization. The browser execution made zero additional model requests.

Local `.env` now selects Meta mode; the restarted loopback app reports the
correct mode/provider/model. A UI refresh showed "Meta Model API —
muse-spark-1.3" without proposing another plan. The app does not call Meta at
startup; a future Propose action in this mode is a live model request.

This clears basic live authentication/model access and one structured-plan to
local-browser execution path. It does not verify other live journeys, six unseen
paraphrases, ambiguous/unsupported natural-language behavior, the UI approval
path with a live proposal, deployment or organizer evaluation. Current card and
credit-balance state were not reinspected. No source code changed for this
smoke; existing unit suites were not rerun. All generated evidence remains
ignored by Git.

## Eight-case live planning evaluation — October 27, 2026, 19:53 SGT

The user authorized the recommended eight-case evaluation with a new US$1 total
cap. Cases and expected outcomes were committed as `87aa53e` before any request
in `docs/evaluations/live-cases-v1.json`. Six supported paraphrases (two per
journey), one explicitly ambiguous request and one unsupported external
sign-in/payment request were submitted through the unchanged production adapter.
No prompt tuning, semantic retry or case removal occurred.

All eight requests returned HTTP 200 from `muse-spark-1.3`, one attempt each.
The six supported responses passed local schema/scenario/coverage checks and
analytical action-sequence review. The ambiguous response explicitly asked
whether quantity should be 1 or 2. The unsupported response excluded external
sign-in/payment, offered the supported synthetic alternative, and requested no
credentials/payment details. Primary-agent semantic review found all eight met
their predeclared expectations. This review is not a user approval.

Usage totaled 9,775 tokens. Estimated token cost at the refreshed published
standard rates was US$0.02960075 before cache discounts; no invoice/credit
deduction was inspected. Conservative preflight maximum for 16 potential
attempts was US$0.349383; actual request count was 8 with zero retries.
Observed planning latency: median 3.0335 seconds, range 2.009–4.457 seconds.

Local ignored evidence is in
`runs/live-evaluation-65d12830-06a6-4e45-b28d-25c752e2d019/`. Results, usage,
request hashes, planner source/runtime hashes and semantic review were preserved
with verified SHA-256 sidecars. Case-file hash:
`e6b033ebe2db70cf8d50ecf80b89126f381b61e83b86b2c47d3c378e0bc8e70d`.
Results hash:
`735e0eb6ac74c3eadaacef8918941ea958adae22a3dbeeae942dc0fd5eb73978`.
No secret, authorization header or raw provider error was recorded.

No approvals or browser executions were made in this batch. A planning pass
does not imply a browser PASS. Selected scenarios and server-owned criteria
were supplied; each case was sampled once, so 8/8 is a narrow demo result,
not an independent benchmark or a general reliability estimate. No production
code changed, and previously passing unit/browser suites were not rerun.
The next milestone is approved seeded/fixed execution of a returned quantity
plan; saved outputs can be reused without another model request.

Full report: [Live evaluation v1](evaluations/live-results-v1.md).

## Saved Meta quantity plan: seeded/fixed browser pair — October 28, 2026

Reused the exact validated `quantity-a` response and original requirement from
the eight-case batch. The source results sidecar, case-file hash and planner
source/runtime hashes matched before execution. A temporary fixture-mode server
served the synthetic checkout on `127.0.0.1:3001`; no planner was called, no
environment file changed, and no additional API spend occurred.

Fresh separate approvals were recorded programmatically under the user's chat
instruction to proceed to this next step. The seeded envelope reproduced the
original evaluation digest; the fixed revision produced a different digest.
Consumption before approval and reuse after consumption were rejected for both.
No human UI approval click is claimed.

- Seeded run `693b4ad3-1a2c-45b5-aa0f-0a57cfae0778`: completed, quantity 2,
  total 3900 cents versus expected 7800, overall **FAIL**.
- Fixed run `37668def-4602-49b9-a7be-f951f54748fd`: completed, quantity 2,
  total 7800 cents, overall **PASS**.

Both used identical actions, assertions, requirement and Meta provenance.
The existing fixture revision was selected; no application repair was made.
Screenshot/manifest hashes, exact observed URLs and comparison sidecar were
verified, and both screenshots were visually reviewed. Comparison evidence:
`runs/saved-quantity-pair-e56f453f-7592-49ab-af15-337dbf66b506/`.
Per-run approval-source records link the source evaluation and chat approval.

Initial restricted-shell run `1b3754b7-67b7-4d3b-9798-44a68211aad9` failed to
launch Chromium because macOS denied Mach-port registration; it remains an
INCONCLUSIVE report with no observations/screenshots. The harness stopped on
its missing-screenshot check. The successful pair used browser launch permission
and fresh approvals. The temporary server was stopped after verification.

No production code changed, so prior passing unit/browser safety suites were
not repeated. This pair adds local execution evidence for one saved Meta plan;
it does not establish broad reliability, UI approval of a live proposal or
deployment readiness. Next: readable plan/report UI, retaining exact snapshots
and evidence links. Full report:
[Saved quantity browser runs v1](evaluations/saved-quantity-runs-v1.md).

## Start boundary confirmed — October 27, 2026, approximately 00:23 SGT

The kickoff transcript says the 10-day hacking period starts after kickoff and
ends with the host’s closing “happy hacking” at approximately 00:23 SGT. This
clears the user’s earlier wait-for-start gate. The pre-event repository contains
planning documentation only; identify the first functional code commit as new
hackathon work and disclose any pre-existing work used in the submission. The
submission must include a public GitHub repository and a three-minute narrated
demo video. Review the submission form early. The Most Viral X post is optional.
Source: [kickoff notes and transcript](https://southern-neon-d03.notion.site/Meeting-405b81574b6780a995efc33d55856c0a).

## Preparation decision — October 26, 2026

The user approved Playwright, TypeScript and Node typings and selected preparation
only until the permitted build start is confirmed. Recorded the implementation
handoff and clarified server-owned revision/requirement, explicit fixture
provenance, stored-plan-only approval and required-field observation semantics.
No packages/browser binaries were installed and no functional code, API call,
public repository, deployment or commit was created during preparation. Runtime
checks remain not run.

## Prior-work declaration

TestForgeAI is background experience only. The current base has no reused implementation. Any later reuse must be owned or permitted, disclosed, and identified separately from work completed during this event.

## Local Git checkpoint — October 27, 2026

Created the first local checkpoint after the fixture-backed implementation and
validation recorded above. This checkpoint includes pre-event planning documents
and post-kickoff functional code; its commit timestamp does not establish when
each file was originally authored. No remote or public repository was created.
Confirmed that environment files, dependencies, compiled output and generated
run evidence are ignored. A scan of the 28 candidate files found no matches for
the common credential patterns checked; this is a limited check, not a guarantee
that the repository is ready for publication. No application code changed and
the previously recorded tests were not rerun for this Git-only setup.
