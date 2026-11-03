import assert from "node:assert/strict";
import test from "node:test";
import { BASETEN_ENDPOINT, BASETEN_MODEL, basetenRequest } from "../src/baseten-planner.js";
import { PLAN_RESPONSE_SCHEMA } from "../src/meta-planner.js";
import { createPlanner } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";

const key = "synthetic-baseten-key-never-a-real-credential";

test("Baseten product mode is an explicit no-dispatch gate even when a key is present", () => {
  let calls = 0;
  const networkSpy = (() => { calls += 1; throw new Error("network must stay unused"); }) as typeof fetch;
  assert.throws(() => createPlanner({ PLANNER_MODE: "baseten", BASETEN_API_KEY: key }, networkSpy), /disabled pending.*\$5 admission ledger/i);
  assert.equal(calls, 0);
});

test("Baseten canary request is schema-bound, fixed and uses only synthetic public facts", () => {
  const request = basetenRequest("Set quantity", getScenario("quantity-update", "seeded-bug"));
  const serialized = JSON.stringify(request);
  assert.equal(BASETEN_ENDPOINT, "https://inference.baseten.co/v1/chat/completions");
  assert.equal(request.model, BASETEN_MODEL);
  assert.equal(request.max_tokens, 4096);
  assert.deepEqual(request.response_format, { type: "json_schema", json_schema: { name: "proofpath_plan", strict: true, schema: PLAN_RESPONSE_SCHEMA } });
  for (const secret of ["seeded-bug", '"fixed"', "approvalDigest", "MODEL_API_KEY"]) assert.equal(serialized.includes(secret), false);
});
