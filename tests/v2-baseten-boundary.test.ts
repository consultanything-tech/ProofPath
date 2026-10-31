import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BASETEN_QUALIFICATION_MODEL, parseBasetenQualificationEnvelope } from "../src/v2-baseten-planner.js";
import { BASETEN_OFFLINE_POLICY, BasetenQualificationLedger, ScriptedBasetenQualification } from "../src/v2-baseten-qualification.js";
import { createV2Context } from "../src/v2-checkout.js";
import type { ReviewDecision, V2Context } from "../src/v2-contracts.js";
import { createV2Planner } from "../src/v2-planner.js";
import { V2Store } from "../src/v2-store.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "proofpath-baseten-boundary-"));
  const key = randomBytes(32);
  return { root, key, ledger: await BasetenQualificationLedger.initialize({ dataDir: root, ledgerKey: key }) };
}
async function envelope(context = createV2Context()) {
  const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  return {
    id: "resp_boundary", object: "response", created_at: 1, status: "completed", model: BASETEN_QUALIFICATION_MODEL as string,
    output: [{ type: "message", id: "msg_boundary", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }],
    usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20, output_tokens_details: { reasoning_tokens: 2 } }
  };
}
async function cleanup(f: Awaited<ReturnType<typeof setup>>) {
  await f.ledger.close().catch(() => {});
  await rm(f.root, { recursive: true, force: true });
}

test("mock scripts are snapshotted before callers can change model identity or content", async () => {
  const f = await setup();
  try {
    const value = await envelope();
    const script = [{ kind: "response" as const, envelope: value }];
    const harness = new ScriptedBasetenQualification(f.ledger, script);
    value.model = "caller-mutated-model";
    value.output[0]!.content[0]!.text = "not JSON";
    script.length = 0;
    const result = await harness.propose(createV2Context(), 100);
    assert.equal(result.proposal.kind, "proposal");
    assert.deepEqual(result.provenance.slice(0, 3), ["baseten-mocked", "offline-unverified", "synthetic-accounting"]);
  } finally { await cleanup(f); }
});

test("prepared proposals retain the reserved source snapshot and require separate exact approval", async () => {
  const f = await setup();
  try {
    const context = createV2Context();
    const source = context.requirement.originalText;
    const store = new V2Store(join(f.root, "workbench"));
    const harness = new ScriptedBasetenQualification(f.ledger, [{ kind: "response", envelope: await envelope(context) }]);
    const pending = harness.createPrepared(store, context, 100);
    (context.requirement as { originalText: string }).originalText = "caller-changed source";
    const result = await pending;
    assert.ok("prepared" in result && result.prepared);
    assert.equal(result.prepared.context.requirement.originalText, source);
    await assert.rejects(store.consumeApproval(result.prepared.id), /approval/i);
    const proposal = result.proposal;
    const review: ReviewDecision = {
      decisions: proposal.requirement.criteria.map((criterion) => ({
        criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged",
        adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: [...proposal.gaps],
        acceptedNumericRuleChanges: proposal.requirement.numericRuleChanges.filter((change) => change.criterionId === criterion.id)
      }))
    };
    const suite = await store.reviewProposal(result.prepared.id, review);
    const approval = await store.approveSuite(suite.id);
    const consumed = await store.consumeApproval(approval.id);
    assert.ok(consumed.provenance.includes("offline-unverified"));
    assert.ok(consumed.provenance.includes("synthetic-accounting"));
    assert.equal(consumed.definition.requirement.originalText, source);
    await assert.rejects(store.consumeApproval(approval.id), /already been used/i);
  } finally { await cleanup(f); }
});

test("model and content rejection retain valid usage before latching through restart", async () => {
  for (const kind of ["model", "content"] as const) {
    const f = await setup();
    try {
      const value = await envelope();
      if (kind === "model") value.model = "unexpected-model";
      else value.output[0]!.content[0]!.text = "PRIVATE_SYNTHETIC_SENTINEL invalid JSON";
      const harness = new ScriptedBasetenQualification(f.ledger, [{ kind: "response", envelope: value }]);
      await assert.rejects(harness.propose(createV2Context(), 100), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes("PRIVATE_SYNTHETIC_SENTINEL"), false);
        return true;
      });
      const saved = await f.ledger.snapshot();
      assert.equal(saved.blocked, true);
      assert.deepEqual(saved.reservations[0]!.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20, reasoningTokens: 2 });
      await f.ledger.close();
      const reopened = await BasetenQualificationLedger.open({ dataDir: f.root, ledgerKey: f.key });
      try {
        assert.equal((await reopened.snapshot()).blocked, true);
        await assert.rejects(reopened.reserve("sha256:" + "a".repeat(64), 100), /qualification/i);
      } finally { await reopened.close(); }
    } finally { await cleanup(f); }
  }
});

