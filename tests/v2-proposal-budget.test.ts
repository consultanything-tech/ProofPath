import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  BudgetedMockProposalService, ProposalBudgetLedger, ReviewerCodeRegistry, TestOnlyInputAdmission,
  type AdmissionCertificate, type TrustedInputAdmission
} from "../src/v2-proposal-budget.js";
import { buildMetaSuiteRequest, createV2Planner } from "../src/v2-planner.js";
import { createV2Context } from "../src/v2-checkout.js";

const key = () => randomBytes(32);
const hash = (value: unknown) => "sha256:" + createHash("sha256").update(JSON.stringify(value)).digest("hex");
function certificate(requestDigest = "sha256:" + "a".repeat(64)): AdmissionCertificate {
  return { requestDigest, model: "muse-spark-1.3", billableInputTokens: 6073,
    method: "test-only", certificateId: "offline-meter", measuredAt: new Date().toISOString() };
}
function candidate(context = createV2Context(), kind: "proposal" | "clarification" = "proposal") {
  return { kind, requirement: { version: "2", originalText: context.requirement.originalText,
    criteria: context.requirement.criteria, numericRuleChanges: [], expectationScope: context.requirement.expectationScope,
    coverageGaps: [] }, cases: kind === "clarification" ? [] : [{
      id: "coupon", criterionIds: ["cart", "coupon", "delivery", "contact"], category: "negative",
      rationale: "Checks coupon feedback.", actions: [
        { id: "open", kind: "open-app", target: "checkout", value: null },
        { id: "lamp", kind: "add-product", target: "desk-lamp", value: null },
        { id: "coupon", kind: "fill-coupon", target: "coupon", value: "NOPE" },
        { id: "apply", kind: "apply-coupon", target: "coupon", value: null }
      ], assertions: [{ id: "coupon-error", predicate: "coupon-error" }]
    }], gaps: kind === "clarification" ? ["Clarify the requested coverage."] : [] };
}
function response(context = createV2Context(), kind: "proposal" | "clarification" = "proposal") {
  return new Response(JSON.stringify({ model: "muse-spark-1.3", choices: [
    { finish_reason: "stop", message: { content: JSON.stringify(candidate(context, kind)) } }
  ] }), { status: 200 });
}
async function setup(count = 1) {
  const root = await mkdtemp(join(tmpdir(), "proofpath-budget-"));
  const ledgerKey = key(); const pepper = key();
  const codes = Array.from({ length: count }, () => randomBytes(24).toString("base64url"));
  const registry = new ReviewerCodeRegistry(pepper, codes.map((code) => ReviewerCodeRegistry.digest(pepper, code)));
  const ledger = await ProposalBudgetLedger.initialize({ dataDir: root, ledgerKey });
  return { root, ledgerKey, pepper, codes, registry, ledger };
}
type Fixture = Awaited<ReturnType<typeof setup>>;
const principal = (fixture: Fixture, index = 0) => fixture.registry.authenticate("Bearer " + fixture.codes[index]);
async function cleanup(fixture: Fixture) {
  await chmod(fixture.root, 0o700).catch(() => {});
  await fixture.ledger.close().catch(() => {});
  await rm(fixture.root, { recursive: true, force: true });
}

test("initialization, authenticated ownership and missing state never silently reset a budget", async () => {
  const f = await setup();
  try {
    await assert.rejects(ProposalBudgetLedger.initialize({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await f.ledger.close();
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: key() }), /unavailable/);
    const reopened = await ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey });
    await reopened.close();
    await unlink(join(f.root, "proposal-budget.json"));
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await assert.rejects(ProposalBudgetLedger.initialize({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: join(f.root, "missing"), ledgerKey: f.ledgerKey }), /unavailable/);
    const orphan = join(f.root, "orphan"); await mkdir(orphan);
    await writeFile(join(orphan, "proposal-budget.json.abandoned.tmp"), "incomplete");
    await assert.rejects(ProposalBudgetLedger.initialize({ dataDir: orphan, ledgerKey: f.ledgerKey }), /unavailable/);
  } finally { await cleanup(f); }
});

test("four concurrent reservations admit only three and authenticated identities cannot be mutated", async () => {
  const f = await setup();
  try {
    const identity = principal(f);
    assert.throws(() => { (identity as { key: string }).key = "b".repeat(64); }, TypeError);
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => f.ledger.reserve(identity, certificate())));
    assert.equal(results.filter((item) => item.status === "fulfilled").length, 3);
    assert.deepEqual((await f.ledger.snapshot()).counts, { used: 3, money: 150_000 });
    await assert.rejects(f.ledger.preflight(identity), /exhausted/);
    assert.throws(() => f.registry.authenticate("Bearer " + randomBytes(24).toString("base64url")), /access/);
    const service = new BudgetedMockProposalService(f.ledger, f.registry, new TestOnlyInputAdmission(0), async () => response());
    await assert.rejects(service.propose(createV2Context(), { key: identity.key } as never), /access/);
  } finally { await cleanup(f); }
});

