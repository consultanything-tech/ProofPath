import assert from "node:assert/strict";
import test from "node:test";
import { createMetaPlanner, META_ENDPOINT, META_MODEL, metaRequest, PLAN_RESPONSE_SCHEMA } from "../src/meta-planner.js";
import { createPlanner, fixturePlanFor } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";
import { PlanStore } from "../src/plan-store.js";

const key = "synthetic-test-key-never-a-real-credential";
const baseline = getScenario("add-to-cart", "baseline");
const payload = (value: unknown = fixturePlanFor(baseline), overrides: Record<string, unknown> = {}) => ({ model: META_MODEL, choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }], ...overrides });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const fake = (handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) => handler as typeof fetch;

test("planner mode is explicit and fixture mode never uses the transport", async () => {
  assert.throws(() => createPlanner({}), /PLANNER_MODE/);
  assert.throws(() => createPlanner({ PLANNER_MODE: "other" }), /PLANNER_MODE/);
  assert.throws(() => createPlanner({ PLANNER_MODE: "meta" }), /MODEL_API_KEY/);
  assert.throws(() => createPlanner({ PLANNER_MODE: "meta", MODEL_API_KEY: "  " }), /MODEL_API_KEY/);
  let calls = 0;
  const planner = createPlanner({ PLANNER_MODE: "fixture" }, fake(async () => { calls += 1; throw new Error("Must not call."); }));
  assert.equal((await planner.propose("Add a lamp", baseline)).kind, "plan");
  assert.equal(calls, 0);
  assert.deepEqual(planner.provenance, { mode: "fixture", provider: null, model: null });
});

test("Meta request uses a strict schema, fixed endpoint/model/cap and revision-free public facts", async () => {
  const seeded = getScenario("quantity-update", "seeded-bug");
  const fixed = getScenario("quantity-update", "fixed");
  assert.deepEqual(metaRequest("Set quantity to two", seeded), metaRequest("Set quantity to two", fixed));
  const serialized = JSON.stringify(metaRequest("Set quantity to two", seeded));
  for (const omitted of ["seeded-bug", '"fixed"', "revision", "approvalDigest", "approvalEnvelope"]) assert.equal(serialized.includes(omitted), false);
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") {
      assert.equal(Object.isFrozen(node), true);
      assert.equal(node.additionalProperties, false);
      assert.deepEqual(node.required, Object.keys(node.properties));
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(PLAN_RESPONSE_SCHEMA);
  assert.equal("oneOf" in PLAN_RESPONSE_SCHEMA, false);
  let calls = 0;
  const planner = createMetaPlanner({ apiKey: key, fetch: fake(async (url, init) => {
    calls += 1;
    assert.equal(url, META_ENDPOINT);
    assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${key}`);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, META_MODEL);
    assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema, PLAN_RESPONSE_SCHEMA);
    return json(payload());
  }) });
  const response = await planner.propose("Add a lamp", baseline);
  assert.equal(response.kind, "plan");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(planner).includes(key), false);
  const store = new PlanStore();
  const live = store.create("Add a lamp", baseline, response.plan!, planner.provenance);
  const fixture = store.create("Add a lamp", baseline, response.plan!);
  assert.notEqual(live.digest, fixture.digest);
  assert.deepEqual(live.envelope.planner, { mode: "meta", provider: "meta-model-api", model: META_MODEL });
  assert.equal(Object.isFrozen(planner.provenance), true);
});

test("Meta clarification is returned without a plan", async () => {
  const response = await createMetaPlanner({ apiKey: key, fetch: fake(async () => json(payload({ kind: "clarification", question: "Which supported journey do you mean?", plan: null }))) }).propose("Check something", baseline);
  assert.equal(response.kind, "clarification");
  assert.equal(response.plan, null);
});

test("invalid, refused, incomplete and wrong-model responses fail without retry", async () => {
  const badPlan = structuredClone(fixturePlanFor(baseline));
  (badPlan.plan as any).selector = "body";
  const variants = [
    payload(badPlan),
    payload(fixturePlanFor(getScenario("required-fields", "baseline"))),
    payload({ kind: "clarification", question: "", plan: null }),
    payload(undefined, { model: "unrequested-model" }),
    payload(undefined, { choices: [] }),
    payload(undefined, { choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] }),
    payload(undefined, { choices: [{ finish_reason: "stop", message: { content: "" } }] }),
    payload(undefined, { choices: [{ finish_reason: "length", message: { content: "{}" } }] }),
    payload(undefined, { choices: [{ finish_reason: "stop", message: { refusal: "Declined", content: null } }] }),
    payload(undefined, { choices: [{ finish_reason: "stop", message: { content: JSON.stringify(fixturePlanFor(baseline)), tool_calls: [{ function: { name: "unsupported" } }] } }] })
  ];
  for (const value of variants) {
    let calls = 0;
    const planner = createMetaPlanner({ apiKey: key, fetch: fake(async () => { calls += 1; return json(value); }) });
    await assert.rejects(planner.propose("Add a lamp", baseline), /Meta/);
    assert.equal(calls, 1);
  }
});

test("authentication, payment and invalid requests never retry or expose provider bodies", async () => {
  for (const status of [400, 401, 402, 403]) {
    let calls = 0;
    const planner = createMetaPlanner({ apiKey: key, retryDelayMs: 0, fetch: fake(async () => { calls += 1; return json({ error: key }, status); }) });
    await assert.rejects(planner.propose("Add a lamp", baseline), error => error instanceof Error && !error.message.includes(key));
    assert.equal(calls, 1);
  }
});

test("transient status/network errors retry at most once with no fixture fallback", async () => {
  for (const status of [429, 500, 503]) {
    let calls = 0;
    const planner = createMetaPlanner({ apiKey: key, retryDelayMs: 0, fetch: fake(async () => { calls += 1; return calls === 1 ? json({}, status) : json(payload()); }) });
    assert.equal((await planner.propose("Add a lamp", baseline)).kind, "plan");
    assert.equal(calls, 2);
  }
  let calls = 0;
  const planner = createMetaPlanner({ apiKey: key, retryDelayMs: 0, fetch: fake(async () => { calls += 1; throw new Error(key); }) });
  await assert.rejects(planner.propose("Add a lamp", baseline), error => error instanceof Error && /No fixture/.test(error.message) && !error.message.includes(key));
  assert.equal(calls, 2);
});

test("deadline and abort failures never retry or return a fixture plan", async () => {
  let calls = 0;
  const planner = createMetaPlanner({ apiKey: key, timeoutMs: 15, fetch: fake(async (_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Stopped", "AbortError")), { once: true }));
  }) });
  await assert.rejects(planner.propose("Add a lamp", baseline), /timed out/);
  assert.equal(calls, 1);
  const aborted = createMetaPlanner({ apiKey: key, fetch: fake(async () => { throw new DOMException("Stopped", "AbortError"); }) });
  await assert.rejects(aborted.propose("Add a lamp", baseline), /timed out/);
});

test("oversized or unreadable response bodies cannot become a plan", async () => {
  for (const response of [new Response("x".repeat(65_537)), new Response("{}", { headers: { "Content-Length": "65537" } }), new Response("not JSON"), new Response(new ReadableStream({ start(controller) { controller.error(new Error(key)); } }))]) {
    let calls = 0;
    const planner = createMetaPlanner({ apiKey: key, fetch: fake(async () => { calls += 1; return response; }) });
    await assert.rejects(planner.propose("Add a lamp", baseline), error => error instanceof Error && !error.message.includes(key));
    assert.equal(calls, 1);
  }
});
