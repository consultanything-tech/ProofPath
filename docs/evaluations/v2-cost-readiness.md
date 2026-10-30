# V2 offline cost readiness — October 30, 2026

**Gate: blocked.** The approved targets remain 3 proposals per reviewer code,
50 proposals globally, US$0.05 reserved per proposal including retries, and
US$2.50 total. These are planning targets, not implemented spending controls.
V2 live Meta dispatch stays disabled. No provider request or credential read
was needed for this assessment.

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
Unicode/JSON expansion and criterion duplication. Schema and messages both
contribute to request sizing.

## What must change before live use

1. Establish a defensible input accounting/admission bound for the exact model,
   schema, source limits and Chat Completions request. Reject oversized proposals
   before dispatch. Byte size alone does not satisfy this check.
2. Implement durable reservation accounting for attempts, retries, per-code
   limits and the global budget, including uncertain network failures and
   restart/corruption behaviour. The existing 50-browser-job limit counts
   execution jobs and supplies none of these proposal-spend guarantees.
3. Verify provider schema acceptance and evaluate the frozen requirements
   under an explicitly bounded live test. Keep fixture and v1 evidence distinct.

Measured policy options are to retain two attempts only with a verified
6,073-token input allowance, or to disable the retry and establish the larger
26,073-token allowance. Reducing request or completion bounds may help but must
retain useful suite coverage. No policy or cap was changed during this pass;
raising the US$0.05 cap is not assumed. Managed hosting and reviewer access
remain later work.
