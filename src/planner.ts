import type { PlannerResponse } from "./contracts.js";
import type { Scenario } from "./scenarios.js";

export function fixturePlanFor(scenario: Scenario): PlannerResponse {
  const quantity = scenario.expected.quantity;
  const total = scenario.expected.totalMinor;
  return {
  kind: "plan",
  question: null,
  plan: {
    contractVersion: "1",
    scenarioId: scenario.id,
    actions: [
      { id: "open-shop", kind: "navigate", target: "shop", value: null },
      { id: "add-lamp", kind: "click", target: "add-desk-lamp", value: null },
      { id: "set-quantity", kind: "fill", target: "quantity", value: quantity }
    ],
    assertions: [
      { id: `quantity-is-${quantity}`, predicate: "cart-quantity-equals", expected: quantity },
      { id: `total-is-${total}`, predicate: "cart-total-minor-equals", expected: total }
    ]
  }
  };
}
