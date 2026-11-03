import type { PlannerResponse } from "./contracts.js";
import type { Scenario } from "./scenarios.js";
import type { PlannerProvenance } from "./plan-store.js";
import { createMetaPlanner } from "./meta-planner.js";

export type Planner = { readonly provenance: PlannerProvenance; propose(requirement: string, scenario: Scenario): Promise<PlannerResponse> };
export function plannerLabel(provenance: PlannerProvenance) {
  if (provenance.mode === "fixture") return "Fixture planner — Meta not used";
  if (provenance.mode === "baseten") return "Baseten-hosted Meta open-weight model — muse-spark-open-1026";
  return "Meta Model API — muse-spark-1.3";
}
export function createPlanner(env: NodeJS.ProcessEnv, fetcher?: typeof fetch): Planner {
  if (env.PLANNER_MODE === "fixture") return { provenance: Object.freeze({ mode: "fixture", provider: null, model: null }), async propose(_requirement, scenario) { return fixturePlanFor(scenario); } };
  if (env.PLANNER_MODE === "baseten") throw new Error("Baseten planning is disabled pending an authorized structured-output canary and durable $5 admission ledger.");
  if (env.PLANNER_MODE !== "meta") throw new Error("Set PLANNER_MODE explicitly to fixture, meta or baseten.");
  return createMetaPlanner({ apiKey: env.MODEL_API_KEY ?? "", fetch: fetcher });
}

export function fixturePlanFor(scenario: Scenario): PlannerResponse {
  if (scenario.id === "required-fields") return { kind: "plan", question: null, plan: {
    contractVersion: "1", scenarioId: scenario.id,
    actions: [
      { id: "open-shop", kind: "navigate", target: "shop", value: null },
      { id: "add-lamp", kind: "click", target: "add-desk-lamp", value: null },
      { id: "open-checkout", kind: "click", target: "checkout", value: null },
      { id: "continue-blank-checkout", kind: "click", target: "continue-checkout", value: null }
    ],
    assertions: [
      { id: "required-errors-visible", predicate: "required-errors-visible", expected: scenario.expected.requiredErrorsVisible },
      { id: "checkout-stayed", predicate: "checkout-stayed", expected: scenario.expected.checkoutStayed }
    ]
  } };
  const { quantity, totalMinor } = scenario.expected;
  return { kind: "plan", question: null, plan: {
    contractVersion: "1", scenarioId: scenario.id,
    actions: [
      { id: "open-shop", kind: "navigate", target: "shop", value: null },
      { id: "add-lamp", kind: "click", target: "add-desk-lamp", value: null },
      { id: "set-quantity", kind: "fill", target: "quantity", value: quantity }
    ],
    assertions: [
      { id: `quantity-is-${quantity}`, predicate: "cart-quantity-equals", expected: quantity },
      { id: `total-is-${totalMinor}`, predicate: "cart-total-minor-equals", expected: totalMinor }
    ]
  } };
}
