import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BASETEN_QUALIFICATION_MODEL, buildBasetenQualificationRequest, parseBasetenQualificationEnvelope } from "../src/v2-baseten-planner.js";
import { BasetenQualificationLedger, ScriptedBasetenQualification } from "../src/v2-baseten-qualification.js";
import { createV2Context } from "../src/v2-checkout.js";
import { createV2Planner } from "../src/v2-planner.js";

async function setup() { const root = await mkdtemp(join(tmpdir(), "proofpath-baseten-offline-")); return { root, ledger: await BasetenQualificationLedger.initialize({ dataDir: root, ledgerKey: randomBytes(32) }) }; }
async function clean(f: Awaited<ReturnType<typeof setup>>) { await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }
async function fixture(context = createV2Context()) { return createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context); }
async function response(context = createV2Context()) { return { id: "resp-offline", object: "response", created_at: 1, status: "completed", model: BASETEN_QUALIFICATION_MODEL, output: [{ type: "reasoning" }, { type: "message", id: "msg-offline", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(await fixture(context)) }] }], usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20, output_tokens_details: { reasoning_tokens: 2 } } }; }

test("offline request is immutable and omits release, defect and live-transport fields", () => {
  const request = buildBasetenQualificationRequest(createV2Context()); const raw = JSON.stringify(request);
  assert.equal((request as { model: string }).model, BASETEN_QUALIFICATION_MODEL); assert.ok(Object.isFrozen(request));
  for (const forbidden of ["seeded-bug", '"r2"', "approvalDigest", "background", "conversation", "previous_response_id", '"prompt"']) assert.equal(raw.includes(forbidden), false);
  assert.throws(() => { (request as { model: string }).model = "changed"; }, TypeError);
});

test("parser locally rejects advisory-schema violations, tools, truncation and invalid accounting", async () => {
  const context = createV2Context(); const good = await response(context);
  assert.equal(parseBasetenQualificationEnvelope(good, context).proposal.kind, "proposal");
  const extra = structuredClone(good); extra.output[1]!.content![0]!.text = JSON.stringify({ ...(await fixture(context)), extra: true });
  assert.throws(() => parseBasetenQualificationEnvelope(extra, context), /invalid suite/i);
  const tool = structuredClone(good); tool.output.push({ type: "function_call" }); assert.throws(() => parseBasetenQualificationEnvelope(tool, context), /unsupported output/i);
  const truncated = structuredClone(good); truncated.output[1]!.status = "incomplete"; assert.throws(() => parseBasetenQualificationEnvelope(truncated, context), /incomplete/i);
  const badUsage = structuredClone(good); badUsage.usage.total_tokens = 21; assert.throws(() => parseBasetenQualificationEnvelope(badUsage, context), /invalid usage/i);
});

test("script journals usage before wrong identity rejection, retains reservation and latches closed", async () => {
  const f = await setup(); const value = await response(); (value as { model: string }).model = "unexpected-model";
  try {
    const service = new ScriptedBasetenQualification(f.ledger, [{ kind: "response", envelope: value }]);
    await assert.rejects(service.propose(createV2Context(), 100), /qualification/i);
    const saved = await f.ledger.snapshot();
    assert.deepEqual(saved.reservations[0]!.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20, reasoningTokens: 2 });
    assert.equal(saved.reservations[0]!.status, "failed-or-uncertain"); assert.equal(saved.blocked, true);
    await assert.rejects(service.propose(createV2Context(), 100), /qualification/i);
  } finally { await clean(f); }
});

test("one finite script reserves its exact request once and creates only explicitly reviewable provenance", async () => {
  const f = await setup(); const context = createV2Context();
  try {
    const service = new ScriptedBasetenQualification(f.ledger, [{ kind: "response", envelope: await response(context) }]);
    const result = await service.propose(context, 100);
    assert.equal(result.proposal.kind, "proposal"); assert.deepEqual(result.provenance.slice(0, 3), ["baseten-mocked", "offline-unverified", "synthetic-accounting"]);
    const saved = await f.ledger.snapshot();
    assert.equal(saved.reservations.length, 1); assert.equal(saved.reservations[0]!.requestDigest.length, 71); assert.equal(saved.reservations[0]!.status, "proposal");
  } finally { await clean(f); }
});

test("interrupted state is retained and an initialization never overwrites it", async () => {
  const f = await setup(); const key = randomBytes(32);
  try {
    await assert.rejects(BasetenQualificationLedger.initialize({ dataDir: f.root, ledgerKey: key }), /qualification/i);
  } finally { await clean(f); }
});