test("fifty proposals reserve exactly USD2.50 across valid codes and survive restart", async () => {
  const f = await setup(18);
  try {
    for (let index = 0; index < 50; index += 1) {
      const id = await f.ledger.reserve(principal(f, Math.floor(index / 3)), certificate());
      await f.ledger.beforeAttempt(id, 1);
      await f.ledger.finish(id, "clarification");
    }
    assert.deepEqual((await f.ledger.snapshot()).counts, { used: 50, money: 2_500_000 });
    await assert.rejects(f.ledger.preflight(principal(f, 17)), /exhausted/);
    await f.ledger.close();
    const reopened = await ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey });
    try {
      assert.deepEqual((await reopened.snapshot()).counts, { used: 50, money: 2_500_000 });
      await assert.rejects(reopened.reserve(principal(f, 17), certificate()), /exhausted/);
    } finally { await reopened.close(); }
  } finally { await cleanup(f); }
});

test("reservation and both retry attempts are on disk before transport and bind the exact request", async () => {
  const f = await setup(); const calls: number[] = [];
  try {
    const service = new BudgetedMockProposalService(f.ledger, f.registry, new TestOnlyInputAdmission(6073), async (_url, options) => {
      const disk = JSON.parse(await readFile(join(f.root, "proposal-budget.json"), "utf8")).payload;
      const reservation = disk.reservations[0];
      assert.equal(reservation.status, "dispatching");
      assert.equal(reservation.reservedMicrousd, 50_000);
      assert.equal(reservation.requestDigest, hash(JSON.parse(options!.body as string)));
      calls.push(reservation.attempts.length);
      return calls.length === 1 ? new Response("", { status: 503 }) : response();
    });
    const result = await service.propose(createV2Context(), await service.authorize("Bearer " + f.codes[0]));
    assert.equal(result.proposal.kind, "proposal"); assert.deepEqual(calls, [1, 2]);
    assert.deepEqual(result.provenance, ["budgeted-test-only-v2", "reservation:" + result.reservationId]);
    const saved = await f.ledger.snapshot();
    assert.equal(saved.reservations[0].status, "proposal");
    assert.deepEqual(saved.counts, { used: 1, money: 50_000 });
    const raw = await readFile(join(f.root, "proposal-budget.json"), "utf8");
    for (const secret of [f.codes[0], f.ledgerKey.toString("hex"), f.pepper.toString("hex")]) assert.ok(!raw.includes(secret));
    assert.throws(() => createV2Planner({ V2_PLANNER_MODE: "meta" }), /disabled/);
  } finally { await cleanup(f); }
});

test("unfinished reservations become interrupted without refund and terminal jobs cannot dispatch again", async () => {
  const f = await setup();
  try {
    const id = await f.ledger.reserve(principal(f), certificate());
    const reserved = await f.ledger.reserve(principal(f), certificate());
    await assert.rejects(f.ledger.beforeAttempt(id, 2), /unavailable/);
    await f.ledger.beforeAttempt(id, 1);
    await assert.rejects(f.ledger.beforeAttempt(id, 1), /unavailable/);
    await assert.rejects(f.ledger.beforeAttempt(id, 3 as never), /unavailable/);
    await f.ledger.close();
    await assert.rejects(f.ledger.reserve(principal(f), certificate()), /unavailable/);
    const reopened = await ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey });
    try {
      const saved = await reopened.snapshot();
      assert.deepEqual(saved.counts, { used: 2, money: 100_000 });
      assert.deepEqual(saved.reservations.map((item) => item.status), ["interrupted", "interrupted"]);
      assert.deepEqual(saved.reservations.map((item) => item.attempts.length), [1, 0]);
      await assert.rejects(reopened.beforeAttempt(id, 2), /unavailable/);
      await assert.rejects(reopened.beforeAttempt(reserved, 1), /unavailable/);
      const final = await reopened.reserve(principal(f), certificate());
      await reopened.beforeAttempt(final, 1); await reopened.beforeAttempt(final, 2);
      await reopened.finish(final, "proposal");
      await assert.rejects(reopened.beforeAttempt(final, 2), /unavailable/);
      await assert.rejects(reopened.finish(final, "clarification"), /unavailable/);
      await assert.rejects(reopened.preflight(principal(f)), /exhausted/);
    } finally { await reopened.close(); }
  } finally { await cleanup(f); }
});

