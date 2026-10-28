import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  REFERENCE_CATALOG,
  REFERENCE_RULES,
  createV2Context,
  deriveCaseInput,
  digestV2,
  registeredCheckoutApp,
  resolveRelease,
  validateCase,
  type Catalog,
  type CaseInput,
  type CheckoutRules,
  type SemanticAction
} from "../src/v2-checkout.js";
import { calculateCheckout } from "../src/v2-oracle.js";

const catalog: Catalog = REFERENCE_CATALOG;
const rulesFor = (changes: Partial<CheckoutRules> = {}): CheckoutRules => ({ ...REFERENCE_RULES, ...changes });
const inputFor = (lines: readonly [string, number][], coupon: string | null): CaseInput => ({
  cart: lines.map(([sku, quantity]) => ({ sku: sku as CaseInput["cart"][number]["sku"], quantity })),
  coupon,
  contact: { email: "qa@example.test", postalCode: "018989" },
  state: { contactOpen: true, couponAttempted: coupon !== null, appliedCoupon: coupon, confirmationAttempted: false, confirmationContact: null, syntheticConfirmed: false }
});

test("oracle calculates reviewed checkout rules with integer arithmetic", () => {
  assert.equal(calculateCheckout(inputFor([["desk-lamp", 2]], "SAVE10"), rulesFor(), catalog).totalMinor, 7700);
  assert.equal(calculateCheckout(inputFor([["desk-lamp", 1], ["notebook", 1]], null), rulesFor(), catalog).totalMinor, 7500);
  assert.equal(calculateCheckout(inputFor([["notebook", 2], ["cable", 1]], null), rulesFor(), catalog).totalMinor, 7999);
  assert.equal(calculateCheckout(inputFor([["notebook", 2], ["cable", 1]], "SAVE10"), rulesFor(), catalog).totalMinor, 7249);
  assert.equal(calculateCheckout(inputFor([["desk-lamp", 2]], "SAVE10"), rulesFor({ deliveryThresholdMinor: 7000 }), catalog).totalMinor, 7200);
  assert.equal(calculateCheckout(inputFor([["cable", 1]], "SAVE10"), rulesFor({ couponBasisPoints: 5000 }), catalog).discountMinor, 250);
});

test("case validation rejects unknown fields and out-of-domain actions", () => {
  const context = createV2Context();
  const valid = {
    id: "coupon-check",
    criterionIds: ["coupon"],
    category: "negative",
    rationale: "Shows the explicit invalid-coupon response.",
    actions: [
      { id: "open", kind: "open-app", target: "checkout", value: null },
      { id: "add", kind: "add-product", target: "desk-lamp", value: null },
      { id: "coupon", kind: "fill-coupon", target: "coupon", value: "NOPE" },
      { id: "apply", kind: "apply-coupon", target: "coupon", value: null }
    ],
    assertions: [{ id: "coupon-error", predicate: "coupon-error" }]
  };
  assert.deepEqual(validateCase(valid, context), valid);
  assert.throws(() => validateCase({ ...valid, unexpected: true }, context), /invalid shape/i);
  assert.throws(() => validateCase({ ...valid, actions: [{ ...valid.actions[0], selector: "#checkout" }] }, context), /invalid shape/i);
  assert.throws(() => validateCase({ ...valid, actions: [{ ...valid.actions[0], kind: "add-product", target: "https://example.test", value: null }] }, context), /bounded checkout domain/i);
  assert.throws(() => validateCase({ ...valid, actions: [{ ...valid.actions[0], kind: "add-product", target: "unknown-sku", value: null }] }, context), /bounded checkout domain/i);
  assert.throws(() => validateCase({ ...valid, actions: [...valid.actions, { id: "too-many", kind: "set-quantity", target: "desk-lamp", value: 6 }] }, context), /quantity/i);
  assert.throws(() => validateCase({ ...valid, actions: [...valid.actions, { id: "dup", kind: "add-product", target: "desk-lamp", value: null }, { id: "dup", kind: "add-product", target: "notebook", value: null }] }, context), /unique/i);
  const tenActions = [...valid.actions, ...Array.from({ length: 6 }, (_, index) => ({ id: `coupon-${index}`, kind: "fill-coupon", target: "coupon", value: "NOPE" }))];
  assert.equal(validateCase({ ...valid, actions: tenActions }, context).actions.length, 10);
  assert.throws(() => validateCase({ ...valid, actions: [...tenActions, { id: "eleven", kind: "fill-coupon", target: "coupon", value: "NOPE" }] }, context), /one to ten/i);
  const sixAssertions = Array.from({ length: 6 }, (_, index) => ({ id: `assert-${index}`, predicate: "total-minor" }));
  assert.equal(validateCase({ ...valid, assertions: sixAssertions }, context).assertions.length, 6);
  assert.throws(() => validateCase({ ...valid, assertions: [...sixAssertions, { id: "seven", predicate: "total-minor" }] }, context), /invalid shape/i);
  assert.throws(() => validateCase({ ...valid, assertions: [{ id: "same", predicate: "total-minor" }, { id: "same", predicate: "coupon-error" }] }, context), /unique/i);
  for (const malformed of [[], {}, true]) {
    assert.throws(() => validateCase({ ...valid, category: malformed }, context), /invalid shape/i);
    assert.throws(() => validateCase({ ...valid, assertions: [{ id: "assertion", predicate: malformed }] }, context), /invalid shape/i);
  }
});

