import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createV2Context } from "../src/v2-checkout.js";
import { LiveMetaProposalService, LiveProposalBudgetLedger } from "../src/v2-live-proposal.js";
import { V2_META_INPUT_TOKENS_ENDPOINT, V2_META_RESPONSES_ENDPOINT, createV2Planner } from "../src/v2-planner.js";
import { ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "proofpath-live-v2-")); const key = randomBytes(32); const pepper = randomBytes(32); const code = randomBytes(24).toString("base64url");
  const ledger = await LiveProposalBudgetLedger.initialize({ dataDir: root, ledgerKey: key });
  const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, code)]);
  return { root, key, pepper, code, ledger, registry };
}

test("live Responses admission counts the exact immutable body before one bounded generation", async () => {
  const f = await setup(); const context = createV2Context(); const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context); const seen: string[] = [];
  try {
    const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url, init) => {
      seen.push(`${url}\n${init?.body}`);
      if (url === V2_META_INPUT_TOKENS_ENDPOINT) return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 6073 }));
      return new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [{ type: "reasoning" }, { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }], usage: { input_tokens: 6073, output_tokens: 10, total_tokens: 6083 } }));
    });
    const result = await service.propose(context, await service.authorize(`Bearer ${f.code}`));
    assert.equal(result.proposal.kind, "proposal"); assert.equal(seen.length, 2);
    assert.equal(seen[0]!.slice(seen[0]!.indexOf("\n") + 1), seen[1]!.slice(seen[1]!.indexOf("\n") + 1));
    const reservation = (await f.ledger.snapshot()).reservations[0]!;
    assert.equal(reservation.renderedInputTokens, 6073); assert.deepEqual(reservation.attempts[0]!.usage, { inputTokens: 6073, outputTokens: 10, totalTokens: 6083 });
  } finally { await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }
});

test("over-limit count never reserves or generates, while a usage breach latches across restart", async () => {
  const f = await setup(); const context = createV2Context(); let calls = 0;
  try {
    const countedOut = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async () => { calls += 1; return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 6074 })); });
    await assert.rejects(countedOut.propose(context, await countedOut.authorize(`Bearer ${f.code}`)), /unavailable/i); assert.equal(calls, 1); assert.equal((await f.ledger.snapshot()).reservations.length, 0);
    const fixture = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
    const breach = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url) => url === V2_META_INPUT_TOKENS_ENDPOINT
      ? new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 6073 }))
      : new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(fixture) }] }], usage: { input_tokens: 6074, output_tokens: 1, total_tokens: 6075 } })));
    await assert.rejects(breach.propose(context, await breach.authorize(`Bearer ${f.code}`)), /unavailable/i);
    await f.ledger.close(); const reopened = await LiveProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.key });
    try { await assert.rejects(reopened.preflight(f.registry.authenticate(`Bearer ${f.code}`)), /unavailable/i); } finally { await reopened.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("known usage is journaled before malformed proposal validation and profile failures latch", async () => {
  const f = await setup(); const context = createV2Context();
  try {
    const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url) => url === V2_META_INPUT_TOKENS_ENDPOINT
      ? new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 6073 }))
      : new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "{not-json" }] }], usage: { input_tokens: 6073, output_tokens: 1, total_tokens: 6074 } })));
    await assert.rejects(service.propose(context, await service.authorize(`Bearer ${f.code}`)), /unavailable/i);
    const state = await f.ledger.snapshot();
    assert.deepEqual(state.reservations[0]!.attempts[0]!.usage, { inputTokens: 6073, outputTokens: 1, totalTokens: 6074 });
    assert.ok(state.liveAdmissionBlocked);
  } finally { await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }
});
