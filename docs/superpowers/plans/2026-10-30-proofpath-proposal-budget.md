# V2 proposal-budget implementation plan

This local-only slice protects the mocked V2 provider path. It reserves a fixed
US$0.05 before dispatch, retains reservations for failures and retries, limits
each approved reviewer code to three reservations and the ledger to fifty. It
does not enable Meta dispatch, host reviewer access, issue codes, inspect keys,
or change fixture behaviour.

The ledger uses authenticated durable state, an exclusive directory owner lock,
atomic writes, and attempt records written before each mocked provider attempt.
It fails closed for missing/corrupt state, an existing/stale lock, altered
policy, unavailable test-only input admission, and persistence failure. A restart
marks in-flight records interrupted without refunding quota.

The HTTP integration is test-only and requires an allowlisted bearer code plus
an injected accounting certificate tied to the exact immutable request JSON.
The browser fixture route stays unauthenticated. V1 model routes are deliberately
outside this ledger; a future public host must disable or separately guard them.

Validation covers authenticated reviewer identity, preflight before inspection,
reservation-before-fetch, retry journaling, no quota recovery after failures or
restart, malformed/tampered state, exclusive ownership, certificate bounds, and
fixture compatibility. A real billable Chat Completions input measurement and
production reviewer code/bootstrap wiring remain blocking future work.

## Implemented boundary

- `ReviewerCodeRegistry` authenticates a bearer code against a trusted HMAC
  allowlist. It copies its inputs and returns an immutable, registry-owned
  principal; HTTP callers cannot select a reviewer ID or supply cost metadata.
- `ProposalBudgetLedger.initialize` is explicit and refuses existing budget
  artifacts. `open` requires valid state and an anchor. Policy, rate snapshot,
  reservation IDs, amounts, attempt ordering, timestamps and derived per-code
  and global counts are validated under the state's MAC.
- The directory has one exclusive owner across processes. Queued mutations
  validate disk/ownership before proceeding. Writes use file sync, atomic rename
  and directory sync before returning permission to dispatch. A failed write
  blocks subsequent admission, and close rejects new mutations before draining.
- `BudgetedMockProposalService` freezes a copied context/request before awaiting
  the server-injected test meter. It checks the exact request digest, model,
  certificate shape/age and integer cost bound before reserving. No byte-based
  accounting or production certificate source is available.
- The dispatcher awaits a durable attempt record immediately before each mock
  fetch. Journal failures are fatal rather than transient provider retries.
  Success, clarification, invalid output, timeout and uncertain failures retain
  the whole reservation. Completed/interrupted records cannot resume dispatch.
- The HTTP proposal route authenticates and checks available quota before
  inspection, rechecks quota atomically on reservation, and uses the controlled
  branch without fixture fallback. Conflicting proposer/service injections are
  rejected. Other fixture routes and the v1 owner path retain their prior scope.

## Verified October 30

`pnpm typecheck`, `pnpm build`, 11 focused budget tests, 20 planner/runtime tests,
`pnpm test` (66 tests), `pnpm test:v2:browser` (9 tests), and
`git diff --check` passed. Focused tests overlap the full unit suite; these are
not independent sample counts. No permissions-based fault test was skipped.

Adversarial checks include concurrent quota admission, all 50 global
reservations, signed malformed/over-limit state, missing files, stale locks,
cross-process ownership and crash-left locks, both retry journals, failed writes
before and after transport, principal/source mutation and malformed/absent
admission. HTTP checks cover 401/429/503 behavior, strict public bodies,
persisted mock provenance and rejection without fallback. The v2 browser suite
still exercises default fixture proposals and exact downloaded r2/r3 exports.

The [budget verification record](../../evaluations/v2-proposal-budget-readiness.json)
contains policy and source hashes. Test ledger directories and synthetic keys
are ephemeral. No production key/code setup, real token measurement, live model
call, public exposure or deployment is claimed. Delegated planning and initial
implementation were followed by primary-agent hardening and validation after
the implementation lane exhausted workspace credits.
