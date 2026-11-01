# ProofPath build log

Every later product claim should point to a commit or a preserved run artifact. This log records preparation separately from functional work.

## Hosted container packaging and local validation — November 1–2, 2026

Implemented the user-approved packaging/hardening slice with delegated planning
and runtime/container implementation. Primary review completed the remaining
fixes after a Codex subagent hit its workspace credit limit. No Meta/Baseten
credits were involved in that limit or these tests.

Added separate public HTTPS-origin handling and target-only loopback serving,
existing-state/write-fsync/recovery readiness gates, realpath-contained operator
storage, fixture/live data profile separation, one inspection/proposal gate,
and shutdown drain before fixture/operator teardown. Hosted legacy V1 and public
target routes are disabled. Fixed the new fixture CSP to permit its own module
scripts and added actual cart/coupon interaction coverage. Browser allowlists,
approval authority and all numerical model limits remain unchanged.

Added a non-root Node 26 container with pinned pnpm and lockfile-matched
Chromium, restricted build context, health check and a private-repository Linux
validation workflow. No production npm dependency was added. The user confirmed
there is no local Docker runtime; the image build remains a separate CI gate.

Local build and clean-selected-slice typecheck passed without the six unchanged
V1 scaffold code/test files owned by another chat. Full unit tests passed
133/133, followed by a new corrupt/unwritable-state check. Existing safety/UI
browser checks passed 22/22; the two new hosted journeys passed on their focused
runs, including a mocked authenticated proposal, exact approval, seeded FAIL,
internal browser execution and protected report/quota reopening after restart.
Initial new-test failures were corrected test inputs (V1 versus V2 price, and
the reference-policy title versus an actual supported requirement); no runtime
policy was relaxed. Unit results include two unchanged sibling V1 scaffold
tests, which are not part of this commit.

A limited configured-key/common-credential-pattern scan found no matches in
the selected files or 226 unpublished-history blobs. This is not comprehensive
publication clearance. No real model call, actual operator migration, billing
change, public repository visibility or paid hosting action occurred. The
[deployment runbook](DEPLOYMENT.md) records persistent-state cutover and the
remaining managed-host gates. CI image verification is pending this checkpoint.

## Baseten email Chat Completions smoke — November 1, 2026

The user explicitly requested the email flow after protocol differences were
explained. A narrow planner review and isolated implementer produced a one-use
ignored operator runner, followed by primary review and a fixed-body dry run.
Offline mocks exercised success, duplicate refusal, cap-breach usage retention
and safe HTTP diagnostics. No dependency or product code was added.

One actual POST to `https://inference.baseten.co/v1/chat/completions` returned
`meta-models/muse-spark-open-1026` and valid usage of 147 prompt and 27 completion
tokens (174 total). Catalog-rate token cost estimates US$0.0002985. The runner
had retained US$0.001168 before dispatch based on the documented 64-token
truncation request and 256-token completion cap. Actual prompt usage exceeded
64, so that full-billable-input assumption was not verified. The runner saved
usage/model, marked `unsafe-usage`, and did not accept or retain greeting,
finish reason, raw reasoning or the full envelope. No retry was made.

The email's access route is verified; full V2 QA integration is not. No reviewer
ledger, Meta reservation, frozen holdout, actual migration, billing setting or
deployment changed. Preserve the smoke lock and retained reservation. Sources,
request digest, safe result and private-artifact hashes are in the
[smoke record](evaluations/baseten-email-chat-smoke-2026-11-01.md) and
[machine evidence](evaluations/baseten-email-chat-smoke-2026-11-01.json).

## Baseten hackathon-key preflight — November 1, 2026

Pankaj configured the ignored local key and confirmed it came from the hackathon
email. Presence was checked without printing it; `.env` remains mode 600.
The existing non-generating preflight stopped at model-metadata-unverified.
Sanitized diagnostics narrowed this to management metadata HTTP 403 rather
than establishing an invalid key. The documented inference-side `/v1/models`
catalog succeeded with HTTP 200, listing the exact
`meta-models/muse-spark-open-1026` alias, context length 1,048,576, and rates of
US$1.25/M input and US$4.25/M output. The candidate
`/v1/responses/input_tokens` returned HTTP 404. Catalog context alone is not a
verified endpoint-enforced bound; the official overview warns they can differ.