test("signed but malformed or over-limit state is rejected, including duplicate IDs and policy drift", async () => {
  const f = await setup();
  try {
    const id = await f.ledger.reserve(principal(f), certificate());
    await f.ledger.beforeAttempt(id, 1); await f.ledger.finish(id, "proposal"); await f.ledger.close();
    const path = join(f.root, "proposal-budget.json");
    const valid = JSON.parse(await readFile(path, "utf8"));
    const mutations: ((payload: any) => void)[] = [
      (p) => { p.policy.globalLimit = 51; },
      (p) => { p.reservations.push(structuredClone(p.reservations[0])); },
      (p) => { p.reservations = Array.from({ length: 4 }, () => ({ ...structuredClone(p.reservations[0]), id: randomUUID() })); },
      (p) => { p.reservations = Array.from({ length: 51 }, (_, i) => ({ ...structuredClone(p.reservations[0]), id: randomUUID(), reviewerKey: createHash("sha256").update(String(i)).digest("hex") })); },
      (p) => { p.reservations[0].reservedMicrousd = 0; },
      (p) => { p.reservations[0].inputTokens = 6074; },
      (p) => { p.reservations[0].attempts[0].number = 2; },
      (p) => { p.reservations[0].attempts[0].startedAt = "yesterday"; },
      (p) => { p.reservations[0].attempts = []; },
      (p) => { p.reservations[0].status = "reserved"; },
      (p) => { p.reservations[0].completedAt = null; },
      (p) => { p.reservations[0].admission.method = "production"; },
      (p) => { p.reservations[0].admission.certificateId = "unsafe\nid"; },
      (p) => { p.reservations[0].admission.measuredAt = "2000-01-01T00:00:00.000Z"; },
      (p) => { p.reservations[0].unknown = "untrusted"; },
      (p) => { p.extra = true; }
    ];
    for (const mutate of mutations) {
      const payload = structuredClone(valid.payload); mutate(payload);
      const mac = createHmac("sha256", f.ledgerKey).update(JSON.stringify(payload)).digest("hex");
      await writeFile(path, JSON.stringify({ payload, mac }));
      await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    }
    await writeFile(path, JSON.stringify({ ...valid, mac: "0".repeat(64) }));
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await writeFile(path, JSON.stringify(valid));
    const reopened = await ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey });
    assert.equal((await reopened.snapshot()).counts.used, 1); await reopened.close();
  } finally { await cleanup(f); }
});

test("absent, forged, stale, malformed and mutating admission never reserves or fetches", async () => {
  const f = await setup(); let fetches = 0;
  try {
    const changes: ((value: any) => void)[] = [
      (v) => { v.billableInputTokens = 6074; }, (v) => { v.billableInputTokens = -1; },
      (v) => { v.billableInputTokens = 1.5; }, (v) => { v.billableInputTokens = NaN; },
      (v) => { v.billableInputTokens = Infinity; }, (v) => { v.billableInputTokens = Number.MAX_SAFE_INTEGER; },
      (v) => { v.model = "other"; }, (v) => { v.requestDigest = "sha256:" + "0".repeat(64); },
      (v) => { v.method = "bytes-divided-by-four"; }, (v) => { v.measuredAt = "2000-01-01T00:00:00.000Z"; },
      (v) => { v.measuredAt = new Date(Date.now() + 120_000).toISOString(); },
      (v) => { delete v.measuredAt; }, (v) => { v.certificateId = "\n"; }, (v) => { v.cost = 0; }
    ];
    const meters: (TrustedInputAdmission | undefined)[] = changes.map((change) => ({
      async assess(request) { const value = certificate(hash(request)); change(value); return value; }
    }));
    meters.push(undefined, { async assess() { throw new Error("private-provider-secret"); } },
      { async assess(request: any) { request.messages[1].content = "mutated"; return certificate(hash(request)); } });
    for (const meter of meters) {
      const service = new BudgetedMockProposalService(f.ledger, f.registry, meter, async () => { fetches += 1; return response(); });
      await assert.rejects(service.propose(createV2Context(), principal(f)), (error: Error) => {
        assert.equal(error.message, "Proposal admission is unavailable."); return true;
      });
    }
    assert.equal(fetches, 0); assert.equal((await f.ledger.snapshot()).counts.used, 0);
  } finally { await cleanup(f); }
});

