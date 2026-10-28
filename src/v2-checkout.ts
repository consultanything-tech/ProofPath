import { createHash } from "node:crypto";
import type {
  AppContract,
  CaseDefinition,
  CaseInput,
  Catalog,
  CheckoutRules,
  GroundingBundle,
  ReleaseRef,
  RequirementContract,
  ReviewDecision,
  SemanticAction,
  V2Context,
  V2ReleaseId,
  V2Sku
} from "./v2-contracts.js";

export type { AppContract, CaseDefinition, CaseInput, Catalog, CheckoutRules, ReleaseRef, ReviewDecision, SemanticAction, V2Context } from "./v2-contracts.js";

export const REFERENCE_CATALOG: Catalog = {
  version: "2",
  currency: "SGD",
  products: [
    { sku: "desk-lamp", name: "Desk Lamp", unitPriceMinor: 4000 },
    { sku: "notebook", name: "Notebook", unitPriceMinor: 3500 },
    { sku: "cable", name: "Cable", unitPriceMinor: 499 }
  ]
};

export const REFERENCE_RULES: CheckoutRules = {
  currency: "SGD",
  quantityMinimum: 1,
  quantityMaximum: 5,
  couponCode: "SAVE10",
  couponBasisPoints: 1000,
  rounding: "half-up",
  deliveryBasis: "discounted-subtotal",
  deliveryThresholdMinor: 7500,
  deliveryThresholdInclusive: true,
  deliveryFeeMinor: 500,
  requiredContactFields: ["email", "postal-code"],
  syntheticConfirmationOnly: true
};

const releaseResources = (id: V2ReleaseId) => [`/v2-target/${id}/index.html`, `/v2-target/${id}/shop.js`, "/v2-target/runtime.js"];
const releases: Record<V2ReleaseId, ReleaseRef> = {
  r1: { id: "r1", documentPath: "/v2-target/r1/index.html", resources: releaseResources("r1"), fingerprint: "sha256:9ffb5482c609961a3e2c31b3779610cb7ecbb282819c191ec00ae4db2f7e3ad2" },
  r2: { id: "r2", documentPath: "/v2-target/r2/index.html", resources: releaseResources("r2"), fingerprint: "sha256:69f88691818dfe67312ff9ad596fd3f18b1bf51c7deb53e2b393c2ae199c56a9" },
  r3: { id: "r3", documentPath: "/v2-target/r3/index.html", resources: releaseResources("r3"), fingerprint: "sha256:889b46a51f6f606cc3e86d67578effac9b888764ec5d5fe300353d6b489f64fb" }
};

const semanticTargets = [
  { id: "add-desk-lamp", role: "button" }, { id: "add-notebook", role: "button" }, { id: "add-cable", role: "button" },
  { id: "quantity-desk-lamp", role: "input" }, { id: "quantity-notebook", role: "input" }, { id: "quantity-cable", role: "input" },
  { id: "remove-desk-lamp", role: "button" }, { id: "remove-notebook", role: "button" }, { id: "remove-cable", role: "button" },
  { id: "coupon", role: "input" }, { id: "checkout", role: "button" }, { id: "contact", role: "region" }, { id: "email", role: "input" },
  { id: "postal-code", role: "input" }, { id: "confirm-synthetic-order", role: "button" }, { id: "total-minor", role: "status" }
] as const;

export function registeredCheckoutApp(origin: string): AppContract {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Registered checkout requires a local loopback origin.");
  return {
    appId: "registered-checkout",
    adapterVersion: "2",
    origin,
    catalog: REFERENCE_CATALOG,
    semanticTargets,
    inspectionPolicy: { readonlyDocuments: Object.values(releases).map((release) => release.documentPath), readonlyResources: Object.values(releases).flatMap((release) => release.resources), reset: "new-context" }
  };
}

