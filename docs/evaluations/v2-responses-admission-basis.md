# V2 Responses admission basis — October 31, 2026 (Asia/Singapore)

## Protocol decision

V2 counting and generation must use the same immutable Responses body. A
Responses count is not evidence about a Chat Completions prompt. V1's existing
Chat Completions evidence remains separate.

The live profile is single-shot text: the eligible `muse-spark-1.3` model,
strict output schema, low reasoning, no tools, no media or prior history,
disabled truncation, and no stored/background/streamed response. Neither the
caller nor model output may add another model iteration. This profile is a
requirement of admission, not an optional efficiency setting.

## Source basis and limits

- [Count input tokens](https://dev.meta.ai/docs/api-reference/responses/count-input-tokens)
  documents a rendered-input measurement before generation. Its
  [request schema](https://dev.meta.ai/docs/api-reference/responses/schemas#token-counts-body)
  supports the generation fields, including the text/schema configuration.
- [Token counting](https://dev.meta.ai/docs/token-counting) distinguishes rendered
  context from cumulative response usage. Hosted tool iterations can increase
  cumulative input; this profile forbids them. Reasoning is part of output
  usage, not an extra output allowance.
- [Responses](https://dev.meta.ai/docs/protocols/responses) documents the generated
  output limit and its structured-output field. No Chat Completions-only
  `response_format` parameter is used on this path.
- [Pricing](https://dev.meta.ai/docs/pricing-rate-limits) currently lists Standard
  input at US$1.25 and output at US$4.25 per million tokens. Cache discounts and
  Contributor variants are not assumed.

For the fixed single-iteration profile, the rendered input count is used as a
**conservative admission upper bound**, not an invoice estimate or reconciliation.
The public pages differ about whether injected steering tokens are present in
the count; either included or discounted steering does not require adding an
extra billable iteration in this restricted profile. This inference does not
extend to arbitrary provider requests, tools, history or media.

Both attempts must use the admitted request. With input at most 6,073 tokens
and output capped at 4,096 tokens per attempt, the no-cache token ceiling is
US$0.0499985 across two attempts, rounded up to 49,999 micro-USD. The ledger
reserves the full 50,000 micro-USD before generation. Failures and unused retry
allowances do not release capacity.

Count errors, oversized input, changed request/profile or unavailable durable
state must prevent generation. Returned usage is checked against the admitted
input and output bound; an unexpected accounting result must retain the
reservation and block further live admission. Post-response checking cannot
undo a provider accounting violation, and is not proof of account-wide billing.

## Verification status

The restricted path is implemented and one explicitly authorized live proposal
verified provider acceptance, account access and the first count/usage comparison
on October 31; see the [canary record](v2-live-canary.md). That evidence remains
separate from this design basis. It does not establish invoice reconciliation,
frozen-holdout reliability or managed-host readiness. This document authorizes
neither another model call nor a budget increase.
