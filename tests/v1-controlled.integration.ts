import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createProofPathServer } from "../src/server.js";
import { createPlanner, fixturePlanFor } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";
import { LiveMetaProposalService, LiveProposalBudgetLedger } from "../src/v2-live-proposal.js";
import { ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner, V2_META_INPUT_TOKENS_ENDPOINT } from "../src/v2-planner.js";

const reviewerA = "A".repeat(24);
const reviewerB = "B".repeat(24);
const complete = (payload: unknown) => new Response(JSON.stringify({
  model: "muse-spark-1.3", status: "completed",
  output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
  usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 }
}));

test("controlled V1 uses reviewer-owned plans and the V2 live ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v1-controlled-"));
  const ledger = await LiveProposalBudgetLedger.initialize({ dataDir: root, ledgerKey: randomBytes(32) });
  const pepper = randomBytes(32);
  const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, reviewerA), ReviewerCodeRegistry.digest(pepper, reviewerB)]);
  let counts = 0; let v1Generations = 0; let v2Generations = 0;
  const service = new LiveMetaProposalService(ledger, registry, "synthetic-key", async (url, init) => {
    if (url === V2_META_INPUT_TOKENS_ENDPOINT) { counts += 1; return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 })); }
    const user = JSON.parse(JSON.parse(init!.body as string).input[1].content[0].text);
    if (user.facts) { v1Generations += 1; return complete(fixturePlanFor(getScenario(user.facts.scenarioId, "baseline"))); }
    v2Generations += 1;
    return complete(await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(withSourceRequirement(createV2Context(), user.source.originalText)));
  });
  const probe = createServer(); await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string"); await new Promise<void>((resolve) => probe.close(() => resolve()));
  const instance = createProofPathServer(address.port, createPlanner({ PLANNER_MODE: "fixture" }), { controlledMeta: true, proposalService: service, inspect: async (context) => context.grounding });
  const headers = (code: string) => ({ "Content-Type": "application/json", Origin: instance.origin, Authorization: `Bearer ${code}` });
  try {
    await new Promise<void>((resolve) => instance.server.listen(address.port, "127.0.0.1", resolve));
    const input = JSON.stringify({ requirement: "Add one Desk Lamp", scenarioId: "add-to-cart", revision: "baseline" });
    assert.equal((await fetch(instance.origin + "/api/plans", { method: "POST", headers: { "Content-Type": "application/json", Origin: instance.origin }, body: input })).status, 401);
    assert.equal(counts, 0); assert.equal(v1Generations, 0);
    const plan = await fetch(instance.origin + "/api/plans", { method: "POST", headers: headers(reviewerA), body: input });
    assert.equal(plan.status, 201);
    const planData = await plan.json() as { id: string; envelope: { planner: { mode: string } } };
    assert.equal(planData.envelope.planner.mode, "meta"); assert.equal(v1Generations, 1);
    assert.equal((await fetch(`${instance.origin}/api/plans/${planData.id}/approve`, { method: "POST", headers: headers(reviewerB), body: "{}" })).status, 400);
    assert.equal((await fetch(`${instance.origin}/api/plans/${planData.id}/approve`, { method: "POST", headers: headers(reviewerA), body: "{}" })).status, 200);
    assert.equal((await fetch(`${instance.origin}/runs/00000000-0000-4000-8000-000000000001/manifest.json`)).status, 401);
    assert.equal((await fetch(`${instance.origin}/evidence/00000000-0000-4000-8000-000000000001/synthetic.png`)).status, 401);
    const v2 = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers: headers(reviewerA), body: JSON.stringify({ requirement: "An invalid coupon must display an error.", releases: ["r1", "r2"] }) });
    assert.equal(v2.status, 201); assert.equal(v2Generations, 1); assert.equal(counts, 2);
    assert.equal((await ledger.snapshot()).reservations.length, 2);
  } finally {
    instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    await ledger.close(); await rm(root, { recursive: true, force: true });
  }
});
