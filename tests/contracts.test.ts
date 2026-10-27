import assert from "node:assert/strict";
import test from "node:test";
import { fixturePlanFor } from "../src/planner.js";
import { validatePlan, validatePlannerResponse } from "../src/contracts.js";
import { PlanStore } from "../src/plan-store.js";
import { aggregate } from "../src/verdict.js";
import { getScenario, TARGET_REGISTRY_VERSION } from "../src/scenarios.js";

const baseline = getScenario("add-to-cart", "baseline");
const seeded = getScenario("quantity-update", "seeded-bug");
const fixed = getScenario("quantity-update", "fixed");
const required = getScenario("required-fields", "baseline");

test("fixture plans are covered and reject an external action", () => {
  const fixturePlan = fixturePlanFor(baseline);
  const quantityPlan = fixturePlanFor(seeded);
  assert.equal(validatePlannerResponse(fixturePlan).kind, "plan");
  assert.equal(validatePlannerResponse(quantityPlan).plan?.assertions.find((item) => item.predicate === "cart-total-minor-equals")?.expected, "7800");
  assert.throws(() => validatePlan({ ...fixturePlan.plan!, actions: [{ id: "escape", kind: "navigate", target: "https://example.com", value: null }] }), /invalid shape/);
  assert.throws(() => validatePlan({ ...fixturePlan.plan!, scenarioId: ["add-to-cart"] }), /supported scenario/);
  assert.throws(() => validatePlan({ ...fixturePlan.plan!, actions: [{ ...fixturePlan.plan!.actions[0], target: ["shop"] }] }), /invalid shape/);
  assert.throws(() => validatePlan({ ...fixturePlan.plan!, actions: fixturePlan.plan!.actions.filter((item) => item.kind !== "click") }), /requires shop navigation/);
  assert.throws(() => validatePlan({ ...fixturePlan.plan!, assertions: [{ ...fixturePlan.plan!.assertions[0], id: "../../escape" }, fixturePlan.plan!.assertions[1]] }), /invalid shape/);
  assert.throws(() => validatePlan({ ...quantityPlan.plan!, actions: quantityPlan.plan!.actions.map((item) => item.target === "quantity" ? { ...item, value: "1" } : item) }), /allowlist/);
  assert.throws(() => getScenario("quantity-update", "baseline"), /Unsupported/);
});

test("required-fields accepts only its ordered blank-checkout workflow", () => {
  const requiredPlan = validatePlannerResponse(fixturePlanFor(required)).plan!;
  assert.equal(validatePlan(requiredPlan).scenarioId, "required-fields");
  assert.throws(() => getScenario("required-fields", "fixed"), /Unsupported/);
  assert.throws(() => validatePlan({ ...requiredPlan, actions: requiredPlan.actions.slice(0, -1) }), /workflow/);
  assert.throws(() => validatePlan({ ...requiredPlan, actions: [requiredPlan.actions[0], requiredPlan.actions[1], requiredPlan.actions[3], requiredPlan.actions[2]] }), /workflow/);
  assert.throws(() => validatePlan({ ...requiredPlan, actions: [...requiredPlan.actions, { id: "fill-quantity", kind: "fill", target: "quantity", value: "1" }] }), /workflow/);
  assert.throws(() => validatePlan({ ...requiredPlan, assertions: [{ ...requiredPlan.assertions[0], expected: "false" }, requiredPlan.assertions[1]] }), /boolean assertions/);
  assert.throws(() => validatePlan({ ...requiredPlan, assertions: [{ id: "cart-total", predicate: "cart-total-minor-equals", expected: "3900" }, requiredPlan.assertions[1]] }), /boolean assertions/);
});

test("approval is required, revision-bound, and consumed once", () => {
  const plan = validatePlannerResponse(fixturePlanFor(seeded)).plan!;
  const store = new PlanStore();
  const saved = store.create("Set quantity to two", seeded, plan);
  const changed = store.create("Set quantity to two", fixed, validatePlannerResponse(fixturePlanFor(fixed)).plan!);
  assert.notEqual(saved.digest, changed.digest);
  assert.equal(saved.envelope.targetRegistryVersion, TARGET_REGISTRY_VERSION);
  saved.plan.actions[0].id = "mutated-return-value";
  assert.throws(() => store.consume(saved.id), /Approve/);
  store.approve(saved.id);
  assert.throws(() => store.approve(saved.id), /already approved/);
  assert.equal(store.consume(saved.id).envelope.scenario.revision, "seeded-bug");
  assert.throws(() => store.consume(saved.id), /already been used/);
});

test("a known failure dominates incomplete evidence", () => {
  assert.equal(aggregate([{ id: "a", expected: "1", observed: "2", verdict: "FAIL", screenshot: "a.png" }, { id: "b", expected: "1", observed: null, verdict: "INCONCLUSIVE", screenshot: "b.png" }]), "FAIL");
  assert.equal(aggregate([{ id: "b", expected: "1", observed: null, verdict: "INCONCLUSIVE", screenshot: "b.png" }]), "INCONCLUSIVE");
  assert.equal(aggregate([{ id: "a", expected: "1", observed: "1", verdict: "PASS", screenshot: "a.png" }], false), "INCONCLUSIVE");
  assert.equal(aggregate([{ id: "a", expected: "1", observed: "2", verdict: "FAIL", screenshot: "a.png" }], false), "FAIL");
});
