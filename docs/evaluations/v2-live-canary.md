# V2 guarded Meta canary — October 31, 2026 (Asia/Singapore)

**Result:** one authorized real `muse-spark-1.3` Responses proposal completed
controlled local review, seeded-defect execution and a saved fixed rerun.
The [machine record](v2-live-canary.json) retains source, manifest, screenshot
and download hashes. Ignored private/operator material is not included.

## Admission and usage

The exact immutable body was counted at `/v1/responses/input_tokens` and sent
to `/v1/responses`. The restricted text-only profile forbids tools, media,
history, streaming, background work and response storage. Strict schema output,
low reasoning and a 4,096 output-token cap were accepted by the provider.
See the [source basis and conservative count inference](v2-responses-admission-basis.md).

The version-2 signed live ledger reserves US$0.05 before generation, journals
each attempt before dispatch and checks returned usage. It admits at most
3 proposals/code and 50 globally (US$2.50 reserved total), without refunds.
Count/profile errors, over-limit input, unavailable state or an accounting
violation prevent or durably block live admission. Mock version-1 state cannot
be silently migrated. Controlled mode disables v1 mutation/model routes.

| Measurement | Recorded result |
| --- | --- |
| Rendered input count | 1,996; allowed maximum 6,073 |
| Generation attempts | 1; no retry |
| Provider usage | 1,853 input + 2,758 output = 4,611 tokens |
| Estimated token cost | US$0.01403775 |
| Reservation retained | US$0.05 |
| Remaining capacity | 2 for this code, 49 globally |

The ledger MAC was verified in-process without printing its key. Token cost is
an estimate at the recorded Standard rates, not invoice/credit reconciliation
or an account-wide spending cap. No billing page or settings were changed.

## Source, review and execution

The synthetic requirement, outside the frozen holdout, was:

> SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted
> subtotal S$75.00 or more. Verify delivery when applying the coupon changes a
> cart's free-delivery eligibility.

Proposal `a18e3394-838c-4416-b4ef-1dcedf62a75e` generated three cases: eligibility
flips after discount, remains free, and remains paid. The agent inspected two
numeric-rule entries and accepted them as unchanged reference values (1,000
coupon basis points and a 7,500-minor-unit delivery threshold). Independent
reference policies were adopted; model-provided expected totals were not used
as the oracle.

The harness initially paused because it had unnecessarily expected no numeric
rule entries. After inspection, the **exact saved proposal receipt** was
restored in a fresh UI session for automated review and approval under the
user-authorized smoke. No second model request, human approval click or
uninterrupted live walkthrough is claimed. An earlier local Chromium launch
failure occurred before any Meta request or budget reservation; the successful
server required the established sandbox escalation, without relaxing runner
boundaries.

| Release pair | Candidate | Suite | Evidence |
| --- | --- | --- | --- |
| r1/r2 seeded | FAIL | FAIL | Eligibility-flip expected S$72.50, observed S$67.50; other cases stable |
| r1/r3 fixed | PASS, 3/3 cases | INCONCLUSIVE | Saved suite reused with fresh approval; no model call |

The fixed suite retains both declared gaps: the source omits the delivery fee
amount and discount rounding rule. Passing candidate observations do not erase
incomplete coverage. Run IDs and exact approval digests are in the machine
record; all twelve assertion screenshots and both manifest sidecars were
rehashed successfully. Desktop/mobile reports were visually inspected.

Exact authenticated downloads were also executed: the seeded Playwright export
against r2 exited 1 with the expected mismatch; the fixed export against r3
exited 0. The bug packet and both downloaded export hashes match the receipt.
Protected workbench reopening and downloads were browser-tested, including
saved access after proposal quota exhaustion. Reviewer codes remain in page
memory and private local files, never URLs, exports or committed evidence.

## Verification and limits

Typecheck, build, focused admission/operator/boundary tests (12/12), full unit
suite (78/78), safety (10/10), v1 UI (1/1) and v2 browser suite (10/10) passed.
After a small inspection-error sanitization change, its affected controlled UI
and runtime recheck passed 13/13; the full suites preceded that change. Browser
checks used the permitted local Chromium escalation. Logs remain ignored under
`test-results/meta-responses`.

This proves one real v2 integration and selected local browser behavior.
The frozen evaluation pack remains unused and awaits owner annotation review;
no broad reliability, independent security audit, hosted deployment or final
submission-readiness claim is made. No dependency, remote push or repository
visibility change occurred. The one-proposal live authorization is complete.
Next gates are owner annotation review, a separately bounded holdout evaluation,
independent review and managed-container/persistent-storage deployment.
