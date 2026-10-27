import assert from "node:assert/strict";
import { request } from "node:http";
import test from "node:test";
import { createProofPathServer, RunGate } from "../src/server.js";
import { createPlanner } from "../src/planner.js";
import { createMetaPlanner, META_MODEL } from "../src/meta-planner.js";
import { fixturePlanFor } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";

test("one run slot rejects overlap and can be released", () => {
  const gate = new RunGate();
  assert.equal(gate.acquire(), true);
  assert.equal(gate.acquire(), false);
  gate.release();
  assert.equal(gate.acquire(), true);
  gate.release();
});

test("mock Meta HTTP planning returns clarification without approval and preserves provenance on plans/errors", async () => {
  const key = "synthetic-http-test-key";
  let result: unknown = { kind: "clarification", question: "Which supported journey?", plan: null };
  let fail = false;
  let calls = 0;
  const planner = createMetaPlanner({ apiKey: key, retryDelayMs: 0, fetch: (async () => {
    calls += 1;
    if (fail) throw new Error(key);
    return new Response(JSON.stringify({ model: META_MODEL, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(result) } }] }));
  }) as typeof fetch });
  const { server, origin } = createProofPathServer(0, planner);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const send = (path: string, body?: string) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, path, method: body ? "POST" : "GET", headers: { Host: new URL(origin).host, Origin: origin, "Content-Type": "application/json" } }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => text += chunk);
      res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(text) }));
    });
    req.on("error", reject); req.end(body);
  });
  try {
    const config = await send("/api/config");
    assert.equal(config.body.planner.mode, "meta");
    assert.equal(JSON.stringify(config.body).includes(key), false);
    const input = JSON.stringify({ requirement: "Add one lamp", scenarioId: "add-to-cart", revision: "baseline" });
    const clarification = await send("/api/plans", input);
    assert.equal(clarification.status, 200);
    assert.equal(clarification.body.kind, "clarification");
    assert.equal(clarification.body.id, undefined);
    assert.equal(clarification.body.digest, undefined);
    result = fixturePlanFor(getScenario("add-to-cart", "baseline"));
    const proposal = await send("/api/plans", input);
    assert.equal(proposal.status, 201);
    assert.equal(proposal.body.envelope.planner.mode, "meta");
    assert.equal(proposal.body.envelope.planner.model, META_MODEL);
    fail = true;
    const error = await send("/api/plans", input);
    assert.equal(error.status, 400);
    assert.equal(error.body.id, undefined);
    assert.equal(JSON.stringify(error.body).includes(key), false);
    assert.equal(calls, 4);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("HTTP policy enforces Host, Origin, media type and body limit before execution", async () => {
  const { server, origin } = createProofPathServer(0, createPlanner({ PLANNER_MODE: "fixture" }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const send = (path: string, body?: string, headers: Record<string, string> = {}) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: address.port, path, method: body === undefined ? "GET" : "POST", headers: { Host: new URL(origin).host, Origin: origin, "Content-Type": "application/json", ...headers } }, res => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", chunk => text += chunk);
      res.on("end", () => { let value; try { value = JSON.parse(text); } catch { value = text; } resolve({ status: res.statusCode!, body: value }); });
    });
    req.on("error", reject);
    req.end(body);
  });
  const input = { requirement: "Add one synthetic lamp", scenarioId: "add-to-cart", revision: "baseline" };
  try {
    assert.equal((await send("/")).status, 200);
    for (const path of ["/", "/api/plans", "/runs/00000000-0000-4000-8000-000000000001/manifest.json"]) assert.equal((await send(path, undefined, { Host: "attacker.invalid" })).status, 400);
    assert.equal((await send("http://attacker.invalid/")).status, 400);
    assert.equal((await send("/api/plans", JSON.stringify(input), { Origin: "http://attacker.invalid" })).status, 400);
    assert.equal((await send("/api/plans", JSON.stringify(input), { "Content-Type": "application/jsonp" })).status, 400);
    const base = JSON.stringify({ ...input, padding: "" });
    const exact = JSON.stringify({ ...input, padding: "x".repeat(10_000 - Buffer.byteLength(base)) });
    assert.equal(Buffer.byteLength(exact), 10_000);
    const proposal = await send("/api/plans", exact, { "Content-Type": "application/json; charset=utf-8" });
    assert.equal(proposal.status, 201);
    assert.equal((await send("/api/plans", exact + " ")).status, 400);
    assert.equal((await send(`/api/plans/${proposal.body.id}/approve`, JSON.stringify({ plan: {} }))).status, 400);
    assert.equal((await send(`/api/plans/${proposal.body.id}/run`, "{}")).status, 400);
    assert.match((await send(`/api/plans/${proposal.body.id}/run`, "{}")).body.error, /Approve/);
    assert.equal((await send(`/api/plans/${proposal.body.id}/approve`, "{}")).status, 200);
    assert.equal((await send(`/api/plans/${proposal.body.id}/run`, JSON.stringify({ plan: {} }))).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
