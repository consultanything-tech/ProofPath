import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createV2Context } from "../src/v2-checkout.js";
import { LiveMetaProposalService, LiveProposalBudgetLedger, LIVE_PROPOSAL_POLICY } from "../src/v2-live-proposal.js";
import { ReviewerCodeRegistry, TestOnlyInputAdmission } from "../src/v2-proposal-budget.js";
import { buildMetaResponsesRequest, createV2Planner, dispatchLiveV2MetaResponsesRequest, V2_META_INPUT_TOKENS_ENDPOINT } from "../src/v2-planner.js";

async function setup(number = 1) {
  const root = await mkdtemp(join(tmpdir(), "proofpath-live-boundary-"));
  const key = randomBytes(32); const pepper = randomBytes(32);
  const codes = Array.from({ length: number }, () => randomBytes(24).toString("base64url"));
  const registry = new ReviewerCodeRegistry(pepper, codes.map((code) => ReviewerCodeRegistry.digest(pepper, code)));
  const ledger = await LiveProposalBudgetLedger.initialize({ dataDir: root, ledgerKey: key });
  return { root, key, codes, registry, ledger };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
const identity = (f: Fixture, index = 0) => f.registry.authenticate("Bearer " + f.codes[index]);
async function cleanup(f: Fixture) {
  await chmod(f.root, 0o700).catch(() => {});
  await f.ledger.close().catch(() => {});
  await rm(f.root, { recursive: true, force: true });
}
const counter = (input_tokens = 6073) => new Response(JSON.stringify({ object: "response.input_tokens", input_tokens }));
async function envelope() {
  const context = createV2Context();
  const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  return { model: "muse-spark-1.3", status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }
  ], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } };
}
const hash = (value: unknown) => "sha256:" + createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("Responses profile is frozen and altered tools/history/schema/caps never dispatch", async () => {
  const context = createV2Context(); const body = buildMetaResponsesRequest(context) as any;
  assert.equal(body.model, "muse-spark-1.3"); assert.deepEqual(body.tools, []);
  assert.equal(body.store, false); assert.equal(body.stream, false); assert.equal(body.background, false);
  assert.equal(body.truncation, "disabled"); assert.equal(body.max_output_tokens, 4096);
  assert.equal(body.text.format.type, "json_schema"); assert.equal(body.text.format.strict, true);
  assert.throws(() => { body.input[0].content[0].text = "changed"; }, TypeError);
  const variants: ((value: any) => void)[] = [
    (v) => { v.tools = [{ type: "web_search" }]; }, (v) => { v.previous_response_id = "unapproved"; },
    (v) => { v.store = true; }, (v) => { v.max_output_tokens = 100000; },
    (v) => { v.model = "other-model"; }, (v) => { v.input.push({ role: "user", content: "extra" }); },
    (v) => { v.text.format.schema.additionalProperties = true; }
  ];
  let fetches = 0; let attempts = 0;
  for (const change of variants) {
    const altered = structuredClone(body); change(altered);
    await assert.rejects(dispatchLiveV2MetaResponsesRequest(context,
      async () => { fetches += 1; return new Response(JSON.stringify(await envelope())); }, altered,
      async () => { attempts += 1; }, async () => {}));
  }
  assert.equal(fetches, 0); assert.equal(attempts, 0);
});

test("malformed counts and mock certificates never reserve or reach generation", async () => {
  const f = await setup();
  try {
    const invalid: unknown[] = [
      { input_tokens: 1 }, { object: "other", input_tokens: 1 }, { object: "response.input_tokens", input_tokens: 6074 },
      { object: "response.input_tokens", input_tokens: -1 }, { object: "response.input_tokens", input_tokens: 1.5 },
      { object: "response.input_tokens", input_tokens: "1" }, { object: "response.input_tokens", input_tokens: null },
      { object: "response.input_tokens", input_tokens: Number.MAX_SAFE_INTEGER }, { object: "response.input_tokens", input_tokens: 1, extra: true },
      await new TestOnlyInputAdmission(1).assess(buildMetaResponsesRequest(createV2Context()))
    ];
    let generations = 0;
    for (const value of invalid) {
      const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url) => {
        if (url === V2_META_INPUT_TOKENS_ENDPOINT) return new Response(JSON.stringify(value));
        generations += 1; return new Response(JSON.stringify(await envelope()));
      });
      await assert.rejects(service.propose(createV2Context(), identity(f)), /unavailable/);
    }
    assert.equal(generations, 0); assert.equal((await f.ledger.snapshot()).reservations.length, 0);
  } finally { await cleanup(f); }
});

