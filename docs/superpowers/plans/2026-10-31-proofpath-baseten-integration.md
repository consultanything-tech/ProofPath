# Baseten integration coordination plan — October 31, 2026 (SGT)

November 1 update: the hackathon-issued key is configured. The inference catalog
returns the exact model and expected token prices (HTTP 200); management
metadata is forbidden (403), and the candidate Responses count route is absent
(404). No generation or actual migration occurred. The next step is a
source-backed grant-compatible admission design, starting from the award's
Chat Completions example. Replacing management metadata with the inference
catalog alone does not solve the missing input bound. Current reviewer limits
remain unchanged. See [dated evidence](../../evaluations/v2-baseten-grant-preflight-2026-11-01.json).

The immediate implementation is a GET-only inference-catalog diagnostic,
strictly separate from generation admission. It must report partial readiness
and exit non-ready, with no counter POST, ledger access or model generation.
The existing provisional Responses product path remains unqualified; this
diagnostic is not a Chat Completions adapter or a migration authorization.

Provider clarification to request if no documented alternative is established:
“For the hackathon key restricted to `meta-models/muse-spark-open-1026`, is
there a supported endpoint or exact tokenizer/chat-template revision that
counts the complete rendered Chat Completions prompt before generation?
Alternatively, is there an endpoint-enforced input-token limit that rejects
oversized input without truncating it, and what billing/output limits apply?”
No message has been sent. `truncate_prompt_tokens` alters the reviewed source
and does not satisfy the current exact-input policy.

Current status, October 31: Pankaj subsequently confirmed account/credit readiness
and requested completion of integration. V2 transport, controlled UI and signed
shared-v3 accounting are implemented and tested with mocks. Local credential
configuration, actual metadata/count compatibility and a live generation remain
open. No actual migration or Baseten call has occurred. The existing
US$0.05/proposal and US$2.50 aggregate limits govern this continuation; the US$5
independent-canary proposal below was never approved and is superseded. The
reviewer integration was prepared before live qualification so it is concrete
and reviewable, but is not enabled on the real operator state. See the
[current readiness record](../../evaluations/v2-baseten-integration-readiness.md).

Historical plan acceptance: accepted for the **offline step-2 qualification harness** on October 31
when Pankaj said “let's proceed” after the reviewed plan. That continuation
covers mocked request/parser/admission work and validation. It does not authorize
live spending, key redemption, billing changes, deployment or reviewer wiring.
The preceding coordination pass added this plan without application edits;
earlier implementation authorization in the other chat is preserved.

## Decision

Qualify Baseten with **one synthetic, non-holdout V2-shaped proposal** in an
isolated operator harness, then make it an alternative backend for the current
V2 workbench if successful. Prefer Responses if the awarded model supports its
required profile; otherwise use a verified Chat Completions profile. Preserve
the working direct-Meta backend and deterministic review/oracle/runner.

The older V1 eight-case comparison is optional historical evidence, not a
mandatory prerequisite. It would not establish V2 compatibility. Do not add a
second model to each proposal, automatic provider fallback, autonomous fixes,
media inputs or a provider-selection UI in this slice. Model contribution is
shown by useful generated suites and evidence, not the number of paid calls.

## Coordination and current evidence

The user-owned chat **Check account credits and apply**
(`01a18060-8a29-7840-834c-96fb10343377`) was read and explicitly contacted under
Pankaj's coordination request. It confirmed on October 31:

- The US$5 initial ceiling was proposed, not explicitly approved for live use.
- Its agent did not open the one-time key link or make Baseten calls.
- Its scaffold constructs a V1 request but has no transport/evaluation runner;
  `PLANNER_MODE=baseten` deliberately throws before dispatch.
- V2 is the useful product target. Existing Meta Responses counting/admission
  evidence cannot be used as Baseten counting or billing evidence.
- Its existing edits are preserved; this coordination pass requested no edits,
  commits, key redemption or live requests from that chat.

That chat's reviewed [award email](https://mail.google.com/mail/u/?authuser=pankaj.vedprakash.verma%40gmail.com#all/1a1840658f61f6f3)
names a US$100 award, up to 2M TPM and the restricted model
`meta-models/muse-spark-open-1026`. This pass did not reread the email, inspect
account billing or redeem the link. Award selection does not prove current
balance, expiry, account activation, successful model access or an overage cap.

The shared checkout already contains these uncommitted scaffold files owned by
the other chat: `.env.example`, `README.md`, `public/app.js`,
`src/meta-planner.ts`, `src/plan-store.ts`, `src/planner.ts`,
`src/baseten-planner.ts` and `tests/baseten-planner.test.ts`. Preserve and reconcile
them under one implementation owner; never stage or discard them incidentally.
Its reported offline tests are historical evidence, not new checks by this pass.

The [current V2 canary](../../evaluations/v2-live-canary.md) is a real direct-Meta
Responses proposal, seeded failure and saved fixed reuse. Its US$0.05 reservation
remains retained. Frozen requirements await owner annotation review and have
not been used for this Baseten qualification.