The user-supplied award email documents Chat Completions and the exact model
restriction. Its one-time credential link was not opened. No model generation,
actual migration, new reservation, billing/dependency/application-code change
or public deployment occurred. Existing Meta ownership and quotas are untouched.
The remaining compatibility/cost-bound issue requires a source-backed adaptation,
not a new workspace key or silent budget expansion. See the
[sanitized dated evidence](evaluations/v2-baseten-grant-preflight-2026-11-01.json).
The follow-up diagnostic slice adds a bounded, sanitized inference-catalog
reader and changes `baseten:preflight` to one documented GET only. It requires
exact alias selection and safe per-token pricing but cannot construct live
admission authority. The real configured-key run verified the catalog and
returned `ready: false`, `exact-input-count-unavailable`, exit 2 and zero
generation requests. Delegated typecheck/build and focused catalog/preflight/
adapter checks passed 12/12; primary review checked the code and real GET-only
CLI result. Product bootstrap, generation adapter, ledger and browser code were
unchanged, so their previously passing broad suites were not repeated.

## Baseten V2 controlled integration — October 31, 2026

After Pankaj confirmed the account/credits and requested completion, implemented
the startup-selected Responses adapter, safe metadata/count preflight, mandatory
local schema/semantic validation, provider provenance in review and saved reports,
and a signed v3 aggregate budget shared with Meta. Baseten permits one attempt,
4,096 output tokens and US$0.05 retained per proposal. Existing 3/code,
50-global and US$2.50 limits are unchanged. Migration preserves consumed Meta
quota and publishes a verified staged state/receipt before retiring the old
writer. Tests exercise all seven migration fault phases and real disk failures;
they do not simulate actual power loss.

Delegated implementation and parent hardening were followed by read-only review.
The review found stale operator documentation, now reconciled in README and
`.env.example`; the six other-chat V1 code/test files remain byte-identical.
Direct Meta request serialization matches both recorded reference hashes.
Build/typecheck passed, focused boundaries 26/26, full unit 121/121, and final V2
mocked browser regressions 11/11. Earlier safety/V1/V2 checks passed 22/22;
the final V2 rerun includes the Baseten protected UI. No dependency was added.

The presence-only key check and local preflight report missing `BASETEN_API_KEY`.
No real Baseten network call, generation, spend, ledger migration or existing
server shutdown occurred. The candidate count endpoint is not documented by
the reviewed public Responses reference and may be unavailable. Successful
metadata/count preflight would still not prove generation. Frozen annotations,
grant expiry/overage details, live compatibility and deployment remain open.
See the [readiness record](evaluations/v2-baseten-integration-readiness.md) and
[machine evidence](evaluations/v2-baseten-integration-readiness.json).

## Baseten V2 offline qualification — October 31, 2026

Pankaj accepted the coordinated plan and authorized its offline qualification
slice. Delegated planning and initial implementation were followed by parent
hardening and validation. Preserved the other chat's eight V1 scaffold files
byte-for-byte; no Baseten transport, product mode or HTTP route was added.

Implemented a deeply immutable provisional Responses request for the awarded
`meta-models/muse-spark-open-1026` identifier, bounded envelope/usage parsing,
local JSON-schema enforcement followed by the existing V2 semantic validator,
and finite scripted mock outcomes. Shared prompt extraction preserves the exact
existing Meta request bodies for the recorded context. The signed mock-only
ledger reserves its full synthetic allowance, journals a single attempt before
script consumption and valid usage before content/model rejection, retains
reservations, blocks interrupted/uncertain work and preserves ownership on
unpersistable failure. Accounting values are explicitly synthetic, not verified
provider rates/input counts or approved money. Prepared proposals preserve the
source snapshot and still require separate review and one-use approval.

