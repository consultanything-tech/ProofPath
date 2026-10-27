# Live planning evaluation v1

On October 27, 2026, all **8 fixed cases met their declared expectations**:
six covered plans and two appropriate clarifications. This evaluates planning,
not browser execution or broad natural-language reliability.

- Cases were committed as `87aa53e` before any request. [Fixed inputs and grading](live-cases-v1.json).
- Production planner/prompt remained unchanged throughout; no case was retried for a semantic failure or removed.
- All eight requests returned HTTP 200 from `muse-spark-1.3`, with successful finish state and local contract validation.
- Eight requests, zero retries, zero approvals and zero browser executions.
- 9,775 total tokens. Estimated token cost **US$0.02960075**, using [published standard rates](https://dev.meta.ai/docs/pricing-rate-limits); this is not a verified invoice/credit deduction.
- Authorized cap: US$1. Conservative preflight estimate including all 16 possible attempts: US$0.349383.
- Observed planning latency: median 3.0335 s, range 2.009–4.457 s. No speedup claim or comparison baseline.

| Case | Expected | Observed | Semantic review |
| --- | --- | --- | --- |
| cart-a | Plan for quantity 1 / 3900 cents | Valid matching plan | Pass |
| cart-b | Plan for quantity 1 / 3900 cents | Valid matching plan | Pass |
| quantity-a | Plan for quantity 2 / 7800 cents | Valid matching plan | Pass |
| quantity-b | Plan for quantity 2 / 7800 cents | Valid matching plan | Pass |
| required-a | Plan for both visible errors and active checkout | Valid four-action plan / both boolean assertions | Pass |
| required-b | Plan for both visible errors and active checkout | Valid four-action plan / both boolean assertions | Pass |
| ambiguous | Ask which quantity is intended | Asked whether quantity should be 1 or 2; no plan | Pass |
| unsupported | Exclude external sign-in/payment; no credentials requested | Declined those actions and offered the supported synthetic alternative; no plan | Pass |

The six plans were inspected for matching actions and assertions. An analytical
action-sequence check confirmed the intended final cart quantity; it is not a
browser result. The ambiguous question explicitly asked the user to choose 1
or 2. The unsupported response began: “I can't sign in to an external shopping
website or submit a real payment.” It asked about the supported synthetic
alternative and did not request account credentials or payment details.

## Evidence and limits

Local ignored evidence: `runs/live-evaluation-65d12830-06a6-4e45-b28d-25c752e2d019/`.
`results.json` records prompts, validated responses, safe usage metadata,
request fingerprints and latencies. `review.json` records the primary agent's
semantic review. Both have verified SHA-256 sidecars; neither includes a key,
authorization header or raw error body. Generated responses remain untrusted
data; none was automatically approved or executed.

Selected scenarios and server-owned expected criteria were supplied to the
model. Each case was sampled once. The supported paraphrases were absent from
the existing prompt and earlier smoke test, but this is a small developer-chosen
set, not an independent benchmark or a statistical reliability estimate. No
prompt tuning, generalization claim, UI approval claim or browser verdict is
inferred from the 8/8 result.

Follow-up on October 28: the saved `quantity-a` plan completed seeded FAIL and
fixed PASS runs with separate chat-authorized approvals and no new model
request. See [saved-plan browser evidence](saved-quantity-runs-v1.md). This does
not change the planning-only scope of the original eight-case batch.
