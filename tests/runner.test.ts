import assert from "node:assert/strict";
import test from "node:test";
import { parseVisibleSgdMinor } from "../src/runner.js";

test("parses only an unambiguous visible SGD total into minor units", () => {
  assert.equal(parseVisibleSgdMinor("S$78.00"), "7800");
  assert.equal(parseVisibleSgdMinor(" S$39.00 "), "3900");
  assert.equal(parseVisibleSgdMinor("7800"), null);
  assert.equal(parseVisibleSgdMinor("S$39"), null);
  assert.equal(parseVisibleSgdMinor(null), null);
});