Typecheck/build passed; focused Baseten checks passed 15/15, the full unit suite
95/95 and safety/V1/V2 browser regressions 21/21. Initial unit launch failed its
embedded exported-browser tests under the shell sandbox; all passed with the
established Chromium escalation, without weakening runner controls. The 95-test
result includes two unchanged V1 scaffold tests from the other conversation;
those inputs are identified in the record and are not staged with this slice.
A read-only planning-agent review found no material offline-scope defect.

See [offline readiness](evaluations/v2-baseten-offline-readiness.md) and its
[machine record](evaluations/v2-baseten-offline-readiness.json). Tests cover
mutation, schema/semantic rejection, usage bounds and ordering, concurrency,
restart, signed malformed/tampered/missing state, actual disk failures and exact
approval provenance. Browser regressions are existing-workflow evidence, not
Baseten UI/live integration. No key was retrieved or read, no Baseten call or
credit spend occurred, and no billing, dependency, deployment or visibility
change occurred. The proposed US$5 is still not a live authorization. Next:
resolve grant-specific profile/accounting and prepare safe secret setup before
requesting approval for one concretely bounded non-holdout qualification call.

## Guarded V2 Responses and real local canary — October 31, 2026

Implemented the authorized continuation from `d6b345b` after delegated planning
and implementation, followed by primary-agent hardening. Counting and generation
now share the exact immutable Meta Responses body for the restricted text-only
`muse-spark-1.3` profile. A fresh signed live ledger reserves US$0.05 before
generation, with 6,073 rendered input tokens, 4,096 output tokens and at most two
attempts. The 3/code, 50/global and US$2.50 total limits have no refunds. Durable
attempt/usage journals, exclusive ownership and failure latches prevent silent
reset, mock-state migration and unaccounted retry. A private one-time operator
bootstrap issues the local code; controlled mode disables v1 mutation/model
routes and authenticates saved-workbench/report/download access.

The one authorized non-holdout real proposal used 1,996 rendered input tokens;
provider usage was 1,853 input and 2,758 output tokens in one attempt, estimated
US$0.01403775. US$0.05 stays reserved. Its three generated cases found seeded
r2's delivery regression (S$67.50 observed versus S$72.50 expected). Saved reuse
on fixed r3 passed all three candidate cases without another model call; the
suite correctly remains INCONCLUSIVE for missing fee and rounding rules.
The exact saved proposal receipt was restored for fresh automated UI approvals
after review of unchanged numeric entries. No human UI click or uninterrupted
walkthrough is claimed. The earlier sandbox launch failure made no Meta request
or reservation. The successful launch used escalation without weakening runner
restrictions.

Typecheck/build passed; focused tests 12/12, full unit 78/78, safety 10/10,
v1 UI 1/1 and v2 browser 10/10 passed. A subsequent small inspection-error
sanitization change passed the affected controlled UI/runtime recheck, 13/13.
Seeded/fixed exported tests produced their expected exit codes (1/0).
Both manifest sidecars, twelve assertion screenshots and all three downloaded
artifact hashes verified. Desktop/mobile screenshots were visually reviewed.
See the [canary record](evaluations/v2-live-canary.md),
[machine evidence](evaluations/v2-live-canary.json) and
[completed plan](superpowers/plans/2026-10-31-proofpath-meta-responses.md).

The isolated preview uses port 3010 and leaves port 3000 untouched. Private
operator material and raw runs stay ignored; no secret was printed. No new
dependency, deployment, billing change, remote push or visibility change. This
one-proposal live authorization is complete. Next: owner review of frozen
annotations, separately bounded evaluation, independent review and managed-host
verification. Token estimates are not billing reconciliation or a general
reliability claim.

## V2 proposal budget and admission — October 30, 2026

Implemented the approved next slice from `57ac7fe`: an authenticated,
mock-only proposal service integrated at the v2 HTTP boundary. The ledger
reserves **50,000 micro-USD (US$0.05)** before transport, admits at most three
proposals per allowlisted reviewer code and fifty globally, and retains all
reservations after success, clarification, invalid output, timeout, uncertain
failure or restart. It journals each of at most two attempts durably before
fetch. The existing fifty-browser-job limit is independent.