## Official documentation findings

Public pages were inspected on October 31. The search reader timed out on the
docs root; the official `llms.txt` index and linked Markdown pages were then
retrieved successfully over verified HTTPS. Sources are provider documentation,
not a grant-specific account inspection.

| Finding | Planning consequence |
| --- | --- |
| [Structured outputs](https://docs.baseten.co/inference/structured-outputs.md) explicitly says Muse Spark Open accepts `json_schema` but does not enforce it. | `strict: true` is guidance for this model, not a schema guarantee. Local JSON/schema and semantic rejection is mandatory. Lack of provider enforcement is an adaptation, not a requirement to wait for an unavailable feature. |
| [Responses reference](https://docs.baseten.co/reference/inference-api/responses.md) documents stateless `/v1/responses` and an output cap including reasoning. [Chat Completions](https://docs.baseten.co/reference/inference-api/chat-completions.md) is also available. | Do not build only against V1 because the API is OpenAI compatible. Verify the awarded alias and selected protocol; do not copy Meta-only fields or its count URL. |
| The current [model page](https://www.baseten.co/library/muse-spark-open/) uses unsuffixed `meta-models/muse-spark-open`. | It does not establish that alias is permitted by the grant key. Keep the email's `-1026` identifier until authoritative compatibility evidence confirms mapping. Record returned identity and any documented mapping. |
| The model page and [pricing table](https://www.baseten.co/pricing/) list US$1.25/M input, US$4.25/M output and US$0.15/M cached input. | These are public rates, not yet a verified tariff for the grant alias. Use full uncached rates for reservations after confirming applicability. Search snippets contained inconsistent ordering; the opened current pages agreed. |
| [Model API pricing/limits](https://docs.baseten.co/inference/model-apis/pricing-and-limits.md) explains request usage and separates speculative-decoding statistics from billing totals. | Validate the selected protocol's usage fields; do not double-count reasoning, cache details or rejected predictions. Save safe usage and request digests, not raw reasoning. |
| [Billing](https://docs.baseten.co/organization/billing.md#monthly-budget) documents optional **Enforce budget** for Model APIs; ordinary budgets send notifications. | Check whether the special key belongs to a workspace Pankaj controls and whether this setting covers it. Availability, in-flight overshoot, calendar-month reset and grant expiry remain unverified. No setting was changed. |

No Baseten preflight count mechanism was established in this review. This is a
coverage limitation, not proof no such mechanism exists. The endpoint's actual
limits may differ from advertised model context; the
[model overview](https://docs.baseten.co/inference/model-apis/overview.md)
explicitly warns about that distinction.

## Work sequence and acceptance gates

### 1. Resolve contract and grant facts without spending

Record source-linked evidence for the exact awarded model/endpoint, accepted
request fields, allowed returned-model identity, output/reasoning cap, rates,
usage counters, grant expiry and overage behavior. Public generic docs are
insufficient to resolve special-key permissions. If an account-only fact cannot
be inspected without the one-time credential, prepare the safe destination
first and request that specific retrieval/configuration action when ready.
Never request the key in chat, follow a redemption URL during routine research,
or send an organizer/support message without user authorization.

Complete the protocol decision before finalizing request hashing. No tools,
media, history, background work, streaming, storage or model-driven iterations.
One generation attempt initially; no automatic retries or paid repair loops.

### 2. Build the offline qualification harness and admission profile

Reuse V2 requirement, inspection and semantic contract functions, including
`validateSuiteProposal` and independent reviewed rules. Freeze a provider-owned
request including source, schema and all sampling/output fields. Bind model,
protocol, rates, input bound, output cap and attempt count to its durable
reservation. Do not mutate a Meta request's base URL and call it compatible.
No new production dependency is needed; use current native fetch/crypto/fs/tests.

A defensible pre-dispatch bound can come from either a verified count/tokenizer
for this exact rendered provider request, or a conservative, verified
endpoint-enforced input/context ceiling plus output cap. Byte heuristics and
prior observed prompt usage are not admission proofs. The broad context-ceiling
option may fit an explicitly approved operator canary while being far too
expensive for reviewer proposals; do not advertise it as US$0.05 admission.

Use integer monetary units, rounding reservations up:

`reservation >= attempts × (I_bound × input_rate + O_cap × output_rate)`

Rates must use consistent token units. Charge all allowed attempts at uncached
rates. Retain admitted reservations after errors, clarifications, invalid model
output or abandonment. Missing/malformed usage, ambiguous transport, usage breach
or persistence failure closes admission and retains capacity after restart.
A local bound is not account-wide invoice reconciliation.

### 3. Secure local setup and authorize exactly one qualification call

Before opening a one-time link, prepare an ignored restricted-permission local
secret destination and confirm it is excluded from Git. Do not echo secrets,
embed them in shell arguments, screenshots, errors, evidence or browser payloads.
Retrieval and a paid canary need explicit user authorization after the exact
profile and reservation are reviewable. US$5 remains a proposal and is not a
production constant approved by this document. A provider budget change needs
its own concrete authorization and may be inapplicable to a grant-managed key.

Use a Baseten-specific signed profile and state, never the Meta live ledger or
old mock state. Use one operator budget authority for all Baseten qualification
calls in this project, not fresh directories that replenish capacity. Signed
scope must prevent the qualification path from being exposed as reviewer use.
Leave the running Meta server/owner lock and its retained reservation untouched.
Qualification uses only the explicitly authorized Baseten operator budget; it
does not exercise or consume reviewer 3/code, 50/global or US$2.50 capacity.
The existing reviewer authority is preserved for the later product wiring.

### 4. One non-holdout V2 qualification

Send one bounded synthetic source through the exact frozen Baseten request.
Record request hash, documented/returned identity, stop/completion status,
latency, usage, retained reservation and estimated cost. Parse only the expected
final text and require the existing schema and semantic invariants. No extra
prose stripping, paid JSON repair, unrequested tools or weaker fallback validator.
Journal any available usage before rejecting an unexpected model identity or
invalid content: a failed compatibility response can still be billable. If usage
is missing, preserve the full reservation and block admission.
Stop on refusal, truncation, invalid content, unknown identity or usage errors.
Record failure honestly; no real test suite is approvable from invalid output.

If valid, inspect the actual proposed cases/rules/gaps, obtain the same explicit
review and exact one-use approval, run seeded r1/r2, then saved r1/r3 reuse with a
fresh approval and no new model call. Verify report, provenance, screenshot/hash,
bug packet and exact exported-test execution. A provider qualification result
is still distinct from complete production wiring and broad language reliability.
The harness can compose context/inspection, provider admission,
`V2Store.createProposal`, review/approval and the existing runtime directly.
Label that evidence as operator-harness execution; it does not establish
reviewer HTTP authentication, product UI approval or hosted access.

### 5. Wire the qualified backend into V2

Likely files, refined by implementation planning:

- `src/v2-baseten-planner.ts`: provider-specific immutable request and bounded
  envelope/usage parser feeding existing V2 validators. Share only pure
  protocol-independent contract construction where useful.
- `src/v2-baseten-proposal.ts` and an operator/bootstrap module: provider-specific
  admission with explicit profile, durable journals and sanitized failures.
- `src/server.ts`: startup-selected `V2_PLANNER_MODE=baseten`, no request-controlled
  endpoint/model/provider; keep V1 mutation/model routes disabled in both
  controlled live modes.
- `src/v2-http.ts`: safe service metadata for provider/model/protocol and actual
  admitted policy. It currently hardcodes `controlled-meta` and US$0.05.
- `public/workbench.js`/HTML: authentication must depend on controlled access,
  not `mode === controlled-meta`; truthfully label Baseten-hosted Meta and its
  validation behavior across review, report, reuse and downloads.
- Targeted contract/admission/HTTP/browser tests, then relevant shared checks.

Preserve existing reviewer limits: **3 proposals/code, 50 proposals globally,
US$0.05/proposal and US$2.50 total**. A startup provider switch must not issue a
second quota pool or forget the existing consumed Meta reservation. Keep
provider-specific accounting profiles separate but enforce a shared aggregate
reviewer authority before either backend dispatches. Plan the explicit state
transition if hosted reviewer switching is supported; never silently migrate,
reset or reinitialize live state. If Baseten cannot fit a verified US$0.05
reservation, leave it operator-evaluation-only until a separate policy change
is approved. No fallback on failure or uncertain dispatch.

### 6. Verification and delivery

Offline tests must prove exact reserved/dispatched body agreement, mandatory
local schema and semantic rejection despite an accepted `strict` parameter,
model identity enforcement, output/refusal/truncation handling, authentication
before inspection/provider work, concurrency, signed-policy tamper/restart/disk
failure behavior, retained reservation and durable uncertainty latch. Verify
no route bypass, credential leakage or cross-provider state acceptance.
If reviewer switching is implemented, prove the three/code and fifty/global
aggregate cannot be multiplied by switching backends.

For shared-code changes, run typecheck/build, focused Baseten controls, unit,
safety and affected V1/V2 browser checks. Use the established macOS Chromium
escalation when needed; previous sandbox launch failures are not product-test
failures or permission to weaken runner boundaries. Preserve the working Meta
behavior and truthfully distinguish mocked, live, browser and deployed proof.
A later bounded broader evaluation requires owner-reviewed annotations and a
separate batch authorization; qualification does not consume the V2 holdout.

## Scope and next action

Completed offline implementation deliverable: V2-shaped Baseten qualification
request/parser/admission harness with mocked tests. See the
[offline readiness record](../../evaluations/v2-baseten-offline-readiness.md).
Grant/account facts and paid dispatch remain separate open gates.
Do not complete a second legacy V1 product integration first. One owner should
implement the coordinated slice; the other chat remains the credit/grant evidence
source. This document is the canonical Baseten plan for this coordination pass.
