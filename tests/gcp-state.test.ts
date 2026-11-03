import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { V2Store } from "../src/v2-store.js";
import { createV2Context } from "../src/v2-checkout.js";
import { createV2Planner } from "../src/v2-planner.js";
import { createPlanner } from "../src/planner.js";
import { getScenario } from "../src/scenarios.js";
import { LiveProposalBudgetLedgerV3 } from "../src/v2-live-ledger-v3.js";
import { ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";
import { GcpJobs } from "../src/gcp/jobs.js";
import { GcpActivityGate } from "../src/gcp/activity.js";
import { PlanStore } from "../src/plan-store.js";
import { encodeImport, verifyImport } from "../src/gcp/import.js";
import { GcpV2Store, GcpPlans, jobFromRecords, snapshotToRecords, type Job } from "../src/gcp/state.js";
import { FirestoreLiveLedger } from "../src/gcp/ledger.js";
import { gcpConfig } from "../src/gcp/config.js";
import type { Repository, Records } from "../src/gcp/repository.js";
import { sha256, type EvidenceObjects, type ObjectRef } from "../src/gcp/evidence.js";

import { MemoryRepository, MemoryEvidence } from "./helpers/gcp.js";
const config = gcpConfig({ PROOFPATH_ROLE: "web", GCP_DATA_PROFILE: "fixture", GCP_PROJECT_ID: "proofpath-test", GCP_REGION: "asia-southeast1", GCP_STATE_NAMESPACE: "fixture-tests", GCP_EVIDENCE_BUCKET: "proofpath-test-evidence", GCP_TASKS_QUEUE: "proofpath-runs", GCP_WORKER_URL: "https://worker.example", GCP_TASK_CALLER_SERVICE_ACCOUNT: "tasks@proofpath-test.iam.gserviceaccount.com", PUBLIC_ORIGIN: "https://web.example" });
function fixture() { const repo = new MemoryRepository(); snapshotToRecords(repo.records, V2Store.emptySnapshot()); const objects = new MemoryEvidence(); return { repo, objects, store: new GcpV2Store(repo, objects, config.namespace) }; }
test("planning coordination survives instance replacement and fails closed on an expired request", async () => {
  const repo = new MemoryRepository(); let now = Date.now();
  const first = new GcpActivityGate(repo, () => now); const second = new GcpActivityGate(repo, () => now);
  assert.equal(await first.acquire(), true); assert.equal(await second.acquire(), false);
  await first.release(); assert.equal(await second.acquire(), true);
  now += 240_001;
  await assert.rejects(second.release(), /reconciliation/);
  await assert.rejects(new GcpActivityGate(repo, () => now).acquire(), /reconciliation/);
  assert.ok(repo.records.has("planning-activity"));
});
test("restored V1 plans and pending V2 proposals reject invalid approval and changed proposal IDs", async () => {
  const plans = new PlanStore(); const scenario = getScenario("add-to-cart", "baseline");
  const response = await createPlanner({ PLANNER_MODE: "fixture" }).propose("Add a lamp", scenario);
  plans.create("Add a lamp", scenario, response.plan!);
  const saved = plans.snapshot(); saved[0]!.consumed = true;
  assert.throws(() => PlanStore.restore(saved), /integrity/);
  saved[0]!.consumed = false; saved[0]!.approvedAt = -1;
  assert.throws(() => PlanStore.restore(saved), /integrity/);
  const { store, repo } = fixture(); await approved(store);
  const context = createV2Context(); await store.createProposal(await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context), context);
  const proposal = [...repo.records].find(([key]) => key.startsWith("proposal_"))![1] as { prepared: { id: string } };
  proposal.prepared.id = "changed";
  await assert.rejects(store.listRegressions(), /pending proposal/);
});
async function approved(store: GcpV2Store) {
  const context = createV2Context(); const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  assert.equal(proposal.kind, "proposal");
  const pending = await store.createProposal(proposal, context);
  const suite = await store.reviewProposal(pending.id, { decisions: context.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged", adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposal.gaps, acceptedNumericRuleChanges: [] })) });
  return store.approveSuite(suite.id);
}
test("GCP config rejects missing identity, mixed ports, noncanonical origin and worker model secrets", () => {
  assert.throws(() => gcpConfig({}), /PROOFPATH_ROLE/);
  const env = { PROOFPATH_ROLE: "worker", MODEL_API_KEY: "test-only" };
  assert.throws(() => gcpConfig(env));
});
test("V2 duplicate acceptance is one transaction; active and stale workers cannot execute again", async () => {
  const { repo, objects, store } = fixture(); const approval = await approved(store);
  const accepted = await Promise.all([store.accept(approval.id), store.accept(approval.id)]);
  assert.equal(accepted[0]!.runId, accepted[1]!.runId);
  assert.equal((repo.records.get("v2meta") as { executionCount: number }).executionCount, 1);
  const claim = await store.claimJob(approval.id); assert.ok(claim);
  await assert.rejects(store.claimJob(approval.id), /already running/);
  const stale = new GcpV2Store(repo, objects, config.namespace, { id: approval.id, fence: 0 });
  await assert.rejects(stale.writeScreenshot(approval.id, "proof.png", Buffer.from("test")), /stale/);
  await repo.withLock((r) => { const j = jobFromRecords(r, approval.id); r.set("job_" + approval.id, { ...j, until: Date.now() - 1 }); });
  assert.equal(await store.claimJob(approval.id), null);
  const run = await store.readJob(approval.id); assert.equal(run.status, "interrupted"); assert.equal(run.verdict, "INCONCLUSIVE");
  assert.equal(await store.claimJob(approval.id), null);
  await assert.rejects(new GcpV2Store(repo, objects, config.namespace, claim.claim).writeScreenshot(approval.id, "late.png", Buffer.from("test")), /stale/);
});
test("accepted jobs remain durable when enqueue fails and a later poll repairs dispatch", async () => {
  const { repo, objects, store } = fixture(); const approval = await approved(store); let calls = 0;
  const jobs = new GcpJobs(repo, objects, config, { async enqueue() { if (++calls === 1) throw new Error("fixture transport failure"); } });
  await jobs.startV2(approval.id);
  assert.equal(jobFromRecords(repo.records, approval.id).dispatch, "pending");
  await jobs.readV2(approval.id); assert.equal(jobFromRecords(repo.records, approval.id).dispatch, "queued");
  assert.equal((repo.records.get("v2meta") as { executionCount: number }).executionCount, 1);
});
test("V1 durable ownership and snapshot digest survive service replacement", async () => {
  const { repo } = fixture(); const plans = new GcpPlans(repo); const scenario = getScenario("quantity-update", "seeded-bug");
  const response = await createPlanner({ PLANNER_MODE: "fixture" }).propose("Quantity two totals S$78.", scenario); assert.equal(response.kind, "plan");
  const plan = await plans.create("Quantity two totals S$78.", scenario, response.plan!, undefined, "owner");
  await assert.rejects(plans.approve(plan.id, "another"), /Unknown/);
  await new GcpPlans(repo).approve(plan.id, "owner");
  await Promise.all([plans.accept(plan.id, "owner"), plans.accept(plan.id, "owner")]);
  assert.equal((repo.records.get("v1meta") as { count: number }).count, 1);
  await assert.rejects(plans.accept(plan.id, "another"), /Unknown/);
  await repo.withLock((r) => { const job = structuredClone(jobFromRecords(r, plan.id)); (job.approval as { envelope: { originalRequirement: string } }).envelope.originalRequirement = "tampered"; r.set("job_" + plan.id, job); });
  const { store } = { store: new GcpV2Store(repo, new MemoryEvidence(), config.namespace) };
  await assert.rejects(store.claimJob(plan.id), /snapshot changed/);
});
test("Firestore ledger retains imported reservations, limits and a durable usage-breach block", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-gcp-ledger-")); const key = randomBytes(32); const pepper = randomBytes(32); const code = "fixture-reviewer-code-only-123456";
  const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, code)]); const principal = registry.authenticate("Bearer " + code);
  const source = await LiveProposalBudgetLedgerV3.initialize({ dataDir: join(root, "ledger"), ledgerKey: key });
  try {
    for (let i = 0; i < 4; i++) { const id = await source.reserve(principal, "sha256:" + "a".repeat(64), 20); await source.beforeAttempt(id, 1); await source.usage(id, { inputTokens: 10, outputTokens: 10, totalTokens: 20 }); await source.finish(id, "proposal"); }
    const repo = new MemoryRepository(); repo.records.set("live-ledger", source.signedState()); snapshotToRecords(repo.records, V2Store.emptySnapshot()); const ledger = new FirestoreLiveLedger(repo, key);
    const bundle = encodeImport(repo.records, key, config.project, "live-import");
    assert.equal((await verifyImport(bundle, key, config.project, "live-import", new MemoryEvidence())).reservations, 4);
    await assert.rejects(verifyImport(bundle, key, config.project, "another-namespace", new MemoryEvidence()), /destination/);
    const tampered = JSON.parse(bundle.toString()); tampered.payload.records = [];
    await assert.rejects(verifyImport(Buffer.from(JSON.stringify(tampered)), key, config.project, "live-import", new MemoryEvidence()), /signature/);
    assert.equal((await ledger.snapshot()).reservations.length, 4); assert.equal((await ledger.snapshot()).policy.globalMicrousd, 2_500_000);
    const id = await ledger.reserve(principal, "sha256:" + "b".repeat(64), 20); await ledger.beforeAttempt(id, 1);
    await assert.rejects(ledger.usage(id, { inputTokens: 21, outputTokens: 1, totalTokens: 22 }));
    const reopened = new FirestoreLiveLedger(repo, key); assert.ok((await reopened.snapshot()).liveAdmissionBlocked); assert.equal((await reopened.snapshot()).reservations.length, 5);
    await assert.rejects(reopened.preflight(principal));
  } finally { await source.close(); await rm(root, { recursive: true, force: true }); }
});