test("action derivation preserves submitted event state and cart operations", () => {
  const context = createV2Context();
  const actions: SemanticAction[] = [
    { id: "open", kind: "open-app", target: "checkout", value: null },
    { id: "add", kind: "add-product", target: "notebook", value: null },
    { id: "quantity", kind: "set-quantity", target: "notebook", value: 2 },
    { id: "contact", kind: "open-contact", target: "contact", value: null },
    { id: "email", kind: "fill-contact", target: "email", value: "" },
    { id: "postal", kind: "fill-contact", target: "postal-code", value: "018989" },
    { id: "confirm", kind: "confirm-synthetic-order", target: "synthetic-order", value: null }
  ];
  const input = deriveCaseInput(actions, context);
  assert.equal(input.cart[0]?.quantity, 2);
  assert.equal(input.contact.email, "");
  assert.equal(calculateCheckout(input, context.rules, context.catalog).contactErrors.email, "required");
  const couponActions: SemanticAction[] = [{ id: "open", kind: "open-app", target: "checkout", value: null }, { id: "lamp", kind: "add-product", target: "desk-lamp", value: null }];
  const draftCoupon = deriveCaseInput([...couponActions, { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" }], context);
  assert.equal(calculateCheckout(draftCoupon, context.rules, context.catalog).totalMinor, 4500);
  const appliedCoupon = deriveCaseInput([...couponActions, { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" }, { id: "apply", kind: "apply-coupon", target: "coupon", value: null }], context);
  assert.equal(calculateCheckout(appliedCoupon, context.rules, context.catalog).totalMinor, 4100);
  const filledAfterBlankConfirm = deriveCaseInput([
    { id: "open", kind: "open-app", target: "checkout", value: null }, { id: "add", kind: "add-product", target: "desk-lamp", value: null },
    { id: "contact", kind: "open-contact", target: "contact", value: null }, { id: "confirm", kind: "confirm-synthetic-order", target: "synthetic-order", value: null },
    { id: "email", kind: "fill-contact", target: "email", value: "qa@example.test" }, { id: "postal", kind: "fill-contact", target: "postal-code", value: "018989" }
  ] as SemanticAction[], context);
  assert.equal(calculateCheckout(filledAfterBlankConfirm, context.rules, context.catalog).syntheticConfirmation, "blocked");
  assert.deepEqual(calculateCheckout(filledAfterBlankConfirm, context.rules, context.catalog).contactErrors, { email: "required", postalCode: "required" });
  const requiredEmailOnly = { ...context, rules: rulesFor({ requiredContactFields: ["email"] }) };
  const emailOnly = deriveCaseInput([
    { id: "open", kind: "open-app", target: "checkout", value: null }, { id: "add", kind: "add-product", target: "desk-lamp", value: null },
    { id: "contact", kind: "open-contact", target: "contact", value: null }, { id: "email", kind: "fill-contact", target: "email", value: "qa@example.test" },
    { id: "confirm", kind: "confirm-synthetic-order", target: "synthetic-order", value: null }
  ] as SemanticAction[], requiredEmailOnly);
  assert.deepEqual(calculateCheckout(emailOnly, requiredEmailOnly.rules, catalog).contactErrors, { email: null, postalCode: null });
  assert.equal(calculateCheckout(emailOnly, requiredEmailOnly.rules, catalog).syntheticConfirmation, "confirmed");
  const changedCartActions: SemanticAction[] = [
    { id: "open", kind: "open-app", target: "checkout", value: null }, { id: "lamp", kind: "add-product", target: "desk-lamp", value: null },
    { id: "notebook", kind: "add-product", target: "notebook", value: null }, { id: "quantity", kind: "set-quantity", target: "desk-lamp", value: 2 },
    { id: "remove-notebook", kind: "remove-product", target: "notebook", value: null }
  ];
  const changedCart = deriveCaseInput(changedCartActions, context);
  assert.deepEqual(changedCart.cart, [{ sku: "desk-lamp", quantity: 2 }]);
  assert.deepEqual(deriveCaseInput([...changedCartActions, { id: "remove-lamp", kind: "remove-product", target: "desk-lamp", value: null }], context).cart, []);
  assert.throws(() => deriveCaseInput([{ id: "open", kind: "open-app", target: "checkout", value: null }, { id: "quantity", kind: "set-quantity", target: "notebook", value: 0 }] as SemanticAction[], context), /quantity/i);
});

test("registered releases have independent immutable fingerprints", () => {
  const app = registeredCheckoutApp("http://127.0.0.1:4173");
  assert.equal(app.adapterVersion, "2");
  assert.equal(resolveRelease("r1").documentPath, "/v2-target/r1/index.html");
  assert.notEqual(resolveRelease("r1").fingerprint, resolveRelease("r2").fingerprint);
  for (const release of ["r1", "r2", "r3"] as const) {
    const root = join(process.cwd(), "public", "v2-target", release);
    const fingerprint = `sha256:${createHash("sha256").update(readFileSync(join(root, "index.html"))).update(readFileSync(join(root, "shop.js"))).update(readFileSync(join(process.cwd(), "public", "v2-target", "runtime.js"))).digest("hex")}`;
    assert.equal(resolveRelease(release).fingerprint, fingerprint);
  }
  assert.equal(createV2Context().requirement.normalizedRules.deliveryThresholdMinor, 7500);
  assert.match(digestV2({ b: 1, a: 2 }), /^sha256:[a-f0-9]{64}$/);
});