Reviewer authentication uses a trusted HMAC digest allowlist and immutable
registry-owned principals. The public body still permits only requirement and
release inputs; callers cannot select identities, quotas or cost estimates.
HTTP authorization and available-quota checks precede inspection; an atomic
reservation rechecks quota after the server-injected test certificate matches
the exact immutable request. No fixture fallback occurs on the protected path.
Unknown codes, exhausted quotas and unavailable admission produce sanitized
401, 429 and 503 responses respectively.

Authenticated state validates the policy/rate snapshot, every reservation,
unique IDs, integer amounts, timestamps, attempt/status consistency and derived
limits. Explicit initialization refuses prior budget artifacts. Normal open
requires the anchor and intact signed state; missing/corrupt state never resets
capacity. One process owns the directory through an exclusive lock. File sync,
atomic rename and directory sync precede permission to transmit. Disk failure
blocks subsequent admission. Restart marks active records interrupted without
refund, and completed/interrupted reservations cannot resume. A crash-left lock
requires explicit operator recovery; there is no automatic stale-lock removal.

Delegated investigation/planning and initial implementation were followed by
primary-agent hardening and validation after the implementation lane exhausted
workspace credits. Review corrected incomplete state validation and shallow
request freezing before accepting the implementation. No independent production
security audit is claimed.

Validation passed:

| Check | Result |
| --- | --- |
| `pnpm typecheck` and `pnpm build` | PASS |
| Focused budget tests | 11/11, none skipped |
| Focused planner/runtime tests | 20/20 |
| `pnpm test` | 66/66; includes the focused tests |
| `pnpm test:v2:browser` | 9/9 |
| `git diff --check` | PASS |

The budget checks exercise concurrent three-per-code admission, all fifty
global reservations, interrupted recovery, signed malformed/over-limit state,
stale/missing accounting, two-process ownership and a crash-left lock, exact
request digests, both retry journals, mutable caller inputs and certificate
rejection. Real temporary filesystem permission failures are injected before
dispatch and after a provider response; no permission-fault test was skipped.
HTTP tests prove authentication-before-inspection, stored budgeted-mock
provenance, strict request bodies, exhaustion and failure without fallback.
Default fixture browser flows, saved reuse, mobile reports and exact downloaded
seeded/fixed exports still pass. Chromium export/browser checks needed the
existing shell-sandbox escalation; runner boundaries were unchanged.

The [budget verification record](evaluations/v2-proposal-budget-readiness.json)
preserves the tested policy, commands and source hashes. Logs are ignored under
`test-results/proposal-budget`; test ledgers and synthetic keys are temporary.
The [sizing script](../scripts/v2-cost-assessment.mjs) now also checks the actual
10,000-byte incoming HTTP body limit; the mixed escaped/plain boundary uses
8,895 incoming bytes and produces 46,342 outbound bytes. This corrects the prior
source-constructor-only boundary and still provides no billable-token proof.

**Remaining gate:** establish a real billable-input bound, then configure
production code issuance, ledger/key lifecycle and protected managed-host
wiring before a separately bounded v2 live evaluation. V1 model routes are
outside this ledger and must be disabled or separately guarded before public
reviewer hosting. V2 Meta dispatch remains disabled; the app is not deployed.
No actual provider call/spend, user credential read, new dependency, billing
operation, public code issuance or repository visibility change occurred.

## V2 local fixture readiness — October 30, 2026

Continued the approved checkout QA workbench from checkpoint `bed9f78`, preserving
the existing UI/test edits and v1 fallback `4ace907`. Planner investigation,
delegated implementation and primary-agent validation completed the local
fixture slice. All six capabilities now have local checks: inspected registered
releases, reviewed source/rules/cases/gaps, immutable one-use approval, paired
execution/comparison, saved regression reuse, and bug-packet/Playwright exports.

This pass finished duplicate-request guards, tested 101 intermediate polling
responses, and verified stale-response rejection using defensive programmatic
invalidation of deliberately disabled fields. Those synthetic events do not
represent normal user editing while controls are disabled. Reopened reports now
identify their recorded baseline, candidate, original source and approval digest
separately from the controls used to prepare another suite.

