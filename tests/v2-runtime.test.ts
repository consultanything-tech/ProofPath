import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function failingCouponRecord(releaseId: "r1" | "r2") {
  const now = new Date().toISOString();
  return {
    caseId: "coupon",
    releaseId,
    actions: ["open", "lamp", "coupon", "apply"].map((id) => ({ id, status: "completed" as const, startedAt: now, endedAt: now, url: "http://127.0.0.1:4173" })),
    assertions: [{ id: "coupon-error", expected: "invalid-coupon", observed: "unexpected", verdict: "FAIL" as const, screenshot: "not-captured.png", timestamp: now, url: "http://127.0.0.1:4173" }],
    verdict: "FAIL" as const,
    startedAt: now,
    endedAt: now
  };
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

test("persisted completed-case failures survive recovery and terminal completion cannot fabricate a PASS", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-recovery-"));
  try {
    const store = new V2Store(root);
    const suite = await prepared(store);
    const approval = await store.consumeApproval((await store.approveSuite(suite.id)).id);
    const job = await store.createJob(approval);
    await store.markRunning(job.id);
    await store.appendRecord(job.id, failingCouponRecord("r1"));
    const restarted = new V2Store(root);
    assert.equal(await restarted.recoverInterruptedJobs(), 1);
    const recovered = await restarted.readJob(job.id);
    assert.equal(recovered.status, "interrupted");
    assert.equal(recovered.records[0]!.verdict, "FAIL");

    const second = new V2Store(join(root, "second"));
    const secondSuite = await prepared(second);
    const secondApproval = await second.consumeApproval((await second.approveSuite(secondSuite.id)).id);
    const secondJob = await second.createJob(secondApproval);
    await second.markRunning(secondJob.id);
    const incomplete = await second.completeJob(secondJob.id, [], []);
    assert.equal(incomplete.verdict, "INCONCLUSIVE");
    assert.equal(incomplete.records.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("completed PASS requires intact evidence and corrupt durable state fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-evidence-"));
  try {
    const store = new V2Store(root);
    const suite = await prepared(store);
    const approval = await store.consumeApproval((await store.approveSuite(suite.id)).id);
    const job = await store.createJob(approval);
    await store.markRunning(job.id);
    const records = await Promise.all(["r1", "r2"].map(async (releaseId) => {
      const screenshot = `coupon-${releaseId}-coupon-error.png`;
      const bytes = Buffer.from(`evidence-${releaseId}`);
      await mkdir(store.runDirectory(job.id), { recursive: true });
      await writeFile(join(store.runDirectory(job.id), screenshot), bytes);
      return { caseId: "coupon", releaseId: releaseId as "r1" | "r2", actions: ["open", "lamp", "coupon", "apply"].map((id) => ({ id, status: "completed" as const, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), url: "http://127.0.0.1:4173" })), assertions: [{ id: "coupon-error", expected: "invalid-coupon", observed: "invalid-coupon", verdict: "PASS" as const, screenshot, screenshotSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, timestamp: new Date().toISOString(), url: "http://127.0.0.1:4173" }], verdict: "PASS" as const, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() };
    }));
    const completed = await store.completeJob(job.id, records, []);
    assert.equal(completed.verdict, "PASS");
    await store.readJob(job.id);
    const statePath = join(root, "runs", "v2", "state.json");
    const nestedCorruption = JSON.parse(await readFile(statePath, "utf8"));
    nestedCorruption.runs[job.id].records[0].actions[0].id = "wrong-action";
    await writeFile(statePath, JSON.stringify(nestedCorruption));
    await assert.rejects(new V2Store(root).readJob(job.id), /corrupt/i);
    await writeFile(join(store.runDirectory(job.id), records[0]!.assertions[0]!.screenshot), "tampered");
    await assert.rejects(store.readJob(job.id), /evidence/i);

    const corrupt = join(root, "corrupt", "runs", "v2");
    await mkdir(corrupt, { recursive: true });
    await writeFile(join(corrupt, "state.json"), JSON.stringify({ version: "2", executionCount: 0, suites: { bad: {} }, runs: {}, regressions: {} }));
    await assert.rejects(new V2Store(join(root, "corrupt")).recoverInterruptedJobs(), /fail-closed/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("finalization rejects empty or wrong reviewed action/assertion sets and retains reviewed gaps", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-completeness-"));
  try {
    const store = new V2Store(root);
    const suite = await prepared(store);
    const approval = await store.consumeApproval((await store.approveSuite(suite.id)).id);
    const job = await store.createJob(approval);
    await store.markRunning(job.id);
    const emptyPairs = ["r1", "r2"].map((releaseId) => ({ caseId: "coupon", releaseId: releaseId as "r1" | "r2", actions: [], assertions: [], verdict: "PASS" as const, startedAt: new Date().toISOString(), endedAt: new Date().toISOString() }));
    await assert.rejects(store.completeJob(job.id, emptyPairs, []), /action|assertion/i);
    const wrongActionPairs = ["r1", "r2"].map((releaseId) => ({ ...failingCouponRecord(releaseId as "r1" | "r2"), actions: failingCouponRecord(releaseId as "r1" | "r2").actions.map((action, index) => index === 0 ? { ...action, id: "wrong-action" } : action) }));
    await assert.rejects(store.completeJob(job.id, wrongActionPairs, []), /action/i);
    const artifactStore = new V2Store(join(root, "artifact"));
    const artifactSuite = await prepared(artifactStore);
    const artifactJob = await artifactStore.createJob(await artifactStore.consumeApproval((await artifactStore.approveSuite(artifactSuite.id)).id));
    await artifactStore.markRunning(artifactJob.id);
    artifactStore.writeManifest = async () => { throw new Error("disk failure"); };
    await assert.rejects(artifactStore.completeJob(artifactJob.id, [], []), /artifact/i);
    await assert.rejects(artifactStore.readJob(artifactJob.id), /fail-closed/i);
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

test("durable comparisons retain an inconclusive observation despite intact evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-inconclusive-"));
  try {
    const store = new V2Store(root);
    const suite = await prepared(store);
    const job = await store.createJob(await store.consumeApproval((await store.approveSuite(suite.id)).id));
    await store.markRunning(job.id);
    const records = await Promise.all(["r1", "r2"].map(async (releaseId) => {
      const screenshot = `coupon-${releaseId}-coupon-error.png`;
      const bytes = Buffer.from(`intact-${releaseId}`);
      await mkdir(store.runDirectory(job.id), { recursive: true });
      await writeFile(join(store.runDirectory(job.id), screenshot), bytes);
      return {
        ...failingCouponRecord(releaseId as "r1" | "r2"),
        assertions: [{ id: "coupon-error", expected: "invalid-coupon", observed: releaseId === "r1" ? "invalid-coupon" : null, verdict: releaseId === "r1" ? "PASS" as const : "INCONCLUSIVE" as const, screenshot, screenshotSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`, timestamp: new Date().toISOString(), url: "http://127.0.0.1:4173" }],
        verdict: releaseId === "r1" ? "PASS" as const : "INCONCLUSIVE" as const
      };
    }));
    const complete = await store.completeJob(job.id, records, []);
    assert.equal(complete.verdict, "INCONCLUSIVE");
    assert.deepEqual(complete.comparisons, [{ caseId: "coupon", classification: "inconclusive" }]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("v2 HTTP routes use exact local JSON requests and never create an approval for a malformed review", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-http-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  let inspections = 0;
  let proposals = 0;
  let proposedSource = "";
  const source = "Cart quantity stays between one and five. SAVE10 coupon is applied once. Delivery is free at the reviewed threshold. Contact email and postal code are required.";
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const probeAddress = probe.address();
  assert.ok(probeAddress && typeof probeAddress !== "string");
  const port = probeAddress.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const instance = createProofPathServer(port, createPlanner({ PLANNER_MODE: "fixture" }), {
    inspect: async (input) => { inspections += 1; return { ...input.grounding, observedTargets: ["checkout"] }; },
    propose: async (input) => { proposals += 1; proposedSource = input.requirement.originalText; assert.ok(input.requirement.criteria.every((criterion) => source.includes(criterion.sourceQuote))); return validateSuiteProposal(proposalFor(input), input); }
  });
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
    assert.equal(inspections, 1);
    assert.equal((await send("/api/v2/proposals", { requirement: source, releases: ["r1", "r2"], unexpected: true })).status, 400);
    assert.equal((await send("/api/v2/proposals", { requirement: source, releases: ["r1", "r2"] }, { Origin: "http://attacker.invalid" })).status, 400);
    assert.equal((await send("/api/v2/proposals", { requirement: "Unrelated source.", releases: ["r1", "r2"] })).body.kind, "clarification");
    const proposal = await send("/api/v2/proposals", { requirement: source, releases: ["r1", "r2"] });
    assert.equal(proposal.status, 201);
    assert.equal(proposals, 1);
    assert.equal(proposedSource, source);
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
