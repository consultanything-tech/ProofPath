import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { createV2Context, type ReviewDecision, type V2Context } from "../src/v2-checkout.js";
import {
  buildMetaSuiteRequest,
  compileReviewedSuite,
  createV2Planner,
  inspectRegisteredTarget,
  validateSuiteProposal
} from "../src/v2-planner.js";

function validProposal(context: V2Context) {
  return {
    kind: "proposal",
    requirement: context.requirement,
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

function completeReview(context: V2Context): ReviewDecision {
  return {
    decisions: context.requirement.criteria.map((criterion) => ({
      criterionId: criterion.id,
      interpretation: criterion.normalizedRule,
      scope: "unchanged",
      adoptedReferenceIds: ["checkout-reference-v2"],
      acceptedGaps: criterion.id === "cart" ? ["Quantity-rejection feedback is not observed in the registered initial state."] : []
    }))
  };
}

async function availablePort() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

async function target() {
  const port = await availablePort();
  const instance = createProofPathServer(port, createPlanner({ PLANNER_MODE: "fixture" }));
  await new Promise<void>((resolve) => instance.server.listen(port, "127.0.0.1", resolve));
  return { ...instance, close: async () => { instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve())); } };
}

test("suite request carries source and bounded capabilities without a release verdict or expected-result recipe", () => {
  const context = createV2Context();
  const request = buildMetaSuiteRequest({ ...context, requirement: { ...context.requirement, originalText: "Assess the candidate checkout without changing candidate wording." } }) as { max_completion_tokens: number; messages: { role: string; content: string }[] };
  assert.equal(request.max_completion_tokens, 4096);
  const payload = JSON.parse(request.messages[1]!.content);
  assert.equal(payload.source.originalText, "Assess the candidate checkout without changing candidate wording.");
  assert.deepEqual(payload.releases, [{ label: "release-a" }, { label: "release-b" }]);
  assert.equal(JSON.stringify(payload).includes("expectedTotal"), false);
  assert.equal(JSON.stringify(payload).includes("7700"), false);
  assert.equal(JSON.stringify(payload).includes("defect"), false);
  assert.equal(JSON.stringify(payload).includes("save10-discount"), false);
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
  assert.throws(() => compileReviewedSuite(proposal, { decisions: review.decisions.map((decision) => ({ ...decision, adoptedReferenceIds: ["another-policy"] })) }, context), /reference policy/i);
});

test("readonly inspection fetches only registered resources and labels later controls declared", async () => {
  const instance = await target();
  try {
    const context = createV2Context(instance.origin);
    const grounding = await inspectRegisteredTarget(context);
    assert.deepEqual(grounding.releases.map((release) => release.id), ["r1", "r2"]);
    assert.ok(grounding.observedTargets.includes("checkout"));
    assert.ok(!grounding.observedTargets.includes("contact"));
    assert.ok(grounding.declaredTargets.includes("contact"));
  } finally {
    await instance.close();
  }
});

test("fixture is explicit and mocked Meta transport is bounded and fails closed", async () => {
  const context = createV2Context();
  let calls = 0;
  const fixture = createV2Planner({ V2_PLANNER_MODE: "fixture" }, async () => { calls += 1; throw new Error("must not call"); });
  assert.equal((await fixture.propose(context)).kind, "proposal");
  assert.equal(calls, 0);
  assert.throws(() => createV2Planner({ PLANNER_MODE: "fixture" }), /V2_PLANNER_MODE/i);
  assert.throws(() => createV2Planner({ V2_PLANNER_MODE: "meta" }), /disabled/i);
  const mocked = createV2Planner({ V2_PLANNER_MODE: "mock" }, async (_url, init) => {
    calls += 1;
    assert.equal(init?.method, "POST");
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