test("signed terminal records with missing completion time cannot reopen", async () => {
  const f = await setup();
  try {
    await new ScriptedBasetenQualification(f.ledger, [{ kind: "response", envelope: await envelope() }]).propose(createV2Context(), 100);
    await f.ledger.close();
    const path = join(f.root, "baseten-qualification.json");
    const state = JSON.parse(await readFile(path, "utf8"));
    state.payload.reservations[0].completedAt = null;
    state.mac = createHmac("sha256", f.key).update(JSON.stringify(state.payload)).digest("hex");
    await writeFile(path, JSON.stringify(state));
    await assert.rejects(BasetenQualificationLedger.open({ dataDir: f.root, ledgerKey: f.key }), /qualification/i);
  } finally { await cleanup(f); }
});

test("negative, fractional, overflowing and inconsistent token accounting never parses", async () => {
  const context = createV2Context();
  for (const change of [
    { input_tokens: -1 }, { input_tokens: 0.5 }, { input_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { output_tokens: 4097 }, { total_tokens: 21 }, { output_tokens_details: { reasoning_tokens: 9 } }
  ]) {
    const value = await envelope(context);
    Object.assign(value.usage, change);
    assert.throws(() => parseBasetenQualificationEnvelope(value, context), /usage/i);
  }
});

test("synthetic reservation rounds both token allowances up and concurrent admission stays single-use", async () => {
  const policy = BASETEN_OFFLINE_POLICY;
  const nanos = BigInt(policy.maxInputTokens) * BigInt(policy.syntheticInputNanousdPerToken) +
    BigInt(policy.maxOutputTokens) * BigInt(policy.syntheticOutputNanousdPerToken);
  assert.equal(policy.reservationMicrousd, Number((nanos + 999n) / 1000n));
  assert.equal(policy.totalMicrousd, policy.reservationMicrousd);
  assert.equal(policy.syntheticOnly, true);
  assert.equal(policy.maxAttempts, 1);
  const f = await setup();
  try {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.ledger.reserve("sha256:" + "a".repeat(64), 100)));
    const successes = results.filter((item) => item.status === "fulfilled");
    assert.equal(successes.length, 1);
    const id = successes[0]!.value;
    let disk = JSON.parse(await readFile(join(f.root, "baseten-qualification.json"), "utf8")).payload;
    assert.equal(disk.reservedMicrousd, policy.reservationMicrousd);
    assert.equal(disk.reservations[0].status, "reserved");
    assert.equal(disk.reservations[0].attemptStartedAt, null);
    await f.ledger.beforeScript(id);
    disk = JSON.parse(await readFile(join(f.root, "baseten-qualification.json"), "utf8")).payload;
    assert.equal(disk.reservations[0].status, "dispatching");
    assert.ok(disk.reservations[0].attemptStartedAt);
    await assert.rejects(f.ledger.beforeScript(id), /qualification/i);
  } finally { await cleanup(f); }
});

test("interrupted attempts recover blocked without refund or automatic reinitialization", async () => {
  const f = await setup();
  try {
    const id = await f.ledger.reserve("sha256:" + "b".repeat(64), 100);
    await f.ledger.beforeScript(id);
    await f.ledger.close();
    const reopened = await BasetenQualificationLedger.open({ dataDir: f.root, ledgerKey: f.key });
    try {
      const saved = await reopened.snapshot();
      assert.equal(saved.blocked, true);
      assert.equal(saved.reservedMicrousd, BASETEN_OFFLINE_POLICY.reservationMicrousd);
      assert.equal(saved.reservations[0]!.status, "interrupted");
      assert.ok(saved.reservations[0]!.completedAt);
      await assert.rejects(reopened.reserve("sha256:" + "c".repeat(64), 100), /qualification/i);
      await assert.rejects(BasetenQualificationLedger.initialize({ dataDir: f.root, ledgerKey: f.key }), /qualification/i);
    } finally { await reopened.close(); }
  } finally { await cleanup(f); }
});