The Meta request schema no longer uses unsupported `oneOf`/`allOf`; nested action
`anyOf` retains the bounded combinations. Recursive strict-shape checks and local
proposal/clarification and action validation passed. This is offline schema
compatibility evidence, not verified provider acceptance. V2 live dispatch
remains disabled; the earlier v1 live results remain v1 evidence.

Required validation passed:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm test` | 54/54 |
| `pnpm test:safety` | 10/10 |
| `pnpm test:ui` | 1/1 |
| `pnpm test:v2` | 29/29; this subset overlaps `pnpm test` |
| `pnpm test:v2:browser` | 9/9, with browser files serialized |
| Affected v2 UI rerun after recorded-snapshot display change | 6/6 |
| `git diff --check` | PASS |

Chromium needed execution outside the restricted shell sandbox; runner policies
were not relaxed. The initial sandbox launch failed before any browser test
could execute. Two unfinished UI tests also failed during investigation: an
elapsed-time poll-count assumption and a fill against a disabled field. Both
were corrected before the passing checks above. No unrelated passing checks
were repeated after the final frontend-only change.

The integrated fixture flow inspected r1/r2, proposed/reviewed/approved the
suite, observed the delivery regression, saved the immutable definition, prepared
r1/r3 with no additional planner call, freshly approved it and reopened the
persisted report. The exact HTTP-downloaded test failed on r2 and passed on r3.
The fixed candidate passes its executed cases; an explicitly accepted uncovered
`cart-2` criterion keeps the overall suite **INCONCLUSIVE**. This is not a
complete-coverage PASS. Approval clicks were automated test actions, not human
reviewer actions. Desktop failure and reopened mobile fixed-report screenshots
were visually inspected, including the recorded release identity and wrapped
digest. Mobile overflow checks passed.

The [machine-readable fixture record](evaluations/v2-fixture-readiness.json)
preserves run IDs/digests, comparisons, coverage, export hash, source hashes and
screenshot hashes. Test runtime directories were temporary and cleaned after
reopening/evidence checks; their run IDs are provenance rather than durable app
report URLs. Ignored local screenshots and logs remain in `test-results/task4`
and `test-results/readiness`.

Added v2 test commands and an
[agent-drafted frozen holdout](evaluations/v2-frozen-requirements.json). Owner
annotation review remains pending. It has not been sent to the actual v2 Meta
planner; no claim is made that development models have not seen it. Grading
annotations are excluded from model inputs, and preflight safety rejections
must be recorded separately from model success.

Refreshed public Meta pricing, strict-output and accounting documentation.
The [offline cost assessment](evaluations/v2-cost-readiness.md) and
[reproducible sizing record](evaluations/v2-cost-assessment.json) leave the live
gate blocked: there is no verified billable-input bound or durable proposal
reservation ledger. At the existing 4,096 completion cap, reserving two attempts
leaves 6,073 equal billable input tokens per attempt within US$0.05. Measured
HTTP bytes are not a token/billing bound. Selected limits were not raised.

**Next:** implement defensible input admission and durable proposal accounting,
review the holdout annotations, then pursue separately bounded v2 live
evaluation and managed-container reviewer hosting. No model request, API spend,
credential read, billing operation, new dependency, deployment or repository
visibility change occurred during this pass. The app is not deployed and v2
eligible-model behaviour remains unverified.

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

## Action evidence and readable reports — October 28, 2026

Completed stage 1 of the remaining-work plan in two sequential implementation
slices. The planner reviewed scope/interfaces; the implementer changed the
runner/evidence path first, followed by the UI. Primary-agent diff review,
failure-path checks, Chromium safety validation and a local UI walkthrough
followed. No production dependency was added.

New manifests contain one ordered `actionResults` record per approved action:
completed/blocked/timed-out/failed/not-run, timestamps, observed URL and optional
fixed local error. The runner and execution error carry action results alongside
assertions; server fallbacks record unexecuted actions without raw errors.
Completed steps remain intact if a later stage fails. Plan contracts, digest
inputs, one-use approval, deterministic verdicts and fixture egress rules are
unchanged. Earlier manifests and their hashes were not rewritten.

The review UI now shows the returned requirement, scenario/revision, planner,
semantic steps, expected checks and full digest, with expandable exact JSON.
Reports show execution/verdict, action history, readable SGD and boolean checks,
timestamps/URLs, screenshots, replay and raw evidence. A `/?run=<id>` link opens
the saved report without planning or running again. Older reports explicitly
label absent action history. Missing screenshots do not render an image link.
All source text uses text nodes; evidence paths are constrained local paths.

Approval/run controls lock synchronously while requests are pending. Inputs are
editable again after approval completes; changing them invalidates the visible
approval. Stale proposal and saved-report responses cannot overwrite a newer
journey. Keyboard focus moves to review/report headings, and the 390px layout
was checked for horizontal overflow. This is targeted UI hardening, not an
exhaustive race or accessibility audit.

Verification:

- The 24-test unit/server/adapter suite passed after action-evidence changes.
  An added setup-failure test and the other five runner unit tests then passed:
  all actions are not-run with null timestamps/URL and the raw launch error is
  absent. TypeScript checks and JavaScript syntax checks passed.
- All 10 local Chromium safety tests passed after the runner change. Ordered
  completed/blocked/timed-out/not-run records and sanitized errors were checked,
  including completed navigation before a blocked click. Screenshot/manifest
  hash checks remain in the safety harness. The suite was not repeated for
  frontend-only changes.
- Final `pnpm test:ui` passed (one integrated regression, about 7.6 seconds).
  The normal fixed-quantity journey uses the real fixture server/runner and
  keyboard controls; controlled route responses cover delayed/stale requests,
  duplicate clicks and synthetic legacy data. Exact review/manifest envelope and
  digest agreement, manifest sidecar, loaded screenshots, mobile overflow,
  escaped text, missing images and invalid/unavailable run links were checked.
- Primary-agent supported-browser walkthrough: fixture proposal, automated UI
  approval click, run and report reopening passed. Run
  `c015d73a-5459-4593-9584-e9220c1d29d8` completed with quantity 2 / 7800 cents,
  both assertions PASS and all three actions completed. Manifest SHA-256
  `ad9df25a22e7689f59e87e13daf07a83955d444fd9ae2c6019e7195adac31427`
  and both screenshot hashes matched. This was an automated fixture UI check;
  no human approval click or fresh Meta proposal is claimed.

Latest local UI screenshots are in ignored
`runs/ui-verification-ec128e96-4291-4189-b3ed-0595b242c8c6/`:
desktop review/report, mobile report and compact result summary. Desktop/mobile
screenshots and the result summary were visually reviewed. Chromium required
execution outside the restricted shell sandbox; no safety policy in the runner
was relaxed. `git diff --check` passed.

The local preview is running at `http://127.0.0.1:3000/` in explicit fixture mode;
the ignored `.env` was not changed. Zero new Meta requests or API spend. No
billing, deployment or visibility change occurred. The next stage is saved Meta
required-fields execution; fresh live-proposal UI approval, hosted ingress/budget
controls, independent review and submission artifacts remain open.

