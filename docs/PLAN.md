# ProofPath MVP plan

## Outcome

Prove that a small team can turn a written checkout expectation into a reproducible browser finding with evidence. The demo must show a seeded defect, its evidence-backed failure, a developer fix, and a successful rerun.

Budget: one developer, 3–4 focused hours daily, approximately 27–36 hours across the nine build days. If one complete journey is not working by October 29, cut optional visual interpretation and interface polish before expanding scope.

## Demo journeys

The controlled demo shop has one product: Desk Lamp at S$39. There is no tax, shipping, coupon, or real payment flow.

| Journey | Request and expected result |
| --- | --- |
| Add to cart | Add one Desk Lamp; the cart shows quantity 1 and total S$39. |
| Quantity update | Change the Desk Lamp quantity from 1 to 2; the expected total is S$78. The seeded state keeps the total at S$39, producing a cited `FAIL`; the fixed state shows S$78 and produces `PASS`. |
| Required checkout fields | Try to continue with required checkout fields blank; visible validation prevents submission and no payment is attempted. |

## Execution boundary

The Meta model proposes a list of semantic actions and assertions. Validate that output against a constrained schema; reject arbitrary JavaScript, shell commands, and unsupported actions. The runner permits only allowlisted actions and cannot start until a human approves the plan. Block browser requests outside the controlled origin before sending them, including redirect destinations. There are no browser side effects before approval and no autonomous fixes.

Playwright captures the URL, DOM values, timestamps, and screenshots for each assertion. Deterministic comparisons decide totals and other factual checks. The model may explain evidence linked to the assertion but cannot change its result. Missing, ambiguous, or conflicting evidence is `INCONCLUSIVE`.

## Build gates

The user chose to wait for the permitted coding start on October 26. The October 27 kickoff transcript confirmed that hacking starts after kickoff, which ends at about 00:23 SGT; the gate is now cleared. Record the first functional code boundary in `BUILD_LOG.md`. An explicitly labelled fixture slice can establish local mechanics while live setup is pending. Before claiming Meta integration, make one real call using the exact eligible Meta model/API. Record the model, request, validated response, and limitations. Confirm a public repository and one deployment path are feasible, keep credentials in ignored local files, and confirm credit/payment-card/spend-limit status. Screenshot interpretation is optional: if it is not proven by the first live call, use DOM and screenshot artifacts without model vision.

On 26 October 2026, the signed-in Meta Billing page showed $150 free credits in use and a $0 balance. It also showed no payment method on file. The participant already submitted the claim; no duplicate is needed. The guide requires a credit card to use the credits for API calls. A spending email alert is not a verified hard cap. Free-credit content may be used for product improvement: use synthetic test data only. No live model call had been made at that inspection. On October 27 an authorized real add-to-cart planning request and its chat-authorized local browser execution passed; see BUILD_LOG for the exact evidence and limitations.

The [PRD](PRD.md) and [development kit](DEVELOPMENT_KIT.md) refine this plan with contracts, evaluation gates, and the 27-hour schedule. Model `muse-spark-1.3` and the Chat Completions endpoint are documented candidates verified in official docs; basic account-level planning access and the initial eight-case selected-scenario evaluation are verified; broader language reliability remains open.

## Schedule

The guide lists the building period as 27 October–4 November ET. Planning documents predate the event; distinguish them from functional code and disclose any prior work used. The kickoff confirmed functional work starts after its close at about 00:23 SGT on October 27.

| Date (SGT) | Deliverable |
| --- | --- |
| Oct 26 | Documentation-only base. |
| Oct 27 | Rules, access, credit, deployment, and live-model gates. |
| Oct 28–29 | Controlled checkout and one complete generated-and-approved journey. |
| Oct 30–31 | Remaining journeys, evidence capture, and verdict reporting. |
| Nov 1 | Three-run broken-to-fixed reliability check. |
| Nov 2 | Deploy and have one independent user attempt the demo. |
| Nov 3 | Public-link audit and a three-minute video draft. |
| Nov 4 | Final checks and submission, 2:00–5:00 PM SGT; finish by 5:00 PM. |

The stated deadline, 4 November at 9:00 PM ET, is 5 November at 10:00 AM SGT. The 5:00 PM November 4 submission target leaves a 17-hour buffer.

Calendar blocks are confirmed for 7:00–10:00 PM SGT daily from October 27 through November 3, then 2:00–5:00 PM on November 4: 27 working hours in total. Each block includes a concrete deliverable and a 15-minute reminder. The earlier November 4 slot avoids an existing evening commitment.

Kickoff is confirmed for October 27 at 00:00 SGT by the [October 26 Discord announcement](https://discord.com/channels/1557169028080869426/1557169028626251801/1564221713284071557). The kickoff transcript confirms functional work starts after the session closes at about 00:23 SGT on October 27.

## Acceptance checks

- Each of the three journeys runs from request through an approved plan and report.
- Invalid model output never reaches Playwright.
- No browser action starts before approval; non-allowlisted navigation is rejected.
- Each assertion records expected value, observed value, verdict, and evidence reference.
- The seeded total defect fails three consecutive runs; the fixed state passes three consecutive runs.
- Missing or conflicting evidence becomes `INCONCLUSIVE`.
- A fresh viewer can reproduce the state using the report’s replay steps.
- The public repository, deployed demo, and video work in a logged-out browser before submission.
- The README and build log distinguish prior experience from work made during the event.

## Rubric and video

Show the impact as reproducible QA evidence from ordinary acceptance criteria. Show Meta’s material role with the actual constrained plan and linked explanation. Show technical depth through validation, approval, origin restriction, deterministic assertions, and evidence provenance.

For the three-minute video: introduce the checkout problem (0:00–0:20); show the model plan and approval (0:20–0:45); run the broken state and inspect evidence (0:45–1:35); show the fix and green rerun (1:35–2:15); show the execution boundary or inconclusive handling (2:15–2:40); close with measured benefit and the new work (2:40–3:00).

## Deliberate cuts

Do not add arbitrary-site execution, multiple providers, browser matrices, login, team accounts, stored suites, self-healing locators, automatic source changes, real transactions, or visual analysis that fails the first-day gate.