export function resolveRelease(id: string): ReleaseRef {
  if (id !== "r1" && id !== "r2" && id !== "r3") throw new Error("Unknown registered release.");
  return releases[id];
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const only = (value: Record<string, unknown>, expected: readonly string[]) => Object.keys(value).every((key) => expected.includes(key));
const validId = (value: unknown) => typeof value === "string" && /^[a-z0-9-]{1,64}$/.test(value);
const validText = (value: unknown, max: number) => typeof value === "string" && value.length <= max;
const skus = new Set<V2Sku>(REFERENCE_CATALOG.products.map((product) => product.sku));

function validateAction(value: unknown, rules: CheckoutRules): SemanticAction {
  if (!isRecord(value) || !only(value, ["id", "kind", "target", "value"]) || !validId(value.id) || typeof value.kind !== "string") throw new Error("Action has an invalid shape.");
  const { kind, target, value: actionValue } = value;
  if (kind === "open-app" && target === "checkout" && actionValue === null) return value as SemanticAction;
  if ((kind === "add-product" || kind === "remove-product") && typeof target === "string" && skus.has(target as V2Sku) && actionValue === null) return value as SemanticAction;
  if (kind === "set-quantity" && typeof target === "string" && skus.has(target as V2Sku) && typeof actionValue === "number" && Number.isInteger(actionValue) && actionValue >= rules.quantityMinimum && actionValue <= rules.quantityMaximum) return value as SemanticAction;
  if (kind === "fill-coupon" && target === "coupon" && typeof actionValue === "string" && /^[A-Z0-9-]{1,32}$/.test(actionValue)) return value as SemanticAction;
  if (kind === "apply-coupon" && target === "coupon" && actionValue === null) return value as SemanticAction;
  if (kind === "open-contact" && target === "contact" && actionValue === null) return value as SemanticAction;
  if (kind === "fill-contact" && (target === "email" || target === "postal-code") && typeof actionValue === "string" && actionValue.length <= 254) return value as SemanticAction;
  if (kind === "confirm-synthetic-order" && target === "synthetic-order" && actionValue === null) return value as SemanticAction;
  throw new Error(kind === "set-quantity" ? "Action quantity is outside the reviewed bounds." : "Action is outside the bounded checkout domain.");
}

function validateActions(actions: readonly unknown[], context: V2Context): SemanticAction[] {
  if (actions.length === 0 || actions.length > 10) throw new Error("A case must contain one to ten actions.");
  const parsed = actions.map((action) => validateAction(action, context.rules));
  if (new Set(parsed.map((action) => action.id)).size !== parsed.length) throw new Error("Action IDs must be unique.");
  return parsed;
}

export function deriveCaseInput(actions: SemanticAction[], context: V2Context): CaseInput {
  const parsed = validateActions(actions, context);
  if (parsed[0]?.kind !== "open-app") throw new Error("The first action must open the registered checkout.");
  const cart = new Map<V2Sku, number>();
  let coupon: string | null = null;
  let couponFilled = false;
  let couponAttempted = false;
  let appliedCoupon: string | null = null;
  let contactOpen = false;
  let confirmationAttempted = false;
  let confirmationContact: CaseInput["state"]["confirmationContact"] = null;
  let confirmationDismissed = false;
  let email = "";
  let postalCode = "";
  for (const action of parsed.slice(1)) {
    if (action.kind === "open-app") throw new Error("The registered checkout can only be opened once per case.");
    if (action.kind === "add-product") {
      const quantity = (cart.get(action.target) ?? 0) + 1;
      if (quantity > context.rules.quantityMaximum) throw new Error("Action quantity is outside the reviewed bounds.");
      cart.set(action.target, quantity);
    }
    if (action.kind === "remove-product") {
      if (!cart.has(action.target)) throw new Error("Cannot remove a product that is not in the cart.");
      cart.delete(action.target);
    }
    if (action.kind === "set-quantity") {
      if (!cart.has(action.target)) throw new Error("Cannot set quantity before adding a product.");
      cart.set(action.target, action.value);
    }
    if (action.kind === "fill-coupon") { coupon = action.value; couponFilled = true; }
    if (action.kind === "apply-coupon") {
      if (!couponFilled) throw new Error("Coupon must be filled before it is applied.");
      couponAttempted = true;
      appliedCoupon = coupon;
    }
    if (action.kind === "open-contact") {
      if (cart.size === 0) throw new Error("Contact cannot open with an empty cart.");
      contactOpen = true;
      if (confirmationAttempted) confirmationDismissed = true;
    }
    if (action.kind === "fill-contact") {
      if (!contactOpen) throw new Error("Contact fields require an open contact form.");
      if (action.target === "email") email = action.value;
      if (action.target === "postal-code") postalCode = action.value;
    }
    if (action.kind === "confirm-synthetic-order") {
      if (!contactOpen) throw new Error("Synthetic confirmation requires an open contact form.");
      confirmationAttempted = true;
      confirmationContact = { email, postalCode };
      confirmationDismissed = false;
      const emailRequired = context.rules.requiredContactFields.includes("email");
      const postalRequired = context.rules.requiredContactFields.includes("postal-code");
      if ((!emailRequired || Boolean(email.trim())) && (!postalRequired || Boolean(postalCode.trim()))) contactOpen = false;
    }
  }
  return { cart: [...cart].map(([sku, quantity]) => ({ sku, quantity })), coupon, contact: { email, postalCode }, state: { contactOpen, couponAttempted, appliedCoupon, confirmationAttempted, confirmationContact, confirmationDismissed } };
}

export function validateCase(value: unknown, context: V2Context): CaseDefinition {
  if (!isRecord(value) || !only(value, ["id", "criterionIds", "category", "rationale", "actions", "assertions"]) || !validId(value.id) || !Array.isArray(value.criterionIds) || value.criterionIds.length === 0 || value.criterionIds.length > 6 || !value.criterionIds.every(validId) || typeof value.category !== "string" || !["happy", "negative", "boundary", "interaction"].includes(value.category) || !validText(value.rationale, 500) || !Array.isArray(value.actions) || !Array.isArray(value.assertions) || value.assertions.length === 0 || value.assertions.length > 6) throw new Error("Case has an invalid shape.");
  if (new Set(value.criterionIds).size !== value.criterionIds.length || !value.criterionIds.every((id) => context.requirement.criteria.some((criterion) => criterion.id === id))) throw new Error("Case criterion links must be unique reviewed criteria.");
  const actions = validateActions(value.actions, context);
  const assertions = value.assertions.map((assertion) => {
    if (!isRecord(assertion) || !only(assertion, ["id", "predicate"]) || !validId(assertion.id) || typeof assertion.predicate !== "string" || !["total-minor", "coupon-error", "contact-errors", "synthetic-confirmation"].includes(assertion.predicate)) throw new Error("Case assertion has an invalid shape.");
    return assertion as unknown as CaseDefinition["assertions"][number];
  });
  if (new Set(assertions.map((assertion) => assertion.id)).size !== assertions.length) throw new Error("Case assertion IDs must be unique.");
  return { id: value.id as string, criterionIds: value.criterionIds as string[], category: value.category as CaseDefinition["category"], rationale: value.rationale as string, actions, assertions };
}

const referenceRequirement: RequirementContract = {
  version: "2",
  originalText: "Synthetic checkout reference policies.",
  criteria: [
    { id: "cart", sourceQuote: "Quantity range 1..5.", normalizedRule: "Products stay within the reviewed quantity bounds." },
    { id: "coupon", sourceQuote: "SAVE10 discounts the cart subtotal by 10%.", normalizedRule: "Invalid coupon is explicit; SAVE10 uses half-up rounding once." },
    { id: "delivery", sourceQuote: "Delivery is free at discounted subtotal S$75.00 or more.", normalizedRule: "Delivery evaluates the discounted subtotal inclusively." },
    { id: "contact", sourceQuote: "Contact fields are required before synthetic confirmation.", normalizedRule: "Blank required fields block confirmation." }
  ],
  normalizedRules: REFERENCE_RULES,
  adoptedReferenceIds: ["checkout-reference-v2"],
  expectationScope: [{ criterionId: "cart", scope: "unchanged" }, { criterionId: "coupon", scope: "unchanged" }, { criterionId: "delivery", scope: "unchanged" }, { criterionId: "contact", scope: "unchanged" }],
  coverageGaps: []
};

export function createV2Context(origin = "http://127.0.0.1:4173"): V2Context {
  const pair = [resolveRelease("r1"), resolveRelease("r2")] as const;
  const grounding: GroundingBundle = { releases: pair, observedTargets: [], declaredTargets: semanticTargets.map((target) => target.id), pairFingerprint: digestV2(pair.map((release) => release.fingerprint)) };
  return { app: registeredCheckoutApp(origin), catalog: REFERENCE_CATALOG, rules: REFERENCE_RULES, releases: Object.values(releases), grounding, requirement: referenceRequirement };
}

function canonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  throw new Error("V2 digests accept JSON values only.");
}

export function digestV2(value: unknown): string { return `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`; }
