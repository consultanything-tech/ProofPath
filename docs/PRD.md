# ProofPath MVP PRD

**Version:** 0.1 (draft)  
**Date:** 26 October 2026, Asia/Singapore  
**Status:** implementation authorized after the October 27 kickoff; functional progress is recorded in `BUILD_LOG.md`; no live model call is evidenced

## Product decision

ProofPath turns one written checkout expectation into a bounded browser run and an
evidence-linked verdict. A Meta model proposes an allowlisted plan; a human
approves that exact plan; Playwright runs it only against a synthetic shop; and
deterministic checks decide `PASS`, `FAIL`, or `INCONCLUSIVE`.

The one MVP user is a developer or product owner who needs reproducible
acceptance evidence without writing a browser test. This is a controlled
checkout demo, not general web automation.

```text
requirement -> proposed plan -> approval -> bounded run -> evidence -> verdict
```

The model translates prose into a plan and may explain linked evidence. It does
not execute code, choose selectors, or determine a factual verdict.

## Scope

The synthetic shop has one product, **Desk Lamp**, at **S$39**. It has no
authentication, tax, shipping, coupon, payment processing, personal data, or
external services.

| Journey | User request | Expected deterministic result |
| --- | --- | --- |
| Add to cart | Add one Desk Lamp. | Quantity is `1`; total is `S$39`. |
| Quantity update | Change quantity from `1` to `2`. | Expected total is `S$78`. In `seeded-bug`, observed total remains `S$39`, so the run fails; in `fixed`, it passes. |
| Required checkout fields | Continue with required fields blank. | Validation is visible; checkout does not advance; no payment action exists. |

The fixed rerun keeps the requirement and candidate plan but changes the
scenario revision, so it needs a new approval. This makes the before/after
comparison explicit.

## User flow and states

1. The user selects a supported scenario and enters a specific requirement.
2. ProofPath requests a constrained Meta response and validates it fully.
3. A clarification response asks the user to edit and resubmit; there is no
   persistent chat or autonomous follow-up.
4. A valid plan displays actions and assertions for human review.
5. The user approves an immutable snapshot.
6. A fresh browser context executes only that snapshot.
7. The report shows every assertion, observed value, URL, timestamp,
   screenshot reference, replay steps, and overall verdict.

Approval review shows the original requirement beside normalized expected values;
reject or clarify an interpretation that changes the user’s meaning. Completed
reports must keep prior runs intact and link the fixed rerun to the failed run.

Required UI states: requirement entry, planning, clarification required,
invalid model response, proposed plan, approved plan, running, report, and
blocked safety action.

## Product requirements

### Planning and approval

- A response is either a clarification or a plan; it cannot contain both.
- A valid plan has at least one deterministic assertion and covers every
  selected-scenario requirement predicate.
- Each action uses a semantic target from ProofPath's target registry. The
  model never supplies selectors, JavaScript, raw URLs, headers, or credentials.
- The approval fingerprint covers the immutable original requirement, scenario
  ID and revision/fixture mode, plan, contract version, and target-registry
  version.
- Before execution, ProofPath revalidates the plan and requires the same
  fingerprint. A missing, expired, modified, or scenario-mismatched approval
  fails before browser launch.

### Execution, verdicts, and evidence

- The runner supports only `navigate`, `click`, and `fill` using allowlisted
  semantic targets and controlled same-origin routes.
- No action starts before approval and no action may purchase or leave the shop.
- Every assertion captures a screenshot and observation record.
- Any known failed deterministic assertion yields `FAIL`, even if another
  observation is unavailable.
- With no known failure, incomplete execution or missing, timed-out, ambiguous, or conflicting evidence
  yields `INCONCLUSIVE`.
- `PASS` requires at least one assertion and every assertion passing. A
  zero-assertion plan is rejected rather than passing vacuously.
- Model prose may annotate a report but may not add, remove, or change a verdict.

## Non-functional boundary

| Area | MVP rule |
| --- | --- |
| Model access | Server-side Meta Model API only. Documented candidate: Chat Completions at `https://api.meta.ai/v1/chat/completions` with `muse-spark-1.3`; not live-tested. |
| Data | Synthetic requirements and fixtures only. The dashboard says free-credit content may be used for product improvement; do not send private, client, or production data. |
| Browser | Fresh context per run; fixed timeouts and bounded retry; block downloads, popups, permissions, WebSocket and service-worker egress. |
| Network | Exact origin and route allowlist. Abort external redirects and subresources before they leave the browser. |
| Hosted use | Labelled, pre-recorded synthetic reports may be public. Public live runs stay disabled until the owner explicitly selects deployment, budget, and rate-limit policy. |
| Spend | Dashboard Spend Limit is an email notification, not a hard cap. Host ingress, concurrency, and API-budget limits are required before exposure. |