## Saved Meta required-fields execution — October 28, 2026

Executed the exact saved `required-a` response from live evaluation
`65d12830-06a6-4e45-b28d-25c752e2d019`, retaining its original requirement,
baseline scenario, actions, assertions and Meta provenance. Source results
SHA-256 matched both the recorded value and sidecar:
`735e0eb6ac74c3eadaacef8918941ea958adae22a3dbeeae942dc0fd5eb73978`.
The case-file and Meta planner source/runtime hashes also matched. Production
contract validation accepted the response. The recreated envelope was identical
to the original evaluation envelope, including approval digest
`sha256:431cc5dad8acabbc0338fa70895e4c26ce11fd2312fc093f49ce89901b4b3bf6`.

Under the user's instruction to proceed to this next step, a fresh one-use
approval was recorded programmatically from chat authorization. Consumption
before approval and reuse afterward were rejected. No human or automated UI
approval click is claimed for this run. The preview server served only the
controlled checkout in fixture mode; neither planner was called.

Run `50dd087a-e086-4649-b864-1b50fde08384` completed with overall **PASS**:

- Navigate shop, add lamp, open checkout and continue with blank fields: all
  four actions completed in plan order, with timestamps and the exact fixture URL.
- `required-errors-visible`: expected true, observed true, **PASS**.
- `checkout-stayed`: expected true, observed true, **PASS**.

