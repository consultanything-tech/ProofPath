import assert from "node:assert/strict";
import test from "node:test";
import { observeCheckoutStayed, observeRequiredErrors, parseVisibleSgdMinor, type CheckoutMarkers } from "../src/runner.js";

test("parses only an unambiguous visible SGD total into minor units", () => {
  assert.equal(parseVisibleSgdMinor("S$78.00"), "7800");
  assert.equal(parseVisibleSgdMinor(" S$39.00 "), "3900");
  assert.equal(parseVisibleSgdMinor("7800"), null);
  assert.equal(parseVisibleSgdMinor("S$39"), null);
  assert.equal(parseVisibleSgdMinor(null), null);
});

const markers = (overrides: Partial<CheckoutMarkers> = {}): CheckoutMarkers => ({
  firstError: { count: 1, visible: true }, secondError: { count: 1, visible: true }, active: { count: 1, visible: true }, confirmation: { count: 0, visible: false }, ...overrides
});

test("checkout observations separate true, known false, and missing evidence", () => {
  assert.equal(observeRequiredErrors(markers()), "true");
  assert.equal(observeRequiredErrors(markers({ firstError: { count: 1, visible: false } })), "false");
  assert.equal(observeRequiredErrors(markers({ secondError: { count: 0, visible: false } })), null);
  assert.equal(observeRequiredErrors(markers({ firstError: { count: 2, visible: true } })), null);
  assert.equal(observeCheckoutStayed(markers()), "true");
  assert.equal(observeCheckoutStayed(markers({ confirmation: { count: 1, visible: true } })), "false");
  assert.equal(observeCheckoutStayed(markers({ active: { count: 1, visible: false } })), "false");
  assert.equal(observeCheckoutStayed(markers({ active: { count: 0, visible: false } })), null);
  assert.equal(observeCheckoutStayed(markers({ confirmation: { count: 1, visible: false } })), null);
  assert.equal(observeCheckoutStayed(markers({ confirmation: { count: 2, visible: true } })), null);
});
