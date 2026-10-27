# Saved Meta quantity plan: seeded/fixed execution v1

On October 28, 2026 (Asia/Singapore), the exact saved `quantity-a` response
from [live evaluation v1](live-results-v1.md) completed two local Chromium runs:

| Revision | Expected quantity / total | Observed quantity / total | Verdict |
| --- | --- | --- | --- |
| `seeded-bug` | 2 / S$78 | 2 / S$39 | FAIL |
| `fixed` | 2 / S$78 | 2 / S$78 | PASS |

The original requirement, actions, assertions and Meta provenance were identical.
Only the server-owned scenario revision and its replay description changed.
This selects an existing fixed fixture; no application defect was repaired in
this verification step. A temporary fixture-mode server on `127.0.0.1:3001`
served the synthetic checkout; the harness reused a previously returned Meta
plan and did not invoke either planner. **Zero new model requests or API spend.**
The temporary server was stopped afterward; local `.env` was not changed.

## Approval and evidence

The user instructed “proceed to the next step” after this demonstration was
proposed. Separate approvals were recorded programmatically from that chat
authorization, each immediately consumed once. No human UI approval click is
claimed. Pre-approval consumption and second consumption were rejected for each
run. The seeded envelope reproduced its original evaluation digest; the fixed
envelope had a different digest because the revision is bound to approval.

| Revision | Run ID | Approval digest |
| --- | --- | --- |
| Seeded | `693b4ad3-1a2c-45b5-aa0f-0a57cfae0778` | `sha256:43e7e5ec1efbf58ab58c0ec28bb6926d7fa287e170bbe24f8fb5f7d761a66d05` |
| Fixed | `37668def-4602-49b9-a7be-f951f54748fd` | `sha256:e219d9a7c8899ad83385619892ddaca08bcadbb8272eb37fe17c3c19c4a157d5` |

Local ignored comparison evidence:
`runs/saved-quantity-pair-e56f453f-7592-49ab-af15-337dbf66b506/comparison.json`.
Each run directory includes a manifest, assertion screenshots, SHA-256 sidecars
and `approval-source.json`. Source evaluation hash and planner source/runtime
hashes matched the original batch. Screenshot and manifest hashes and comparison
sidecar were verified. Visual review confirmed quantity 2 with S$39 versus S$78.

Source evaluation SHA-256:
`735e0eb6ac74c3eadaacef8918941ea958adae22a3dbeeae942dc0fd5eb73978`.
Saved validated plan SHA-256:
`7a305c12fd860168f2d65594d7a534cfe7ead4c5a93813cea1061a2fc16e7174`.

An initial restricted-shell attempt could not launch Chromium because macOS
denied its Mach-port registration. Run
`1b3754b7-67b7-4d3b-9798-44a68211aad9` was preserved as failed execution with
INCONCLUSIVE assertions and no screenshots. The harness then stopped on its
missing-screenshot self-check. The successful pair used a fresh process and
approvals with permission to launch local Chromium. This was an infrastructure
failure, not a discarded semantic or assertion failure.

## Limits and next step

This verifies one saved model plan against two controlled fixture revisions.
It is not a new live proposal, a UI approval test, a general website test, a
reliability estimate or deployment proof. No production code changed; existing
passing unit/safety suites were not repeated. The temporary harness used
assert-based checks for source integrity, production contract validation,
approval behavior, exact URLs, expected observations and evidence hashes.

Next: make plan review and the result report readable for the demo, retaining
the exact approval snapshot and evidence links. The live-proposal UI approval
path, deployment limits and submission artifacts remain open.