Both screenshots were byte-identical and matched their SHA-256 value
`86ee116dbd34ed15a93778181ce29e04ea09bc423eab4eaaebdc0cf70ec8ec3f`.
Visual inspection confirmed blank email/postal code, both required messages and
an active checkout. Manifest SHA-256 and sidecar matched:
`e9dc622bf8b170374396abe1ebefa637ef2de9872e84bec1a14a96aeff37d8c8`.
The manifest and both evidence HTTP endpoints returned 200 and matched the
saved content/hashes. Approval source and verification harness were preserved
with verified sidecars in the ignored run directory.

The in-app browser's navigation API reported `browser.user is unavailable`
while attempting to reopen this new report, including through the documented
tab API. The new readable report was therefore not inspected in the UI during
this step. Existing report rendering regression evidence is unchanged; direct
HTTP checks here establish evidence delivery, not new UI proof.

Zero new Meta requests/API spend; no app code, dependency, environment, billing
or deployment change. Existing passing unit/safety/UI suites were not repeated
for this saved-plan verification; the temporary harness checked source integrity,
contract/envelope/digest agreement, one-use approval, all action/assertion
outcomes and evidence hashes. All three supported journeys now have local
browser evidence for at least one live-generated plan, using chat-authorized
approvals. This is selected-scenario evidence, not general reliability or a
fresh live-proposal UI approval. Next: bounded reviewer-access deployment,
after the owner selects hosting and numerical attempt/spend limits.

## V2 concept selected and written design — October 28, 2026

The user selected checkout/order workflows for the expanded browser QA workbench.
Recorded the [v2 PRD/design](superpowers/specs/2026-10-28-proofpath-checkout-qa-design.md):
requirement interpretation and source traceability, bounded generated suites,
independent reviewed-rule oracles, paired release evidence, saved regressions,
bug packets and template-based Playwright exports. It distinguishes proposal
from implemented behaviour, requires review before an implementation plan, and
preserves `4ace907` as the working v1 fallback. Existing docs now identify their
v1 scope so they cannot silently constrain or overstate the new product.

Self-review covered source/oracle authority, intended-change versus regression
semantics, coverage gaps, case isolation, historical evidence, missing runtime
identity, exported-test verification, separate execution quotas and the enlarged
Meta request's unresolved cost fit. No app code, dependencies, API calls, live
inspection, deployment, secret or visibility setting changed. Runtime tests
were not repeated for this documentation-only design checkpoint.

## V2 design accepted; implementation plan prepared — October 28, 2026

The user's request to begin development accepted the written design as input.
The planner produced implementation tasks and the primary agent self-reviewed
them against the spec. Saved the [implementation plan](superpowers/plans/2026-10-28-proofpath-checkout-qa-implementation.md)
with five deliverables: target/oracle, inspected proposals and rule review,
approved paired jobs, workbench/reuse/exports, and integrated verification.
The previously selected planner → implementer → parent validation method remains.

Self-review corrected fixed-reference-only arithmetic to use reviewed rules;
separated model cases from independently derived expected values; made
input/action agreement explicit; distinguished observed versus declared later
controls; separated review compilation from final exact-snapshot approval;
and retained selected API limits as targets whose v2 cost fit is unverified.
All six accepted product capabilities map to tasks. The written-plan review
checkpoint remains before implementation under the loaded planning workflow.
No application code, tests, dependencies, secrets, API calls, deployment or
visibility changed in this preparation step.

The user then instructed continuation after the concrete plan had been written.
Development is proceeding task by task under the already selected execution
method; no claim of a human reading every plan line or of v2 completion is made.

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