Keyboard users must be able to enter a requirement, review, approve and open
evidence; provide visible focus, labelled fields, textual verdicts (not colour
alone), and announced loading/error states.

## Submission and judging requirements

Submission is through the Cerebral Valley event platform. It must fit the Build
for Your World theme, reasonably use Meta Model API and/or eligible open weights,
disclose prior work, include a public GitHub repository, and include a narrated
three-minute demo. The participant guide names code, the demo,
and a working live product as judging artifacts; the reviewed form did not expose
a live-product URL field, so deployment remains an implementation gate rather
than an asserted form-field requirement. The final submission is due November 4 at 9:00 PM ET (November
5 at 10:00 AM SGT). The guide weights real-world impact 30%, Meta AI tooling 25%,
technical depth 20%, and demo quality 25%.

The Most Viral bonus prize is optional and requires an X post plus its URL in
the submission. It is not a core product requirement.

The form viewed on October 27 asks for team name and members, track and problem
statement, project description, public GitHub and demo video links, how Meta
products were used and why the models matter, and feedback on Meta and partner
technologies. It also has a permission checkbox for Meta and Cerebral Valley
to use and promote submitted materials. Track and problem statement were marked
required in the form; check the form again before submission for current fields
and requirements. No form fields or permission checkbox were submitted during
this review. Source: [participant guide and submission link](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details).

## Out of scope

Arbitrary URLs, login, production checkout, real payments, file uploads,
multi-user accounts, stored suites, cross-browser matrices, self-healing
selectors, automatic fixes, model-derived verdicts, and visual interpretation
not proven by a live smoke test are out of scope.

## Acceptance matrix

The matrix tracks implementation evidence; partial results are labelled as such.

| Area | Check | Required result | Status |
| --- | --- | --- | --- |
| Planner | Each supported journey | Covered plan with at least one assertion | Partial: fixture plans cover add-to-cart, quantity-update, and required fields; live Meta planning not implemented |
| Planner | Ambiguous request | Clarification; no plan or run | Not run |
| Planner | Login, payment, or external site | Rejection/clarification; no run | Not run |
| Validation | Unknown key/action/target, selector, JS, shell, or external URL | Rejected before browser launch | Partial: external action and missing required action coverage rejected |
| Approval | Run before approval or after plan/scenario change | Rejected; no run artefact | Partial: approval required and consumed once; scenario revision changes the digest; expiry/tamper not exercised |
| Origin | Redirect or resource leaves allowed origin | Aborted and reported | Not run |
| Verdict | All true / one false / missing observation | `PASS` / `FAIL` / `INCONCLUSIVE` | Local fixture PASS/FAIL and unit checks for missing/false markers and incomplete execution verified |
| Evidence | Each completed assertion | Expected/observed, timestamp, URL, screenshot reference and hashes | Verified locally for all three fixture journeys; see BUILD_LOG.md |
| Reliability | Seeded quantity three times | Three `FAIL`s observing `S$39` | Verified: three local runs; screenshot and manifest hashes matched |
| Reliability | Fixed quantity three times | Three `PASS`es observing `S$78` | Verified: three local runs; screenshot and manifest hashes matched |
| Review | Logged-out reviewer | Public source, demo, and video accessible | Not run |

Measure plan validity on six unseen paraphrases plus an ambiguous and an
unsupported request. Record observed counts and planning/run latency; do not
claim time savings or general reliability without a measured baseline.

## Current gates and sources

- The [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details)
  requires Meta tooling, a public repository, live product, and a three-minute
  demo video. It says a payment method is needed for API calls.
- The [Meta quickstart](https://dev.meta.ai/docs/quickstart) documents the
  candidate endpoint/model. The
  [structured-output guide](https://dev.meta.ai/docs/structured-output) documents
  JSON Schema constrained output.
- On 26 October, billing visibly showed `Free credits in use $150.00`, balance
  `$0.00`, and no payment method. Credits are provisioned; live calls, payment
  readiness, spend control, and model behavior are unverified.
- Kickoff was announced for 27 October 00:00 SGT
  [in Discord](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557).
  The kickoff notes and transcript say the 10-day hack starts after kickoff and
  close with “happy hacking” at about 00:23 SGT. That confirms the start gate;
  see `BUILD_LOG.md` for the boundary and the disclosure of pre-event planning.

