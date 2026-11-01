# Baseten email-route access smoke — November 1, 2026 (SGT)

**The email's Chat Completions route returned a real response from the exact
hackathon model.** This is access evidence for one literal greeting, not a
ProofPath QA proposal or a completed backend integration.

At the user's explicit request to try the email flow, sent one request to
`https://inference.baseten.co/v1/chat/completions` using
`meta-models/muse-spark-open-1026` and one user message, `Hello!`. No SDK or
production dependency was added. The existing ignored local key was used;
the one-time retrieval link was not reopened.

The request added `max_tokens: 256`, `truncate_prompt_tokens: 64` and
`stream: false`. Based on the public Chat/reference and reasoning documentation,
the preparation assumed a full prompt cap of 64 and completion cap of 256,
including reasoning. At pinned rates, that suggested US$0.001168. A private
exclusive one-use journal retained that reservation before dispatch, with no
retry or fallback. Offline mocked checks covered the fixed body, success,
duplicate refusal, cap-breach usage retention and sanitized HTTP diagnostics.

## Observed result

The response passed the transport-success check and contained the exact
returned model identifier, `meta-models/muse-spark-open-1026`, and valid usage:

| Counter | Tokens |
| --- | ---: |
| Prompt | 147 |
| Completion | 27 |
| Total | 174 |

At catalog rates of US$1.25/M prompt and US$4.25/M completion, the estimated
token cost is **US$0.0002985**, or US$0.000299 rounded up to a micro-dollar.
This remains below both the prepared reservation and US$0.05 ceiling.

However, reported prompt usage **147 exceeded the requested truncation value
64**. The runner journaled valid usage and exact model identity, then stopped
with `unsafe-usage`. It did not retain the final greeting, finish reason,
reasoning text or full provider response. No second request was made.

The documentation-led assumption that this setting bounds the entire billable
prompt was therefore not established by the actual grant response. Whether
Baseten applies the limit before adding other prompt material, or handles it
another way, remains unresolved. Do not infer an exact overhead from one sample
or use this setting as ProofPath's QA cost-admission proof.

## Consequence

The prior management-API 403 and count-route 404 did not establish an inability
to call the email's Chat Completions endpoint. One real response now verifies
that access path. The existing V2 backend still uses provisional Responses and
needs a source-backed Chat adaptation and appropriate input accounting before
reviewer enablement. Strict local schema/semantic review and exact-source
approval requirements remain unchanged.

No QA source, frozen holdout, reviewer budget, Meta reservation, actual ledger
migration, billing setting or application runtime was changed. The smoke lock
and retained journal remain in ignored `runs/baseten-email-smoke/`; do not delete
or reuse them to obtain another attempt. The [sanitized machine record](baseten-email-chat-smoke-2026-11-01.json)
contains request/result facts and private-artifact hashes, never credentials.

Sources: the user-supplied award email; [Chat Completions reference](https://docs.baseten.co/reference/inference-api/chat-completions);
[reasoning and output-token accounting](https://docs.baseten.co/inference/model-apis/reasoning).
