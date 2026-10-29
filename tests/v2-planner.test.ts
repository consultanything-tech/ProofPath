import assert from "node:assert/strict";
import test from "node:test";
import { createV2Context, deriveCaseInput, withSourceRequirement, type ReviewDecision, type V2Context } from "../src/v2-checkout.js";
import { calculateCheckout } from "../src/v2-oracle.js";
import {
  buildMetaSuiteRequest,
  compileReviewedSuite,
  createV2Planner,
  validateSuiteProposal
} from "../src/v2-planner.js";

function validProposal(context: V2Context) {
  return {
    kind: "proposal",
    requirement: proposalRequirement(context),
    cases: [
      {
        id: "save10-discount",
        criterionIds: ["coupon", "delivery"],
        category: "interaction",
        rationale: "Applies the reviewed coupon before checking discounted delivery.",
        actions: [
          { id: "open", kind: "open-app", target: "checkout", value: null },
          { id: "lamp", kind: "add-product", target: "desk-lamp", value: null },
          { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" },
          { id: "apply", kind: "apply-coupon", target: "coupon", value: null }
        ],
        assertions: [{ id: "total", predicate: "total-minor" }]
      },
      {
        id: "blank-contact",
        criterionIds: ["contact"],
        category: "negative",
        rationale: "Shows the reviewed blank required-field response.",
        actions: [
          { id: "open", kind: "open-app", target: "checkout", value: null },
          { id: "lamp", kind: "add-product", target: "desk-lamp", value: null },
          { id: "contact", kind: "open-contact", target: "contact", value: null },
          { id: "confirm", kind: "confirm-synthetic-order", target: "synthetic-order", value: null }
        ],
        assertions: [{ id: "errors", predicate: "contact-errors" }]
      }
    ],
    gaps: ["Quantity-rejection feedback is not observed in the registered initial state."]
  };
}

function proposalRequirement(context: V2Context, changes: readonly unknown[] = []) {
  return {
    version: "2",
    originalText: context.requirement.originalText,
    criteria: context.requirement.criteria,
    numericRuleChanges: changes,
    expectationScope: context.requirement.expectationScope,
    coverageGaps: []
  };
}

function completeReview(context: V2Context): ReviewDecision {
  return {
    decisions: context.requirement.criteria.map((criterion) => ({
      criterionId: criterion.id,
      interpretation: criterion.normalizedRule,
      scope: "unchanged",
      adoptedReferenceIds: ["checkout-reference-v2"],
      acceptedGaps: criterion.id === "cart" ? ["Quantity-rejection feedback is not observed in the registered initial state."] : [],
      acceptedNumericRuleChanges: []
    }))
  };
}


test("suite request carries source and bounded capabilities without a release verdict or expected-result recipe", () => {
  const context = createV2Context();
  const request = buildMetaSuiteRequest({ ...context, requirement: { ...context.requirement, originalText: "Assess the candidate checkout without changing candidate wording." } }) as { max_completion_tokens: number; messages: { role: string; content: string }[]; response_format: { json_schema: { schema: Record<string, unknown> } } };
  assert.equal(request.max_completion_tokens, 4096);
  const payload = JSON.parse(request.messages[1]!.content);
  assert.equal(payload.source.originalText, "Assess the candidate checkout without changing candidate wording.");
  assert.deepEqual(payload.releases, [{ label: "release-a" }, { label: "release-b" }]);
  assert.equal(JSON.stringify(payload).includes("expectedTotal"), false);
  assert.equal(JSON.stringify(payload).includes("7700"), false);
  assert.equal(JSON.stringify(payload).includes("defect"), false);
  assert.equal(JSON.stringify(payload).includes("save10-discount"), false);
  const schema = request.response_format.json_schema.schema;
  assert.deepEqual(schema.required, ["kind", "requirement", "cases", "gaps"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(Array.isArray(schema.oneOf));
});

test("proposal validation derives action inputs and review requires every criterion", () => {
  const context = createV2Context();
  const proposal = validateSuiteProposal(validProposal(context), context);
  assert.equal(proposal.cases.length, 2);
  assert.throws(() => compileReviewedSuite(proposal, { decisions: [] }, context), /every criterion/i);
  assert.throws(() => validateSuiteProposal({ ...validProposal(context), cases: [{ ...validProposal(context).cases[0], actions: validProposal(context).cases[0].actions.slice(0, -1) }], gaps: [] }, context), /coupon.*applied/i);
  assert.throws(() => validateSuiteProposal({ ...validProposal(context), expectedTotalMinor: 7700 }, context), /invalid shape/i);
});

test("review cannot adopt contradictory policy and retains accepted coverage gaps", () => {
  const context = createV2Context();
  const proposal = validateSuiteProposal(validProposal(context), context);
  const review = completeReview(context);
  const suite = compileReviewedSuite(proposal, review, context);
  assert.deepEqual(suite.requirement.coverageGaps, proposal.gaps);
  assert.throws(() => compileReviewedSuite(proposal, { decisions: review.decisions.map((decision) => ({ ...decision, adoptedReferenceIds: ["another-policy"] })) }, context), /invalid shape|reference policy/i);
});

test("reviewed numeric coupon changes reach the oracle and compiled snapshot", () => {
  const base = createV2Context();
  const context = {
    ...base,
    requirement: {
      ...base.requirement,
      originalText: "SAVE10 discounts the cart subtotal by 20%.",
      criteria: base.requirement.criteria.map((criterion) => criterion.id === "coupon"
        ? { ...criterion, sourceQuote: "SAVE10 discounts the cart subtotal by 20%.", normalizedRule: "SAVE10 uses the reviewed 20% rate." }
        : criterion)
    }
  };
  const change = { criterionId: "coupon", field: "couponBasisPoints" as const, value: 2000, sourceQuote: "SAVE10 discounts the cart subtotal by 20%." };
  const proposal = validateSuiteProposal({ ...validProposal(context), requirement: proposalRequirement(context, [change]) }, context);
  const review: ReviewDecision = {
    decisions: completeReview(context).decisions.map((decision) => decision.criterionId === "coupon"
      ? { ...decision, interpretation: "SAVE10 uses the reviewed 20% rate.", scope: "new-or-changed", adoptedReferenceIds: [], acceptedNumericRuleChanges: [change] }
      : decision)
  };
  const suite = compileReviewedSuite(proposal, review, context);
  const couponCase = suite.cases.find((candidate) => candidate.id === "save10-discount")!;
  const expected = calculateCheckout(deriveCaseInput([...couponCase.actions], { ...context, rules: suite.rules }), suite.rules, context.catalog);
  assert.equal(suite.rules.couponBasisPoints, 2000);
  assert.deepEqual(suite.requirement.normalizedRules, suite.rules);
  assert.equal(expected.subtotalMinor, 4000);
  assert.equal(expected.discountMinor, 800);
  assert.equal(expected.deliveryMinor, 500);
  assert.equal(expected.totalMinor, 3700);
  assert.throws(() => compileReviewedSuite(proposal, { decisions: [] }, context), /every criterion/i);
  for (const acceptedNumericRuleChanges of [[{ ...change, value: 1500 }], [], [change, { ...change, field: "deliveryFeeMinor" as const, value: 600 }]]) {
    assert.throws(() => compileReviewedSuite(proposal, { decisions: review.decisions.map((decision) => decision.criterionId === "coupon" ? { ...decision, acceptedNumericRuleChanges } : decision) }, context), /exact numeric/i);
  }
  assert.throws(() => compileReviewedSuite(proposal, { decisions: review.decisions.map((decision) => decision.criterionId === "coupon" ? { ...decision, adoptedReferenceIds: ["checkout-reference-v2"] } : decision) }, context), /contradictory/i);
});

test("numeric rule proposals reject unsupported, ambiguous, and unsafe deltas", () => {
  const context = createV2Context();
  const quote = context.requirement.criteria.find((criterion) => criterion.id === "coupon")!.sourceQuote;
  const change = (field: string, value: number) => ({ criterionId: "coupon", field, value, sourceQuote: quote });
  for (const changes of [
    [change("couponCode", 1)],
    [change("couponBasisPoints", 2000), change("couponBasisPoints", 1500)],
    [change("couponBasisPoints", 10001)],
    [change("quantityMinimum", 0)],
    [change("deliveryFeeMinor", -1)],
    [change("deliveryFeeMinor", Number.MAX_SAFE_INTEGER)]
  ]) assert.throws(() => validateSuiteProposal({ ...validProposal(context), requirement: proposalRequirement(context, changes) }, context), /rule|range|unsafe|domain/i);
  const cartQuote = context.requirement.criteria.find((criterion) => criterion.id === "cart")!.sourceQuote;
  assert.throws(() => validateSuiteProposal({ ...validProposal(context), requirement: proposalRequirement(context, [
    { criterionId: "cart", field: "quantityMinimum", value: 5, sourceQuote: cartQuote },
    { criterionId: "cart", field: "quantityMaximum", value: 1, sourceQuote: cartQuote }
  ]) }, context), /minimum/i);
});

test("fixture is explicit and mocked Meta transport is bounded and fails closed", async () => {
  const context = createV2Context();
  let calls = 0;
  const fixture = createV2Planner({ V2_PLANNER_MODE: "fixture" }, async () => { calls += 1; throw new Error("must not call"); });
  const fixtureProposal = await fixture.propose(context);
  assert.equal(fixtureProposal.kind, "proposal");
  assert.deepEqual(fixtureProposal.cases.find((candidate) => candidate.id === "delivery-total")?.criterionIds, ["coupon", "delivery"]);
  assert.equal(calls, 0);
  assert.throws(() => createV2Planner({ PLANNER_MODE: "fixture" }), /V2_PLANNER_MODE/i);
  assert.throws(() => createV2Planner({ V2_PLANNER_MODE: "meta" }), /disabled/i);
  const mocked = createV2Planner({ V2_PLANNER_MODE: "mock" }, async (_url, init) => {
    calls += 1;
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    return new Response(JSON.stringify({ model: "muse-spark-1.3", choices: [{ message: { content: JSON.stringify(validProposal(context)) }, finish_reason: "stop" }] }));
  });
  assert.equal((await mocked.propose(context)).kind, "proposal");
  assert.equal(calls, 1);
  const invalid = createV2Planner({ V2_PLANNER_MODE: "mock" }, async () => new Response(JSON.stringify({ choices: [] })));
  await assert.rejects(invalid.propose(context), /invalid|unexpected/i);
  const clarification = validateSuiteProposal({ ...validProposal(context), kind: "clarification", cases: [] }, context);
  assert.throws(() => compileReviewedSuite(clarification, completeReview(context), context), /Clarifications/i);
  let retries = 0;
  const retried = createV2Planner({ V2_PLANNER_MODE: "mock" }, async () => {
    retries += 1;
    return retries === 1
      ? new Response("busy", { status: 503 })
      : new Response(JSON.stringify({ model: "muse-spark-1.3", choices: [{ message: { content: JSON.stringify(validProposal(context)) }, finish_reason: "stop" }] }));
  });
  assert.equal((await retried.propose(context)).kind, "proposal");
  assert.equal(retries, 2);
  const oversized = createV2Planner({ V2_PLANNER_MODE: "mock" }, async () => new Response("x", { headers: { "content-length": "65537" } }));
  await assert.rejects(oversized.propose(context), /size limit/i);
});

test("fixture links only source clauses exercised by its bounded actions and assertions", async () => {
  const context = withSourceRequirement(createV2Context(), "An invalid coupon must display an error. A coupon may be applied only once. Cart state persists after refresh. Delivery state persists after refresh. Contact state persists after refresh.");
  const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  assert.equal(proposal.kind, "proposal");
  assert.deepEqual(proposal.cases.map((candidate) => [candidate.id, candidate.criterionIds]), [["coupon-error", ["coupon"]]]);
  assert.deepEqual(proposal.gaps, [
    "Uncovered criterion coupon-2: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion cart: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion delivery: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion contact: Fixture actions and assertions do not exercise this source clause."
  ]);
});

test("fixture recognizes only complete known clauses and leaves unsupported variants uncovered", async () => {
  const context = withSourceRequirement(createV2Context(), "Cart total must match unit prices. Cart total must persist after refresh. SAVE10 applies the reviewed discount. SAVE10 discount must persist after refresh. Cart total must not match unit prices. Cart total must match unit prices after refresh.");
  const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  assert.equal(proposal.kind, "proposal");
  assert.deepEqual(proposal.cases.map((candidate) => [candidate.id, candidate.criterionIds]), [
    ["cart-total", ["cart"]],
    ["delivery-total", ["coupon"]]
  ]);
  assert.deepEqual(proposal.gaps, [
    "Uncovered criterion cart-2: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion coupon-2: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion cart-3: Fixture actions and assertions do not exercise this source clause.",
    "Uncovered criterion cart-4: Fixture actions and assertions do not exercise this source clause."
  ]);
});
