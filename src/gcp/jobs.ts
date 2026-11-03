import { CloudTasksClient } from "@google-cloud/tasks";
import { executePaired } from "../v2-runner.js";
import { runApprovedPlan, RunnerExecutionError } from "../runner.js";
import { aggregate } from "../verdict.js";
import type { RunManifest, ExecutionStatus } from "../evidence.js";
import type { SuiteApproval } from "../v2-contracts.js";
import type { ApprovalEnvelope } from "../plan-store.js";
import type { GcpConfig } from "./config.js";
import type { Repository } from "./repository.js";
import { GcpV2Store, GcpPlans, GcpEvidenceIO, requireClaim, jobFromRecords, type Claim } from "./state.js";
import { sha256, type EvidenceObjects } from "./evidence.js";
export interface Dispatcher { enqueue(id: string): Promise<void> }
export class TasksDispatcher implements Dispatcher {
  readonly client = new CloudTasksClient();
  constructor(readonly config: GcpConfig) {}
  async enqueue(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid approved job ID.");
    const c = this.config;
    try {
      await this.client.createTask({ parent: this.client.queuePath(c.project, c.region, c.queue), task: {
        name: this.client.taskPath(c.project, c.region, c.queue, "run-" + id), dispatchDeadline: { seconds: 300 },
        httpRequest: { httpMethod: "POST", url: c.workerUrl + "/internal/execute", headers: { "Content-Type": "application/json" }, body: Buffer.from(JSON.stringify({ runId: id })), oidcToken: { serviceAccountEmail: c.taskAccount, audience: c.workerUrl } }
      } });
    } catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
  }
}
export class GcpJobs {
  readonly v2: GcpV2Store; readonly plans: GcpPlans;
  constructor(readonly repo: Repository, readonly objects: EvidenceObjects, readonly config: GcpConfig, readonly dispatcher: Dispatcher) { this.v2 = new GcpV2Store(repo, objects, config.namespace); this.plans = new GcpPlans(repo); }
  async startV2(id: string) { const result = await this.v2.accept(id); await this.reconcile(id); return result; }
  async startV1(id: string, ownerKey?: string) { const result = await this.plans.accept(id, ownerKey); await this.reconcile(id); return { ...result, jobStatus: "accepted" }; }
  async reconcile(id: string) {
    const pending = await this.repo.withLock((r) => { const j = jobFromRecords(r, id); return j.status === "accepted" && j.dispatch === "pending"; });
    if (pending) {
      try { await this.dispatcher.enqueue(id); await this.repo.withLock((r) => { const j = jobFromRecords(r, id); r.set("job_" + id, { ...j, dispatch: "queued" }); }); }
      catch { /* The durable accepted job remains pending; polling and start retry reconcile it. */ }
    }
    const expired = await this.repo.withLock((r) => { const j = jobFromRecords(r, id); return (j.status === "running" && j.until <= Date.now()) || (j.status === "accepted" && Date.now() - j.createdAt > 600_000); });
    if (expired) await this.v2.claimJob(id);
  }
  async readV2(id: string) { await this.reconcile(id); return this.v2.readJob(id); }
  async readV1(id: string, ownerKey?: string) {
    await this.repo.withLock((r) => { const job = jobFromRecords(r, id); if (job.kind !== "v1" || job.ownerKey !== ownerKey) throw new Error("Unknown approved job."); });
    await this.reconcile(id);
    return this.repo.withLock(async (r) => {
      const j = jobFromRecords(r, id); if (j.kind !== "v1" || j.ownerKey !== ownerKey) throw new Error("Unknown approved job.");
      if (!j.report) return { runId: id, jobStatus: j.status };
      const saved = JSON.parse((await new GcpEvidenceIO(r, this.objects, this.config.namespace).read(id, "manifest.json")).toString("utf8"));
      if (sha256(JSON.stringify(saved)) !== sha256(JSON.stringify(j.report))) throw new Error("Saved report integrity check failed.");
      return j.report;
    });
  }
  async readV1Evidence(id: string, filename: string, ownerKey?: string) {
    const report = await this.readV1(id, ownerKey);
    if (!("assertions" in report)) throw new Error("Report is not complete.");
    const assertion = report.assertions.find((a) => a.screenshot === filename && a.screenshotSha256);
    if (!assertion) throw new Error("Unknown verified evidence.");
    return this.repo.withLock(async (r) => { const bytes = await new GcpEvidenceIO(r, this.objects, this.config.namespace).read(id, filename); if (sha256(bytes) !== assertion.screenshotSha256) throw new Error("Evidence integrity check failed."); return bytes; });
  }
  async execute(id: string) {
    const claimed = await this.v2.claimJob(id); if (!claimed) return;
    const store = new GcpV2Store(this.repo, this.objects, this.config.namespace, claimed.claim);
    const origin = `http://127.0.0.1:${this.config.fixturePort}`;
    if (claimed.job.kind === "v2") {
      const approval = claimed.job.approval as SuiteApproval;
      const run = await store.readJob(id);
      try { const result = await executePaired(approval, run, store, origin, undefined); await store.completeJob(id, result.records, result.coverage); }
      catch { await store.completeJob(id, [], ["Worker execution did not produce complete observations."]); }
      return;
    }
    const approval = claimed.job.approval as { id: string; digest: string; envelope: ApprovalEnvelope };
    const startedAt = new Date().toISOString(); let executionStatus: ExecutionStatus = "completed";
    let assertions: RunManifest["assertions"] = []; let actionResults: RunManifest["actionResults"] = [];
    const captures = new Map<string, string>();
    try {
      const result = await runApprovedPlan(approval.envelope, origin, id, undefined, async (name, bytes) => { await store.writeScreenshot(id, name, bytes); captures.set(name, sha256(bytes)); });
      assertions = result.assertions; actionResults = result.actionResults;
    } catch (error) {
      executionStatus = error instanceof RunnerExecutionError ? error.status : "failed";
      assertions = error instanceof RunnerExecutionError ? error.assertions : approval.envelope.plan.assertions.map((a) => ({ id: a.id, expected: a.expected, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp: new Date().toISOString(), url: origin }));
      actionResults = error instanceof RunnerExecutionError ? error.actionResults : approval.envelope.plan.actions.map((a) => ({ id: a.id, status: "not-run", startedAt: null, endedAt: null, url: null }));
    }
    assertions = assertions.map((a) => captures.has(a.screenshot) ? { ...a, screenshotSha256: captures.get(a.screenshot) } : { ...a, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png" });
    const report: RunManifest = { runId: id, planId: approval.id, approvalDigest: approval.digest, approvalEnvelope: approval.envelope, planner: approval.envelope.planner, scenario: approval.envelope.scenario, origin, startedAt, endedAt: new Date().toISOString(), executionStatus, verdict: aggregate(assertions, executionStatus === "completed"), actionResults, assertions, replay: approval.envelope.scenario.replay };
    await this.finishV1(claimed.claim, report);
  }
  private finishV1(claim: Claim, report: RunManifest) {
    return this.repo.withLock(async (r) => { const job = requireClaim(r, claim); const io = new GcpEvidenceIO(r, this.objects, this.config.namespace, claim); const bytes = Buffer.from(JSON.stringify(report, null, 2)); await io.write(claim.id, "manifest.json", bytes); await io.write(claim.id, "manifest.sha256", Buffer.from(sha256(bytes).slice(7) + "\n")); r.set("job_" + claim.id, { ...job, report, status: "completed", until: 0 }); });
  }
}
