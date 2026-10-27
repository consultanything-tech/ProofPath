export const TARGET_REGISTRY_VERSION = "2" as const;

export type ScenarioId = "add-to-cart" | "quantity-update" | "required-fields";
export type Revision = "baseline" | "seeded-bug" | "fixed";
type CartScenario = { id: "add-to-cart" | "quantity-update"; revision: Revision; expected: { quantity: string; totalMinor: string }; replay: string[] };
type RequiredFieldsScenario = { id: "required-fields"; revision: "baseline"; expected: { requiredErrorsVisible: "true"; checkoutStayed: "true" }; replay: string[] };
export type Scenario = CartScenario | RequiredFieldsScenario;

const scenarios: Record<string, Scenario> = {
  "add-to-cart:baseline": { id: "add-to-cart", revision: "baseline", expected: { quantity: "1", totalMinor: "3900" }, replay: ["Open the synthetic shop", "Add Desk Lamp", "Set Quantity to 1"] },
  "quantity-update:seeded-bug": { id: "quantity-update", revision: "seeded-bug", expected: { quantity: "2", totalMinor: "7800" }, replay: ["Open the seeded synthetic shop", "Add Desk Lamp", "Set Quantity to 2"] },
  "quantity-update:fixed": { id: "quantity-update", revision: "fixed", expected: { quantity: "2", totalMinor: "7800" }, replay: ["Open the fixed synthetic shop", "Add Desk Lamp", "Set Quantity to 2"] },
  "required-fields:baseline": { id: "required-fields", revision: "baseline", expected: { requiredErrorsVisible: "true", checkoutStayed: "true" }, replay: ["Open the synthetic shop", "Add Desk Lamp", "Open checkout", "Continue with both fields blank"] }
};

export function getScenario(id: unknown, revision: unknown): Scenario {
  if (typeof id !== "string" || typeof revision !== "string") throw new Error("A supported scenario and revision are required.");
  const scenario = scenarios[`${id}:${revision}`];
  if (!scenario) throw new Error("Unsupported scenario revision.");
  return structuredClone(scenario);
}

export function fixturePath(scenario: Scenario) { return `/shop.html?revision=${encodeURIComponent(scenario.revision)}`; }
