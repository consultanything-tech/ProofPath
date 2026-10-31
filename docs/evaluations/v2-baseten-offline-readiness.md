# Baseten V2 offline qualification — October 31, 2026 (SGT)

Scope: the accepted offline slice of the
[coordinated plan](../superpowers/plans/2026-10-31-proofpath-baseten-integration.md).
The intended result is a provisional request/parser and mocked admission harness,
not proof of grant access, real provider behavior or product HTTP integration.

## Contract and evidence boundaries

Baseten's [structured-output documentation](https://docs.baseten.co/inference/structured-outputs.md)
says Muse Spark Open accepts `json_schema` without enforcing it. The harness must
validate both the local schema and the existing V2 semantics before producing a
prepared proposal. Schema guidance is not provider-enforced structured output.
The provisional model string remains `meta-models/muse-spark-open-1026`, based on
the previously reviewed award email; its actual protocol/alias permissions are
unverified. The public [Responses reference](https://docs.baseten.co/reference/inference-api/responses.md)
is protocol documentation, not evidence that the special key accepts this body.

Only finite scripted mock outcomes are admitted in this slice. There is no
credential lookup, live request or production/server enablement. Synthetic
accounting values exercise the admission arithmetic and durable state machine;
they are not verified Baseten token counts, prices, grant balances or approved
money. The proposed US$5 remains unapproved for live spending.

The verified direct-Meta path, its retained reservation and private operator
state are separate. Qualification does not consume reviewer quotas or establish
provider-switching support. A future reviewer integration must preserve the
existing aggregate limits across providers; creating another ledger must not
multiply that capacity.

## Implemented interfaces

- `src/v2-baseten-planner.ts` constructs a deeply frozen provisional Responses
  body from the shared V2 source/capabilities/schema contract. Schema guidance
  is included in the developer prompt. Its bounded envelope parser checks local
  schema, existing semantic invariants, model/completion identity and integer
  usage; it returns no reasoning text.
- `src/v2-baseten-qualification.ts` accepts one snapshotted scripted response or
  scripted uncertainty. It has no callback transport, endpoint, key/environment
  lookup, product factory or server wiring. `createPrepared` preserves the
  original context and creates only a reviewable proposal; it never approves it.
- `src/v2-planner.ts` exposes pure shared prompt construction and schema checks.
  Existing direct-Meta request serialization is unchanged for the recorded
  reference context, verified against pre-refactor hashes.

The signed mock-only policy allows one reservation and one attempt. Its rates
(1,130 input and 4,170 output nano-USD/token), 16,000 synthetic input ceiling and
4,096 output cap reserve 35,161 synthetic micro-USD, rounded up. **Those rates and
input bounds are test data, not Baseten accounting evidence or spending
permission.** State includes the policy, exact request digest, retained amount,
attempt timestamp and safe usage. It never refunds or silently resets.

Valid usage is written before rejecting model identity or content. Uncertain or
invalid outcomes retain the reservation and close admission. Interrupted state
reopens blocked. If a write/integrity failure prevents a durable latch, closing
retains the owner lock so normal reopen cannot silently resume. That requires
explicit operator investigation; the test fixtures are disposable and are never
migrated into live state.

## Verification record

Focused Baseten checks passed **15/15**, including caller-mutation protection,
mandatory local schema/semantic rejection, usage-before-rejection, strict token
accounting, one-use review/approval provenance, concurrent admission, interruption,
signed malformed/tampered/missing state and actual filesystem write failures
before admission and after attempt journaling. Typecheck and build passed.
The full unit suite passed **95/95**, and local safety/V1/V2 browser regressions
passed **21/21**, with no skipped checks. A fresh read-only planning-agent review found no material offline-scope defect;
this is not an independent production security audit.

The [machine record](v2-baseten-offline-readiness.json) records final regression
counts, source/log hashes, the synthetic policy, unchanged Meta request hashes
and preserved other-chat scaffold hashes. The full unit suite includes the
other chat's unchanged, uncommitted V1 scaffold tests; that context is explicit
in the record. Production V2 Baseten mode still rejects configuration before
transport, including when a synthetic key and spy transport are supplied.

Existing Chromium regression tests verify the unchanged local V1/V2 behavior,
not a Baseten HTTP, live-model or hosted workflow. The first unit-suite launch
failed its embedded exported-browser tests under the shell sandbox; the suite
was rerun with the established Chromium escalation. No runner restriction was
relaxed. Raw logs remain ignored under `test-results/baseten-offline`.

## Next live gates

Confirm the exact grant model/protocol, rates, defensible input bound,
output/reasoning and usage semantics, expiry and overage behavior. Prepare a
restricted ignored secret destination before one-time retrieval. Obtain explicit
authorization for that action and one concrete bounded call. Then qualify a
non-holdout V2 proposal with explicit review, seeded execution and saved fixed
reuse. The frozen V2 evaluation remains unused pending owner annotation review.
No payment method, billing budget, key retrieval or live call is authorized by
this offline record.
