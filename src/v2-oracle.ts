import type { CaseInput, Catalog, CheckoutRules, ExpectedCase } from "./v2-contracts.js";

function checkedMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer.`);
  return value;
}

export function calculateCheckout(input: CaseInput, rules: CheckoutRules, catalog: Catalog): ExpectedCase {
  const prices = new Map(catalog.products.map((product) => [product.sku, product.unitPriceMinor]));
  let subtotalMinor = 0;
  const seen = new Set<string>();
  for (const line of input.cart) {
    if (seen.has(line.sku)) throw new Error("Cart contains duplicate SKUs.");
    seen.add(line.sku);
    if (!Number.isInteger(line.quantity) || line.quantity < rules.quantityMinimum || line.quantity > rules.quantityMaximum) throw new Error("Cart quantity is outside the reviewed bounds.");
    const unitPriceMinor = prices.get(line.sku);
    if (unitPriceMinor === undefined) throw new Error("Cart contains an unknown SKU.");
    subtotalMinor += checkedMinor(unitPriceMinor * line.quantity, "Line total");
  }
  const couponError = input.coupon !== null && input.coupon !== rules.couponCode ? "invalid-coupon" : null;
  const discountMinor = input.coupon === rules.couponCode ? Math.floor((subtotalMinor * rules.couponBasisPoints + 5_000) / 10_000) : 0;
  const discountedSubtotalMinor = subtotalMinor - discountMinor;
  const deliveryMinor = discountedSubtotalMinor >= rules.deliveryThresholdMinor ? 0 : rules.deliveryFeeMinor;
  const email = input.contact.email.trim() ? null : "required";
  const postalCode = input.contact.postalCode.trim() ? null : "required";
  const contactErrors = { email, postalCode } as const;
  const syntheticConfirmation = !input.state.syntheticConfirmed ? "not-requested" : email || postalCode ? "blocked" : "confirmed";
  return { subtotalMinor, discountMinor, discountedSubtotalMinor, deliveryMinor, totalMinor: discountedSubtotalMinor + deliveryMinor, couponError, contactErrors, syntheticConfirmation };
}