test("missing or modified signed state cannot reopen or reset capacity", async () => {
  for (const fault of ["missing", "modified"] as const) {
    const f = await setup();
    try {
      await f.ledger.reserve("sha256:" + "d".repeat(64), 100);
      await f.ledger.close();
      const path = join(f.root, "baseten-qualification.json");
      if (fault === "missing") await unlink(path);
      else {
        const state = JSON.parse(await readFile(path, "utf8"));
        state.payload.reservations = [];
        await writeFile(path, JSON.stringify(state));
      }
      await assert.rejects(BasetenQualificationLedger.open({ dataDir: f.root, ledgerKey: f.key }), /qualification/i);
      await assert.rejects(BasetenQualificationLedger.initialize({ dataDir: f.root, ledgerKey: f.key }), /qualification/i);
    } finally { await cleanup(f); }
  }
});

test("real filesystem write failure before or after attempt journaling preserves a blocking owner lock", async () => {
  for (const phase of ["reserve", "usage"] as const) {
    const f = await setup();
    try {
      let id: string | undefined;
      if (phase === "usage") {
        id = await f.ledger.reserve("sha256:" + "e".repeat(64), 100);
        await f.ledger.beforeScript(id);
      }
      await chmod(f.root, 0o500);
      const operation = phase === "reserve"
        ? f.ledger.reserve("sha256:" + "e".repeat(64), 100)
        : f.ledger.recordUsage(id!, { inputTokens: 12, outputTokens: 8, totalTokens: 20, reasoningTokens: 2 });
      await assert.rejects(operation, /qualification/i);
      await chmod(f.root, 0o700);
      await assert.rejects(f.ledger.snapshot(), /qualification/i);
      await assert.rejects(f.ledger.close(), /qualification/i);
      assert.ok((await stat(join(f.root, "baseten-qualification.lock"))).isFile());
      await assert.rejects(BasetenQualificationLedger.open({ dataDir: f.root, ledgerKey: f.key }), /qualification/i);
      const disk = JSON.parse(await readFile(join(f.root, "baseten-qualification.json"), "utf8")).payload;
      assert.equal(disk.reservations.length, phase === "reserve" ? 0 : 1);
      if (phase === "usage") assert.equal(disk.reservations[0].usage, null);
    } finally {
      await chmod(f.root, 0o700).catch(() => {});
      await cleanup(f);
    }
  }
});

test("input breach and scripted uncertainty latch with no retry, while clarification has no prepared proposal", async () => {
  for (const outcome of ["input-breach", "uncertain", "clarification"] as const) {
    const f = await setup();
    try {
      const value = await envelope();
      if (outcome === "clarification") {
        const proposal = JSON.parse(value.output[0]!.content[0]!.text);
        proposal.kind = "clarification";
        proposal.cases = [];
        proposal.gaps = [...proposal.gaps, "Clarify which delivery transition should be covered."];
        value.output[0]!.content[0]!.text = JSON.stringify(proposal);
      }
      const harness = new ScriptedBasetenQualification(f.ledger, [outcome === "uncertain" ? { kind: "uncertain" } : { kind: "response", envelope: value }]);
      const store = new V2Store(join(f.root, "workbench"));
      if (outcome === "clarification") {
        const result = await harness.createPrepared(store, createV2Context(), 100);
        assert.equal(result.proposal.kind, "clarification");
        assert.equal("prepared" in result, false);
      } else await assert.rejects(harness.createPrepared(store, createV2Context(), outcome === "input-breach" ? 0 : 100), /qualification/i);
      const saved = await f.ledger.snapshot();
      assert.equal(saved.reservations.length, 1);
      assert.equal(saved.blocked, outcome !== "clarification");
      assert.equal(saved.reservedMicrousd, BASETEN_OFFLINE_POLICY.reservationMicrousd);
      assert.equal(saved.reservations[0]!.status, outcome === "clarification" ? "clarification" : "failed-or-uncertain");
      await assert.rejects(harness.propose(createV2Context(), 100), /qualification/i);
    } finally { await cleanup(f); }
  }
});
