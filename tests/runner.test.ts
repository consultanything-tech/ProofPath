import assert from "node:assert/strict";
import test from "node:test";
import { allowFixtureRequest, observeCheckoutStayed, observeRequiredErrors, padUnobserved, parseVisibleNonNegativeInteger, parseVisibleSgdMinor, type CheckoutMarkers } from "../src/runner.js";
import { PlanStore } from "../src/plan-store.js";
import { fixturePlanFor } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";
import { aggregate, type AssertionResult } from "../src/verdict.js";

test("parses only an unambiguous visible SGD total into minor units", () => {
  assert.equal(parseVisibleSgdMinor("S$78.00"), "7800");
  assert.equal(parseVisibleSgdMinor(" S$39.00 "), "3900");
  assert.equal(parseVisibleSgdMinor("7800"), null);
  assert.equal(parseVisibleSgdMinor("S$39"), null);
  assert.equal(parseVisibleSgdMinor("S$90071992547410.00"), null);
  assert.equal(parseVisibleSgdMinor(null), null);
});

test("parses only unambiguous nonnegative safe integer quantities", () => {
  assert.equal(parseVisibleNonNegativeInteger("2"), "2");
  assert.equal(parseVisibleNonNegativeInteger("0"), "0");
  assert.equal(parseVisibleNonNegativeInteger("-1"), null);
  assert.equal(parseVisibleNonNegativeInteger("01"), null);
  assert.equal(parseVisibleNonNegativeInteger("2.0"), null);
  assert.equal(parseVisibleNonNegativeInteger("9007199254740992"), null);
});

test("allows only the exact approved fixture document and owned static assets", () => {
  const origin = "http://127.0.0.1:41234";
  const fixture = `${origin}/shop.html?revision=baseline`;
  const permitted = (url: string, resourceType: string) => allowFixtureRequest({ url, method: "GET", resourceType, mainFrame: true }, origin, fixture);
  assert.equal(permitted(fixture, "document"), true);
  assert.equal(permitted(`${origin}/styles.css`, "stylesheet"), true);
  assert.equal(permitted(`${origin}/shop.js`, "script"), true);
  assert.equal(permitted("http://127.0.0.1:41235/styles.css", "stylesheet"), false);
  assert.equal(permitted(`${origin}/shop.html?revision=baseline&escape=1`, "document"), false);
  assert.equal(permitted(`${origin}/api/plans`, "fetch"), false);
  assert.equal(permitted(`${origin}/evidence/run.png`, "image"), false);
  assert.equal(allowFixtureRequest({ url: fixture, method: "POST", resourceType: "document", mainFrame: true }, origin, fixture), false);
  assert.equal(allowFixtureRequest({ url: fixture, method: "GET", resourceType: "document", mainFrame: false }, origin, fixture), false);
  assert.equal(allowFixtureRequest({ url: `${origin}/styles.css`, method: "GET", resourceType: "stylesheet", mainFrame: false }, origin, fixture), false);
});

test("interrupted execution preserves a failure and pads only unobserved assertions", () => {
  const scenario = getScenario("add-to-cart", "baseline");
  const envelope = new PlanStore().create("Add one lamp", scenario, fixturePlanFor(scenario).plan!).envelope;
  const results: AssertionResult[] = [{ id: envelope.plan.assertions[0].id, expected: "1", observed: "0", verdict: "FAIL", screenshot: "known-failure.png" }];
  padUnobserved(results, envelope, "http://127.0.0.1:3000/shop.html?revision=baseline");
  assert.equal(results.length, 2);
  assert.equal(results[0].observed, "0");
  assert.equal(results[0].verdict, "FAIL");
  assert.equal(results[1].verdict, "INCONCLUSIVE");
  assert.equal(aggregate(results, false), "FAIL");
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
