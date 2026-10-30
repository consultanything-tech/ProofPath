# V2 cost readiness — updated October 31, 2026

**Current gate: restricted local Responses canary verified.** The exact immutable
Responses body is counted before generation under the [restricted admission
basis](v2-responses-admission-basis.md). A separate signed live ledger enforces
3 proposals/code, 50 globally, US$0.05 per proposal including retries and
US$2.50 total. The [October 31 canary](v2-live-canary.md) verified provider schema
acceptance and one count/usage comparison through local browser execution.
This is not invoice reconciliation, an account-wide spending cap or a general
provider reliability claim. Frozen-holdout evaluation and managed hosting remain
open; no additional live call is authorized by this record.

The following October 30 assessment is retained as historical **Chat Completions
and mock-only** analysis. Its blocked recommendation was superseded for the
restricted Responses path, not by interpreting a Responses count as a Chat
Completions count. The mock version-1 ledger is never automatically migrated or
reset into live capacity.

## October 30 historical assessment

The then-approved targets were 3 proposals per reviewer code, 50 globally,
US$0.05/proposal and US$2.50 total. At that checkpoint only mock reservations
were implemented, with real dispatch disabled. No real request or credential
read was needed for that assessment.

## Public sources refreshed

- [Pricing](https://dev.meta.ai/docs/pricing-rate-limits): `muse-spark-1.3`
  Standard input US$1.25 / million tokens, output US$4.25 / million tokens.
  Do not assume the US$0.15 cached-input rate or a Contributor variant.
- [Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions):
  `max_completion_tokens` caps generated tokens.
- [Token accounting](https://dev.meta.ai/docs/token-counting): Chat Completions
  returns `prompt_tokens` and `completion_tokens`; reasoning tokens are a subset
  of the completion total. The Responses count endpoint measures rendered
  context, including injected scaffolding, and explicitly is not a billing
  estimate. It is not proof of an equivalent Chat Completions billable count.
- [Strict structured output](https://dev.meta.ai/docs/structured-output): no
  root union; `oneOf` and `allOf` unsupported anywhere; below-root `anyOf` is
  permitted. Local schema checks do not establish provider acceptance.

## Reservation arithmetic

For billable input count `I`, the no-cache worst-completion planning cost is:

`attempt USD = I × 1.25 / 1,000,000 + 4096 × 4.25 / 1,000,000`.

| Policy | Output-only maximum | Largest equal input allowance per attempt within US$0.05 |
| --- | ---: | ---: |
| One attempt | US$0.017408 | 26,073 billable prompt tokens |
| Two attempts | US$0.034816 | 6,073 billable prompt tokens |

Two attempts reserve both complete requests, including the case where the
first request was processed but its response was lost. Successful small v1
requests cannot establish this v2 bound. Neither bytes/4 nor bytes/token is a
verified tokenizer or billing bound. No token estimate here establishes that
every currently accepted v2 request fits US$0.05.

## Reproducible offline sizing

Run `pnpm build` followed by `node scripts/v2-cost-assessment.mjs`.
The [recorded JSON](v2-cost-assessment.json) records the planner source hash,
current request sizes, rates, completion limit and arithmetic. The script
imports only request construction and uses synthetic input; it has no transport
or key lookup. Rebuild before rerunning after source changes.

Three measurements distinguish an ordinary requirement, an accepted 3,999
character escaped-input boundary, and an independent-field upper envelope.
The last deliberately overcounts correlated fields; it is an HTTP JSON byte
ceiling for the current registered builder, **not** an exact reachable maximum,
token count or cost cap. The constructed boundary exercises six source quotes,
JSON escaping and criterion duplication while also satisfying the incoming
HTTP body's 10,000-byte limit (8,895 bytes). Earlier sizing exercised the source
constructor alone; the current mixed escaped/plain boundary corrects that
distinction. Schema and messages both contribute to request sizing. The current
outbound example is 46,342 bytes; neither this nor the 77,240-byte independent
field envelope is a verified billable token count.

## What must change before live use

1. Establish a defensible input accounting/admission bound for the exact model,
   schema, source limits and Chat Completions request. Reject oversized proposals
   before dispatch. Byte size alone does not satisfy this check.
2. Connect the locally verified durable reservation service to the future
   production proposal path, with trusted code issuance, ledger/key lifecycle
   and exclusive persistent-volume ownership. The mock service reserves before
   transport and journals retries; no production bootstrap is configured. The
   existing 50-browser-job limit is separate from proposal accounting. Disable
   or separately guard v1 model routes before public reviewer hosting.
3. Verify provider schema acceptance and evaluate the frozen requirements
   under an explicitly bounded live test. Keep fixture and v1 evidence distinct.

Measured policy options are to retain two attempts only with a verified
6,073-token input allowance, or to disable the retry and establish the larger
26,073-token allowance. Reducing request or completion bounds may help but must
retain useful suite coverage. No policy or cap was changed during this pass;
raising the US$0.05 cap is not assumed. Managed hosting and reviewer access
remain later work.

## Local reservation mechanics

`src/v2-proposal-budget.ts` now has a mock-only authenticated ledger with fixed
integer reservations, pre-attempt journaling, three reservations per allowlisted
reviewer digest, fifty globally, and no failure refund. It is locally tested for
restart, tampering, exclusive ownership and mocked HTTP admission. It has no
production bootstrap, code issuance or real token meter. The ledger is not a
reason to set `V2_PLANNER_MODE=meta` or to expose the V1 planner on a reviewer
host.

The signed policy includes the rate snapshot and integer micro-USD limits.
Normal open never initializes state. Missing/corrupt state or a failed write
blocks the instance; restarting preserves interrupted reservations. An exclusive
owner lock rejects other processes and remains after a crash. Stale-lock recovery
is an explicit operator procedure, not automatic deletion; never remove a lock
while its owner may still be running. Operator rollback or loss of the entire
data directory is not a supported way to recover budget capacity.