test("source and registry caller mutations cannot change an admitted request or its identity", async () => {
  const f = await setup();
  try {
    const suppliedPepper = Buffer.from(f.pepper);
    const allow = [ReviewerCodeRegistry.digest(suppliedPepper, f.codes[0])];
    const registry = new ReviewerCodeRegistry(suppliedPepper, allow);
    suppliedPepper.fill(0); allow[0] = "0".repeat(64);
    const identity = registry.authenticate("Bearer " + f.codes[0]);
    const context = structuredClone(createV2Context()); const original = structuredClone(context);
    let admitted!: () => void; const waiting = new Promise<void>((resolve) => { admitted = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const service = new BudgetedMockProposalService(f.ledger, registry, {
      async assess(request) { admitted(); await gate; return certificate(hash(request)); }
    }, async (_url, options) => {
      assert.equal(hash(JSON.parse(options!.body as string)), hash(buildMetaSuiteRequest(original)));
      return response(original);
    });
    const pending = service.propose(context, identity);
    await waiting;
    (context.requirement as { originalText: string }).originalText = "changed after admission started";
    release();
    assert.equal((await pending).proposal.requirement.originalText, original.requirement.originalText);
  } finally { await cleanup(f); }
});

test("clarification, invalid output, timeout and ambiguous failures all retain the full reservation", async () => {
  const variants: { expected: string; attempts: number; fetcher: typeof fetch }[] = [
    { expected: "clarification", attempts: 1, fetcher: async () => response(createV2Context(), "clarification") },
    { expected: "failed-or-uncertain", attempts: 1, fetcher: async () => new Response("not-json") },
    { expected: "failed-or-uncertain", attempts: 1, fetcher: async () => { throw new DOMException("private-provider-secret", "TimeoutError"); } },
    { expected: "failed-or-uncertain", attempts: 2, fetcher: async () => { throw new Error("private-provider-secret"); } },
    { expected: "failed-or-uncertain", attempts: 2, fetcher: async () => new Response("", { status: 503 }) }
  ];
  for (const variant of variants) {
    const f = await setup();
    try {
      const service = new BudgetedMockProposalService(f.ledger, f.registry, new TestOnlyInputAdmission(10), variant.fetcher);
      const work = service.propose(createV2Context(), principal(f));
      if (variant.expected === "clarification") await work;
      else await assert.rejects(work, (error: Error) => { assert.equal(error.message, "Budgeted proposal was unavailable."); return true; });
      const saved = await f.ledger.snapshot();
      assert.deepEqual(saved.counts, { used: 1, money: 50_000 });
      assert.equal(saved.reservations[0].status, variant.expected);
      assert.equal(saved.reservations[0].attempts.length, variant.attempts);
    } finally { await cleanup(f); }
  }
});

test("filesystem persistence failures poison admission before dispatch and preserve uncertain reservations", { skip: process.getuid?.() === 0 }, async () => {
  for (const failAfterFetch of [false, true]) {
    const f = await setup(); let fetches = 0;
    try {
      const service = new BudgetedMockProposalService(f.ledger, f.registry, {
        async assess(request) {
          if (!failAfterFetch) await chmod(f.root, 0o500);
          return certificate(hash(request));
        }
      }, async () => { fetches += 1; await chmod(f.root, 0o500); return response(); });
      await assert.rejects(service.propose(createV2Context(), principal(f)), /unavailable/);
      assert.equal(fetches, failAfterFetch ? 1 : 0);
      await chmod(f.root, 0o700);
      await assert.rejects(f.ledger.snapshot(), /unavailable/);
      await assert.rejects(f.ledger.reserve(principal(f), certificate()), /unavailable/);
      await f.ledger.close();
      const reopened = await ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey });
      try {
        const saved = await reopened.snapshot();
        assert.equal(saved.counts.used, failAfterFetch ? 1 : 0);
        if (failAfterFetch) assert.equal(saved.reservations[0].status, "interrupted");
      } finally { await reopened.close(); }
    } finally { await cleanup(f); }
  }
});

test("a second process and a crash-left ownership lock both fail closed", async () => {
  const f = await setup();
  const run = promisify(execFile);
  const moduleUrl = new URL("../src/v2-proposal-budget.js", import.meta.url).href;
  const program = "import { ProposalBudgetLedger } from " + JSON.stringify(moduleUrl) + "; " +
    "try { await ProposalBudgetLedger.open({dataDir:process.env.BUDGET_TEST_DIR,ledgerKey:Buffer.from(process.env.BUDGET_TEST_KEY,'hex')}); " +
    "console.log('owned'); process.exit(0); } catch { console.log('blocked'); }";
  const env = { ...process.env, BUDGET_TEST_DIR: f.root, BUDGET_TEST_KEY: f.ledgerKey.toString("hex") };
  try {
    assert.equal((await run(process.execPath, ["--input-type=module", "-e", program], { env })).stdout.trim(), "blocked");
    await f.ledger.close();
    assert.equal((await run(process.execPath, ["--input-type=module", "-e", program], { env })).stdout.trim(), "owned");
    await assert.rejects(ProposalBudgetLedger.open({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
    await assert.rejects(ProposalBudgetLedger.initialize({ dataDir: f.root, ledgerKey: f.ledgerKey }), /unavailable/);
  } finally { await cleanup(f); }
});

