import type { PlannerResponse } from "./contracts.js";
import type { Scenario } from "./scenarios.js";

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
