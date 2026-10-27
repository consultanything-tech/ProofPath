export const CONTRACT_VERSION = "1" as const;

export type Action = {
  id: string;
  kind: "navigate" | "click" | "fill";
  target: "shop" | "add-desk-lamp" | "quantity" | "checkout" | "continue-checkout";
  value: string | null;
};

export type Assertion = {
  id: string;
  predicate: "cart-quantity-equals" | "cart-total-minor-equals" | "required-errors-visible" | "checkout-stayed";
  expected: string;
};

export type Plan = {
  contractVersion: "1";
  scenarioId: "add-to-cart" | "quantity-update" | "required-fields";
  actions: Action[];
  assertions: Assertion[];
};

export type PlannerResponse = {
  kind: "plan" | "clarification";
  question: string | null;
  plan: Plan | null;
};

const keys = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, names: string[]) => Object.keys(value).every((key) => names.includes(key)) && names.every((key) => key in value);

function validateActions(value: unknown): Action[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) throw new Error("Plan requires 1–20 actions.");
  const ids = new Set<string>();
  return value.map((action) => {
    if (!keys(action) || !hasOnly(action, ["id", "kind", "target", "value"]) || typeof action.id !== "string" || !/^[a-z0-9-]+$/.test(action.id)) throw new Error("Action has an invalid shape.");
    if (ids.has(action.id)) throw new Error("Action IDs must be unique.");
    ids.add(action.id);
    if (!(action.kind === "navigate" || action.kind === "click" || action.kind === "fill") || typeof action.target !== "string" || !["shop", "add-desk-lamp", "quantity", "checkout", "continue-checkout"].includes(action.target) || !(action.value === null || typeof action.value === "string")) throw new Error("Action has an invalid shape.");
    return action as Action;
  });
}

function validateAssertions(value: unknown): Assertion[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) throw new Error("Plan requires 1–10 assertions.");
  const ids = new Set<string>();
  return value.map((assertion) => {
    if (!keys(assertion) || !hasOnly(assertion, ["id", "predicate", "expected"]) || typeof assertion.id !== "string" || !/^[a-z0-9-]+$/.test(assertion.id) || typeof assertion.expected !== "string") throw new Error("Assertion has an invalid shape.");
    if (ids.has(assertion.id)) throw new Error("Assertion IDs must be unique.");
    ids.add(assertion.id);
    if (typeof assertion.predicate !== "string" || !["cart-quantity-equals", "cart-total-minor-equals", "required-errors-visible", "checkout-stayed"].includes(assertion.predicate)) throw new Error("Assertion has an invalid shape.");
    return assertion as Assertion;
  });
}

const is = (action: Action, kind: Action["kind"], target: Action["target"], value: string | null) => action.kind === kind && action.target === target && action.value === value;

export function validatePlan(value: unknown): Plan {
  if (!keys(value) || !hasOnly(value, ["contractVersion", "scenarioId", "actions", "assertions"])) throw new Error("Plan must contain only the documented contract fields.");
  if (value.contractVersion !== CONTRACT_VERSION || typeof value.scenarioId !== "string" || !["add-to-cart", "quantity-update", "required-fields"].includes(value.scenarioId)) throw new Error("Plan is not for a supported scenario.");
  const actions = validateActions(value.actions);
  const assertions = validateAssertions(value.assertions);
  const scenarioId = value.scenarioId as Plan["scenarioId"];
  if (scenarioId === "required-fields") {
    const workflow = [["navigate", "shop", null], ["click", "add-desk-lamp", null], ["click", "checkout", null], ["click", "continue-checkout", null]] as const;
    if (actions.length !== workflow.length || !workflow.every(([kind, target, actionValue], index) => is(actions[index], kind, target, actionValue))) throw new Error("Required-fields scenario requires the documented checkout workflow.");
    const required = ["required-errors-visible", "checkout-stayed"];
    if (assertions.length !== required.length || !required.every((predicate) => assertions.some((item) => item.predicate === predicate && item.expected === "true"))) throw new Error("Required-fields scenario requires both boolean assertions.");
  } else {
    const quantity = scenarioId === "add-to-cart" ? "1" : "2";
    const total = scenarioId === "add-to-cart" ? "3900" : "7800";
    if (!actions.every((action) => is(action, "navigate", "shop", null) || is(action, "click", "add-desk-lamp", null) || is(action, "fill", "quantity", quantity))) throw new Error("Action is outside the scenario allowlist.");
    if (!assertions.every((item) => (item.predicate === "cart-quantity-equals" && item.expected === quantity) || (item.predicate === "cart-total-minor-equals" && item.expected === total))) throw new Error("Assertion is outside server-owned criteria.");
    if (!assertions.some((item) => item.predicate === "cart-quantity-equals") || !assertions.some((item) => item.predicate === "cart-total-minor-equals")) throw new Error("Scenario requires quantity and total assertions.");
    if (!actions.some((item) => is(item, "navigate", "shop", null)) || !actions.some((item) => is(item, "click", "add-desk-lamp", null))) throw new Error("Scenario requires shop navigation and adding the lamp.");
  }
  return { contractVersion: CONTRACT_VERSION, scenarioId, actions, assertions };
}

export function validatePlannerResponse(value: unknown): PlannerResponse {
  if (!keys(value) || !hasOnly(value, ["kind", "question", "plan"])) throw new Error("Planner response has an invalid shape.");
  if (value.kind === "plan" && value.question === null && value.plan !== null) return { kind: "plan", question: null, plan: validatePlan(value.plan) };
  if (value.kind === "clarification" && typeof value.question === "string" && value.question.trim() && value.plan === null) return { kind: "clarification", question: value.question, plan: null };
  throw new Error("Planner response must be exactly a plan or a clarification.");
}