test("both generation retries have durable attempt records and identical counted bodies", async () => {
  const f = await setup(); let countBody = ""; let generations = 0;
  try {
    const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url, init) => {
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer synthetic-key");
      assert.ok(!(init?.body as string).includes(f.codes[0]));
      if (url === V2_META_INPUT_TOKENS_ENDPOINT) { countBody = init?.body as string; return counter(100); }
      generations += 1; assert.equal(init?.body, countBody);
      const disk = JSON.parse(await readFile(join(f.root, "live-proposal-budget.json"), "utf8")).payload;
      assert.equal(disk.reservations.length, 1);
      assert.equal(disk.reservations[0].attempts.length, generations);
      assert.equal(disk.reservations[0].attempts.at(-1).number, generations);
      assert.equal(disk.reservations[0].requestDigest, hash(JSON.parse(countBody)));
      return generations === 1 ? new Response("", { status: 503 }) : new Response(JSON.stringify(await envelope()));
    });
    await service.propose(createV2Context(), await service.authorize("Bearer " + f.codes[0]));
    assert.equal(generations, 2);
    const state = await f.ledger.snapshot();
    assert.equal(state.reservations.length * LIVE_PROPOSAL_POLICY.reservationMicrousd, 50_000);
    assert.equal(state.reservations[0].status, "proposal");
    assert.deepEqual(state.reservations[0].attempts[1].usage, { inputTokens: 100, outputTokens: 10, totalTokens: 110 });
  } finally { await cleanup(f); }
});

test("unexpected provider profiles, output states and accounting stop further live admission", async () => {
  const changes: ((value: any) => void)[] = [
    (v) => { v.model = "other-model"; }, (v) => { v.status = "incomplete"; },
    (v) => { v.output[1].content = [{ type: "refusal", refusal: "private-provider-secret" }]; },
    (v) => { v.output.push({ type: "web_search_call" }); }, (v) => { v.output.push(null); },
    (v) => { v.output.push(structuredClone(v.output[1])); },
    (v) => { v.output[1].status = "incomplete"; }, (v) => { delete v.output[1].status; },
    (v) => { v.usage.input_tokens = -1; }, (v) => { v.usage.total_tokens = 999; },
    (v) => { v.usage.output_tokens = 4097; v.usage.total_tokens = v.usage.input_tokens + 4097; }
  ];
  for (const change of changes) {
    const f = await setup(); let generations = 0;
    try {
      const value = await envelope(); change(value);
      const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url) => {
        if (url === V2_META_INPUT_TOKENS_ENDPOINT) return counter(100);
        generations += 1; return new Response(JSON.stringify(value));
      });
      await assert.rejects(service.propose(createV2Context(), identity(f)), (error: Error) => {
        assert.doesNotMatch(error.message, /private-provider-secret/); return true;
      });
      assert.equal(generations, 1); assert.ok((await f.ledger.snapshot()).liveAdmissionBlocked);
      await assert.rejects(service.authorize("Bearer " + f.codes[0]), /unavailable/);
      assert.equal(generations, 1);
    } finally { await cleanup(f); }
  }
});

test("live ledger enforces concurrent three-per-code and all fifty reservations across restart", async () => {
  const f = await setup(18);
  try {
    const settled = await Promise.allSettled(Array.from({ length: 4 }, () => f.ledger.reserve(identity(f), hash("same"), 100)));
    assert.equal(settled.filter((result) => result.status === "fulfilled").length, 3);
    for (let index = 3; index < 50; index += 1)
      await f.ledger.reserve(identity(f, Math.floor(index / 3)), hash(index), 100);
    assert.equal((await f.ledger.snapshot()).reservations.length * LIVE_PROPOSAL_POLICY.reservationMicrousd, 2_500_000);
    await assert.rejects(f.ledger.preflight(identity(f, 17)), /exhausted/);
    await f.ledger.close();
    const reopened = await LiveProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.key });
    try {
      const state = await reopened.snapshot();
      assert.equal(state.reservations.length, 50);
      assert.ok(state.reservations.every((item) => item.status === "interrupted"));
      await assert.rejects(reopened.reserve(identity(f, 17), hash("new"), 100), /exhausted/);
    } finally { await reopened.close(); }
  } finally { await cleanup(f); }
});

