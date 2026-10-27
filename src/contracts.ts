export const CONTRACT_VERSION = "1" as const;

export type Action = {
  id: string;
  kind: "navigate" | "click" | "fill";
  target: "shop" | "add-desk-lamp" | "quantity";
  value: string | null;
};

export type Assertion = {
  id: string;
  predicate: "cart-quantity-equals" | "cart-total-minor-equals";
  expected: string;
};

export type Plan = {
  contractVersion: "1";
  scenarioId: "add-to-cart" | "quantity-update";
  actions: Action[];
  assertions: Assertion[];
};

export type PlannerResponse = {
  kind: "plan" | "clarification";
  question: string | null;
  plan: Plan | null;
};

const keys = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasOnly = (value: Record<string, unknown>, names: string[]) =>
  Object.keys(value).every((key) => names.includes(key)) && names.every((key) => key in value);

export function validatePlan(value: unknown): Plan {
  if (!keys(value) || !hasOnly(value, ["contractVersion", "scenarioId", "actions", "assertions"])) {
    throw new Error("Plan must contain only the documented contract fields.");
  }
  if (value.contractVersion !== CONTRACT_VERSION || (value.scenarioId !== "add-to-cart" && value.scenarioId !== "quantity-update")) throw new Error("Plan is not for a supported scenario.");
  const quantity = value.scenarioId === "add-to-cart" ? "1" : "2";
  const total = value.scenarioId === "add-to-cart" ? "3900" : "7800";
  if (!Array.isArray(value.actions) || value.actions.length === 0 || value.actions.length > 20) {
    throw new Error("Plan requires 1–20 actions.");
  }
  if (!Array.isArray(value.assertions) || value.assertions.length === 0 || value.assertions.length > 10) {
    throw new Error("Plan requires 1–10 assertions.");
  }
  const actionIds = new Set<string>();
  const actions: Action[] = value.actions.map((action) => {
    if (!keys(action) || !hasOnly(action, ["id", "kind", "target", "value"]) || typeof action.id !== "string" || !/^[a-z0-9-]+$/.test(action.id)) {
      throw new Error("Action has an invalid shape.");
    }
    if (actionIds.has(action.id)) throw new Error("Action IDs must be unique.");
    actionIds.add(action.id);
    const valid = (action.kind === "navigate" && action.target === "shop" && action.value === null)
      || (action.kind === "click" && action.target === "add-desk-lamp" && action.value === null)
      || (action.kind === "fill" && action.target === "quantity" && action.value === quantity);
    if (!valid) throw new Error("Action is outside the scenario allowlist.");
    return action as Action;
  });
  const assertionIds = new Set<string>();
  const assertions: Assertion[] = value.assertions.map((assertion) => {
    if (!keys(assertion) || !hasOnly(assertion, ["id", "predicate", "expected"]) || typeof assertion.id !== "string" || !/^[a-z0-9-]+$/.test(assertion.id)) {
      throw new Error("Assertion has an invalid shape.");
    }
    if (assertionIds.has(assertion.id)) throw new Error("Assertion IDs must be unique.");
    assertionIds.add(assertion.id);
    const valid = (assertion.predicate === "cart-quantity-equals" && assertion.expected === quantity)
      || (assertion.predicate === "cart-total-minor-equals" && assertion.expected === total);
    if (!valid) throw new Error("Assertion is outside server-owned criteria.");
    return assertion as Assertion;
  });
  if (!assertions.some((item) => item.predicate === "cart-quantity-equals") || !assertions.some((item) => item.predicate === "cart-total-minor-equals")) {
    throw new Error("Scenario requires quantity and total assertions.");
  }
  if (!actions.some((item) => item.kind === "navigate") || !actions.some((item) => item.kind === "click" && item.target === "add-desk-lamp")) {
    throw new Error("Scenario requires shop navigation and adding the lamp.");
  }
  return { contractVersion: CONTRACT_VERSION, scenarioId: value.scenarioId, actions, assertions };
}

export function validatePlannerResponse(value: unknown): PlannerResponse {
  if (!keys(value) || !hasOnly(value, ["kind", "question", "plan"])) throw new Error("Planner response has an invalid shape.");
  if (value.kind === "plan" && value.question === null && value.plan !== null) {
    return { kind: "plan", question: null, plan: validatePlan(value.plan) };
  }
  if (value.kind === "clarification" && typeof value.question === "string" && value.question.trim() && value.plan === null) {
    return { kind: "clarification", question: value.question, plan: null };
  }
  throw new Error("Planner response must be exactly a plan or a clarification.");
}
