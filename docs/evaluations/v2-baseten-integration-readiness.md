# Baseten V2 integration readiness — October 31, 2026 (SGT)

The V2 backend and controlled workbench are implemented and verified with
mocked providers. **Live Baseten compatibility remains unverified.** Pankaj
confirmed account/credit readiness; ProofPath's ignored `.env` still has no
`BASETEN_API_KEY`. The local preflight reports `missing-BASETEN_API_KEY` and zero
generation requests. No key was retrieved, actual operator state migrated,
existing server stopped, billing changed, or Baseten call made.

## Implemented behavior

- Startup selects Meta or Baseten; HTTP clients cannot choose a provider,
  endpoint or model. Controlled modes disable V1 mutation/model bypasses.
- Baseten pins `meta-models/muse-spark-open-1026` and Responses, one attempt,
  4,096 output tokens, text only, no tools/history/media/stream/background work.
  Bounded responses, generic errors and redirect rejection protect credentials.
- JSON schema and existing V2 semantics are validated locally. Baseten's
  [Muse documentation](https://docs.baseten.co/inference/structured-outputs.md)
  explicitly says schema guidance is accepted without enforcement. Valid usage
  is journaled before rejecting a model/content mismatch. No retry or fallback.
- `pnpm baseten:preflight` reads exact-model metadata and probes input counting
  for a fixed synthetic non-holdout requirement. It never generates or opens a
  ledger. Success explicitly reports `modelGenerationVerified: false`.
- Each product proposal counts the exact serialized body before reservation.
  Rates must not exceed US$1.25/M input and US$4.25/M output. The admission cap is
  at most 26,073 input tokens, further reduced by the verified context length
  minus the output cap and by reservation arithmetic. Full uncached rates are
  used. Returned model identity, integer usage and output limits are checked.
- A signed v3 ledger shares 3/code, 50 global, US$0.05/proposal and US$2.50 total
  across providers, with no refunds. Global uncertainty blocks other-provider
  attempts too. Authenticated reports/downloads remain usable after exhaustion.
- Explicit migration retains the old signed Meta source, reviewer code and
  consumed reservations. It syncs a private staging directory, verifies the
  imported prefix, atomically publishes v3, and publishes retirement. Verified
  published-but-unretired state can resume; unpublished staging is retained.
  Crash-left locks require investigation and are never silently deleted.
- Review, exact one-use approval, oracle execution and saved fixed reuse remain
  separate. Provenance identifies Baseten-hosted Meta and local enforcement.

## Evidence

Build/typecheck passed. Focused adapter/preflight/accounting/migration boundaries
passed **26/26**. Full unit checks passed **121/121**; the result includes two
unchanged V1 scaffold tests owned by the coordinating chat. Final V2 Chromium
regressions passed **11/11**, including the mocked Baseten protected workbench,
review/approval/run, saved reuse, provenance, downloads and exhausted-quota reads.
Earlier safety/V1/V2 browser checks passed **22/22**. These are local/mocked
provider results, not a live Baseten response or hosted service.

Migration tests include config, ledger, receipt, verified-stage, published,
before-retirement and retired logical fault phases; filesystem failures cover
durable latches and retained ownership. This is not physical power-loss testing.
Read-only final code review found no remaining code blocker; stale README/env
instructions were corrected. This is not a production security audit.

Both direct Meta request hashes match the recorded reference context. Six
other-chat V1 scaffold code/test files remain byte-identical; README and
`.env.example` were intentionally reconciled under this chat's documentation
ownership. Historical offline qualification and Meta canary records are
unchanged. Current source/log hashes are in the [machine record](v2-baseten-integration-readiness.json).

## Remaining gates

1. Add the key locally to the existing ignored `.env`; preserve `MODEL_API_KEY`.
   Follow [README setup](../../README.md#controlled-local-v2-baseten-readiness).
2. Run preflight. The candidate
   `https://inference.baseten.co/v1/responses/input_tokens` is **not established**
   by the reviewed [public Responses reference](https://docs.baseten.co/reference/inference-api/responses.md).
   It may be unsupported. Metadata permissions for the special key are also
   unverified. Failure means stop before migration/generation; no token heuristic
   or automatic budget expansion is permitted. Seek an authoritative count or
   verified conservative endpoint ceiling; a larger bound requires separate
   explicit spend approval and implementation review.
3. After readiness passes, inspect retained state, cleanly stop the old owner,
   and explicitly migrate. Verify the existing one consumed reservation,
   US$0.05 retained, 2 proposals remaining for the original code and 49 globally.
   These are the last known expected values, not a fresh production-state audit.
4. Resolve grant expiry/overage facts and the concrete live-call authorization.
   Make at most one bounded synthetic non-holdout proposal, then review actual
   output before approval/execution and saved fixed reuse. Record real identity,
   usage, evidence and the retained reservation. US$5 is not approved.

Frozen holdout annotations remain untouched pending owner review. No deployment,
remote push, public repository visibility change or billing operation occurred.
