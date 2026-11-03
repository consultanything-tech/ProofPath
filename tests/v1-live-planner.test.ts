import assert from "node:assert/strict";
import test from "node:test";
import { buildV1MetaResponsesRequest, dispatchLiveV1MetaResponsesRequest } from "../src/v1-live-planner.js";
import { getScenario } from "../src/scenarios.js";
import { fixturePlanFor } from "../src/planner.js";

const scenario = getScenario("add-to-cart", "baseline");
const response = (text: string) => new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text }] }], usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } }));

test("controlled V1 Responses request is fixed, metered before validation, and rejects wrong scenarios", async () => {
  const request = buildV1MetaResponsesRequest("Add one Desk Lamp", scenario);
  assert.equal(Object.isFrozen(request), true);
  assert.equal((request as { model: string }).model, "muse-spark-1.3");
  let attempts = 0; let usage = 0;
  await assert.rejects(dispatchLiveV1MetaResponsesRequest("Add one Desk Lamp", scenario, async () => response(JSON.stringify(fixturePlanFor(getScenario("quantity-update", "seeded-bug")))), request, async () => { attempts += 1; }, async () => { usage += 1; }), /wrong scenario/i);
  assert.equal(attempts, 1);
  assert.equal(usage, 1);
});

test("controlled V1 records valid provider usage before rejecting model or message shape", async () => {
  const request = buildV1MetaResponsesRequest("Add one Desk Lamp", scenario);
  for (const malformed of [
    { model: "unexpected", status: "completed", output: [], usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } },
    { model: "muse-spark-1.3", status: "incomplete", output: [], usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 } }
  ]) {
    let usage = 0;
    await assert.rejects(dispatchLiveV1MetaResponsesRequest("Add one Desk Lamp", scenario, async () => new Response(JSON.stringify(malformed)), request, async () => {}, async () => { usage += 1; }), /unexpected|incomplete/i);
    assert.equal(usage, 1);
  }
});

test("controlled V1 transport retries only one transient provider response", async () => {
  const request = buildV1MetaResponsesRequest("Add one Desk Lamp", scenario);
  let calls = 0; let attempts = 0;
  const result = await dispatchLiveV1MetaResponsesRequest("Add one Desk Lamp", scenario, async () => {
    calls += 1;
    if (calls === 1) return new Response("busy", { status: 503 });
    return response(JSON.stringify({ kind: "clarification", question: "Please clarify.", plan: null }));
  }, request, async () => { attempts += 1; }, async () => {});
  assert.equal(result.kind, "clarification");
  assert.equal(calls, 2);
  assert.equal(attempts, 2);
});
