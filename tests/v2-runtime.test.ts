import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createV2Context } from "../src/v2-checkout.js";
import { validateSuiteProposal } from "../src/v2-planner.js";
import { V2Store } from "../src/v2-store.js";
import { classifyComparison, createV2Runtime } from "../src/v2-runner.js";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";

const proposalFor = (context = createV2Context()) => ({
  kind: "proposal" as const,
  requirement: { version: "2" as const, originalText: context.requirement.originalText, criteria: context.requirement.criteria, numericRuleChanges: [], expectationScope: context.requirement.expectationScope, coverageGaps: [] },
  cases: [{
    id: "coupon", criterionIds: ["cart", "coupon", "delivery", "contact"], category: "negative" as const, rationale: "Checks the explicit invalid coupon response.",
    actions: [
      { id: "open", kind: "open-app" as const, target: "checkout" as const, value: null },
      { id: "lamp", kind: "add-product" as const, target: "desk-lamp" as const, value: null },
      { id: "coupon", kind: "fill-coupon" as const, target: "coupon" as const, value: "NOPE" },
      { id: "apply", kind: "apply-coupon" as const, target: "coupon" as const, value: null }
    ],
    assertions: [{ id: "coupon-error", predicate: "coupon-error" as const }]
  }],
  gaps: []
});

const reviewFor = (context = createV2Context()) => ({ decisions: context.requirement.criteria.map((criterion) => ({
  criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged" as const,
  adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: [], acceptedNumericRuleChanges: []
})) });

async function prepared(store: V2Store, context = createV2Context()) {
  const proposal = await store.createProposal(validateSuiteProposal(proposalFor(context), context), context);
  return store.reviewProposal(proposal.id, reviewFor(context));
}

test("one-use approval binds the exact reviewed snapshot, expires, and rejects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-store-"));
  try {
    let now = 1_000;
    const store = new V2Store(root, () => now);
    const suite = await prepared(store);
    const approval = await store.approveSuite(suite.id);
    assert.equal(approval.digest, suite.digest);
    const consumed = await store.consumeApproval(approval.id);
    assert.equal(consumed.digest, suite.digest);
    await assert.rejects(store.consumeApproval(approval.id), /already been used/i);

    const expiring = await store.approveSuite(suite.id);
    now += 600_000;
    await assert.rejects(store.consumeApproval(expiring.id), /expired/i);

    const tampered = await store.approveSuite(suite.id);
    store.testOnlyTamperApproval(tampered.id);
    await assert.rejects(store.consumeApproval(tampered.id), /integrity/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime admits exactly one durable job before asynchronous execution and keeps the 50-job accounting", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-runtime-"));
  try {
    const store = new V2Store(root);
    const suite = await prepared(store);
    const first = await store.approveSuite(suite.id);
    const second = await store.approveSuite(suite.id);
    let release: (() => void) | undefined;
    const runtime = createV2Runtime(store, "http://127.0.0.1:4173", { execute: async () => await new Promise<void>(resolve => { release = resolve; }) });
    const started = await runtime.start(first.id);
    assert.equal((await store.readJob(started.runId)).status, "running");
    await assert.rejects(runtime.start(second.id), /already in progress/i);
    assert.equal((await store.consumeApproval(second.id)).digest, suite.digest);
    release?.();

    const limited = new V2Store(join(root, "limit"));
    await limited.testOnlySetExecutionCount(50);
    const limitedSuite = await prepared(limited);
    const limitedApproval = await limited.approveSuite(limitedSuite.id);
    await assert.rejects(limited.createJob(await limited.consumeApproval(limitedApproval.id)), /50/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("comparison keeps verdict and coverage separate", () => {
  assert.equal(classifyComparison({ verdict: "PASS", fingerprint: "a", observed: true }, { verdict: "FAIL", fingerprint: "a", observed: true }, "unchanged"), "regression");
  assert.equal(classifyComparison({ verdict: "FAIL", fingerprint: "a", observed: true }, { verdict: "PASS", fingerprint: "a", observed: true }, "unchanged"), "resolved-failure");
  assert.equal(classifyComparison({ verdict: "FAIL", fingerprint: "a", observed: true }, { verdict: "FAIL", fingerprint: "a", observed: true }, "unchanged"), "persistent-failure");
  assert.equal(classifyComparison({ verdict: "PASS", fingerprint: "a", observed: true }, { verdict: "PASS", fingerprint: "a", observed: true }, "unchanged"), "stable-observation");
  assert.equal(classifyComparison({ verdict: "PASS", fingerprint: "a", observed: false }, { verdict: "PASS", fingerprint: "a", observed: true }, "unchanged"), "inconclusive");
  assert.equal(classifyComparison({ verdict: "PASS", fingerprint: "a", observed: true }, { verdict: "PASS", fingerprint: "b", observed: true }, "unchanged"), "non-comparable");
  assert.equal(classifyComparison({ verdict: "PASS", fingerprint: "a", observed: true }, { verdict: "FAIL", fingerprint: "a", observed: true }, "new-or-changed"), "expectation-not-met");
});

test("v2 HTTP routes use exact local JSON requests and never create an approval for a malformed review", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-http-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const probeAddress = probe.address();
  assert.ok(probeAddress && typeof probeAddress !== "string");
  const port = probeAddress.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const instance = createProofPathServer(port, createPlanner({ PLANNER_MODE: "fixture" }));
  await new Promise<void>((resolve) => instance.server.listen(port, "127.0.0.1", resolve));
  const address = instance.server.address();
  assert.ok(address && typeof address !== "string");
  const context = createV2Context(instance.origin);
  const send = (path: string, body?: unknown, headers: Record<string, string> = {}) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: "127.0.0.1", port: address.port, path, method: text === undefined ? "GET" : "POST", headers: { Host: new URL(instance.origin).host, Origin: instance.origin, "Content-Type": "application/json", ...headers } }, res => {
      let received = ""; res.setEncoding("utf8"); res.on("data", chunk => received += chunk); res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(received) }));
    });
    req.on("error", reject); req.end(text);
  });
  try {
    assert.equal((await send("/api/v2/groundings")).status, 200);
    assert.equal((await send("/api/v2/proposals", { proposal: proposalFor(context), unexpected: true })).status, 400);
    assert.equal((await send("/api/v2/proposals", { proposal: proposalFor(context) }, { Origin: "http://attacker.invalid" })).status, 400);
    const proposal = await send("/api/v2/proposals", { proposal: proposalFor(context) });
    assert.equal(proposal.status, 201);
    assert.equal((await send(`/api/v2/proposals/${proposal.body.id}/review`, { review: {}, unexpected: true })).status, 400);
    const reviewed = await send(`/api/v2/proposals/${proposal.body.id}/review`, { review: reviewFor(context) });
    assert.equal(reviewed.status, 201);
    assert.equal((await send(`/api/v2/suites/${reviewed.body.id}/approve`, { later: true })).status, 400);
  } finally {
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    previous === undefined ? delete process.env.DATA_DIR : process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