test("live signed state rejects invalid policy, transitions, usage and legacy/orphan artifacts", async () => {
  const f = await setup();
  try {
    const id = await f.ledger.reserve(identity(f), hash("one"), 100);
    await f.ledger.beforeAttempt(id, 1); await f.ledger.usage(id, { inputTokens: 100, outputTokens: 10, totalTokens: 110 });
    await f.ledger.finish(id, "proposal"); await f.ledger.close();
    const path = join(f.root, "live-proposal-budget.json");
    const original = JSON.parse(await readFile(path, "utf8"));
    const changes: ((p: any) => void)[] = [
      (p) => { p.version = "1"; }, (p) => { p.policy.maxOutputTokens = 4097; },
      (p) => { p.reservations.push(structuredClone(p.reservations[0])); },
      (p) => { p.reservations = Array.from({ length: 4 }, () => ({ ...structuredClone(p.reservations[0]), id: randomUUID() })); },
      (p) => { p.reservations[0].status = "reserved"; },
      (p) => { p.reservations[0].attempts[0].number = 3; },
      (p) => { p.reservations[0].attempts[0].usage = null; },
      (p) => { p.reservations[0].attempts[0].usage = { inputTokens: 101, outputTokens: 10, totalTokens: 111 }; },
      (p) => { p.reservations[0].attempts[0].usage = { inputTokens: -1, outputTokens: 10, totalTokens: 9 }; },
      (p) => { p.reservations[0].completedAt = "2000-01-01T00:00:00.000Z"; }
    ];
    for (const change of changes) {
      const payload = structuredClone(original.payload); change(payload);
      const mac = createHmac("sha256", f.key).update(JSON.stringify(payload)).digest("hex");
      await writeFile(path, JSON.stringify({ payload, mac }));
      await assert.rejects(async () => {
        const opened = await LiveProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.key }); await opened.close();
      }, /unavailable/);
    }
    const legacy = join(f.root, "legacy"); await mkdir(legacy);
    await writeFile(join(legacy, "proposal-budget.lock"), "old-owner");
    await assert.rejects(LiveProposalBudgetLedger.initialize({ dataDir: legacy, ledgerKey: f.key }), /unavailable/);
    await writeFile(path, JSON.stringify(original));
    const opened = await LiveProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.key });
    await opened.close();
  } finally { await cleanup(f); }
});

test("live persistence failures prevent dispatch or preserve the full uncertain reservation", { skip: process.getuid?.() === 0 }, async () => {
  for (const afterGeneration of [false, true]) {
    const f = await setup(); let generations = 0;
    try {
      const service = new LiveMetaProposalService(f.ledger, f.registry, "synthetic-key", async (url) => {
        if (url === V2_META_INPUT_TOKENS_ENDPOINT) {
          if (!afterGeneration) await chmod(f.root, 0o500);
          return counter(100);
        }
        generations += 1; await chmod(f.root, 0o500); return new Response(JSON.stringify(await envelope()));
      });
      await assert.rejects(service.propose(createV2Context(), identity(f)), /unavailable/);
      assert.equal(generations, afterGeneration ? 1 : 0);
      await chmod(f.root, 0o700);
      await assert.rejects(f.ledger.preflight(identity(f)), /unavailable/);
      await f.ledger.close();
      const reopened = await LiveProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.key });
      try {
        const state = await reopened.snapshot();
        assert.equal(state.reservations.length, afterGeneration ? 1 : 0);
        if (afterGeneration) assert.equal(state.reservations[0].status, "interrupted");
      } finally { await reopened.close(); }
    } finally { await cleanup(f); }
  }
});

