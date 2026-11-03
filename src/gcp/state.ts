import { V2Store, type V2StoreSnapshot, type V2EvidenceIO } from "../v2-store.js";
import type { CaseReleaseRecord, GroundingBundle, ProposalResult, ReviewDecision, SuiteApproval, SuiteRun, V2Context } from "../v2-contracts.js";
import { PlanStore, type StoredPlan, type ApprovalEnvelope } from "../plan-store.js";
import type { RunManifest } from "../evidence.js";
import type { Repository, Records } from "./repository.js";
import type { EvidenceObjects, ObjectRef } from "./evidence.js";

export type Job = { kind: "v1" | "v2"; id: string; status: "accepted" | "running" | "completed" | "interrupted"; fence: number; until: number; createdAt: number; dispatch: "pending" | "queued"; approval: SuiteApproval | { id: string; digest: string; envelope: ApprovalEnvelope }; ownerKey?: string; report?: RunManifest };
export type Claim = { id: string; fence: number };
const entries = <T>(r: Records, prefix: string): [string, T][] => [...r].filter(([id]) => id.startsWith(prefix)).map(([id, value]) => [id.slice(prefix.length), value as T]);
const replace = (r: Records, prefix: string, items: [string, unknown][]) => { for (const id of r.keys()) if (id.startsWith(prefix)) r.delete(id); for (const [id, value] of items) r.set(prefix + id, value); };
export function snapshotFromRecords(r: Records): V2StoreSnapshot {
  const meta = r.get("v2meta") as { executionCount: number } | undefined;
  if (!meta) throw new Error("V2 state has not been migrated.");
  return { state: { version: "2", executionCount: meta.executionCount, suites: Object.fromEntries(entries(r, "suite_")), runs: Object.fromEntries(entries(r, "run_")), regressions: Object.fromEntries(entries(r, "regression_")) }, proposals: entries(r, "proposal_"), approvals: entries(r, "approval_") } as V2StoreSnapshot;
}
export function snapshotToRecords(r: Records, s: V2StoreSnapshot) {
  r.set("v2meta", { executionCount: s.state.executionCount });
  replace(r, "suite_", Object.entries(s.state.suites)); replace(r, "run_", Object.entries(s.state.runs)); replace(r, "regression_", Object.entries(s.state.regressions));
  replace(r, "proposal_", s.proposals); replace(r, "approval_", s.approvals);
}
const requireJob = (r: Records, id: string): Job => { const job = r.get("job_" + id) as Job | undefined; if (!job || job.id !== id || !["v1", "v2"].includes(job.kind) || !["accepted", "running", "completed", "interrupted"].includes(job.status) || !Number.isSafeInteger(job.fence) || job.fence < 0 || !Number.isFinite(job.until) || !Number.isFinite(job.createdAt)) throw new Error("Unknown approved job."); return job; };
export function requireClaim(r: Records, claim: Claim): Job { const job = requireJob(r, claim.id); if (job.status !== "running" || job.fence !== claim.fence || job.until <= Date.now()) throw new Error("Worker claim expired; stale changes rejected."); return job; }
export class GcpEvidenceIO implements V2EvidenceIO {
  constructor(readonly records: Records, readonly objects: EvidenceObjects, readonly namespace: string, readonly claim?: Claim) {}
  async read(id: string, filename: string) {
    const refs = this.records.get("objects_" + id) as Record<string, ObjectRef> | undefined;
    const ref = refs?.[filename]; if (!ref) throw new Error("Unknown verified evidence object.");
    return this.objects.read(ref);
  }
  async write(id: string, filename: string, bytes: Buffer) {
    if (!this.claim || this.claim.id !== id || !/^(?:[a-z0-9-]+\.png|manifest\.json|manifest\.sha256)$/.test(filename)) throw new Error("Evidence write requires an active approved job.");
    requireClaim(this.records, this.claim);
    const ref = await this.objects.put(`${id}/attempts/${this.claim.fence}/${filename}`, bytes);
    const refs = this.records.get("objects_" + id) as Record<string, ObjectRef> | undefined;
    this.records.set("objects_" + id, { ...refs, [filename]: ref });
  }
}

/** Reuses the existing domain checks; only storage and accepted-run dispatch differ. */
export class GcpV2Store extends V2Store {
  constructor(readonly repo: Repository, readonly objects: EvidenceObjects, readonly namespace: string, readonly claim?: Claim) { super("/tmp/proofpath-unused"); }
  private async operate<T>(work: (store: V2Store, records: Records) => Promise<T>): Promise<T> {
    return this.repo.withLock(async (records) => {
      if (this.claim) requireClaim(records, this.claim);
      const store = V2Store.restore(snapshotFromRecords(records), new GcpEvidenceIO(records, this.objects, this.namespace, this.claim));
      const result = await work(store, records);
      snapshotToRecords(records, await store.snapshot());
      return result;
    });
  }
  override createProposal(p: ProposalResult, c: V2Context, provenance?: readonly string[]) { return this.operate((s) => s.createProposal(p, c, provenance)); }
  override reviewProposal(id: string, review: ReviewDecision) { return this.operate((s) => s.reviewProposal(id, review)); }
  override approveSuite(id: string) { return this.operate((s) => s.approveSuite(id)); }
  override readJob(id: string) { return this.operate((s) => s.readJob(id)); }
  override readEvidence(id: string, filename: string) { return this.operate((s) => s.readEvidence(id, filename)); }
  override listRegressions() { return this.operate((s) => s.listRegressions()); }
  override readRegression(id: string) { return this.operate((s) => s.readRegression(id)); }
  override saveRegression(id: string) { return this.operate((s) => s.saveRegression(id)); }
  override prepareRegression(id: string, c: V2Context) { return this.operate((s) => s.prepareRegression(id, c)); }
  override appendRecord(id: string, record: CaseReleaseRecord) { return this.operate((s) => s.appendRecord(id, record)); }
  override completeJob(id: string, records: readonly CaseReleaseRecord[], coverage: readonly string[]) {
    return this.operate(async (s, r) => { const result = await s.completeJob(id, records, coverage); const job = requireClaim(r, this.claim!); r.set("job_" + id, { ...job, status: "completed", until: 0 }); return result; });
  }
  override writeScreenshot(id: string, name: string, bytes: Buffer) { return this.operate(async (_s, r) => new GcpEvidenceIO(r, this.objects, this.namespace, this.claim).write(id, name, bytes)); }
  override recoverInterruptedJobs() { return Promise.resolve(0); }
  override consumeApproval(_id: string): Promise<SuiteApproval> { return Promise.reject(new Error("Use transactional GCP run acceptance.")); }
  async accept(id: string) {
    return this.operate(async (s, r) => {
      const old = r.get("job_" + id) as Job | undefined;
      if (old) { if (old.kind !== "v2") throw new Error("Wrong job kind."); return { runId: id }; }
      const approval = await s.consumeApproval(id); await s.createJob(approval, id);
      r.set("job_" + id, { kind: "v2", id, status: "accepted", fence: 0, until: 0, createdAt: Date.now(), dispatch: "pending", approval } satisfies Job);
      return { runId: id };
    });
  }
  async claimJob(id: string): Promise<{ claim: Claim; job: Job } | null> {
    return this.repo.withLock(async (r) => {
      const job = requireJob(r, id);
      if (job.status === "completed" || job.status === "interrupted") return null;
      if (job.kind === "v2") {
        const s = V2Store.restore(snapshotFromRecords(r), new GcpEvidenceIO(r, this.objects, this.namespace));
        await s.validateExecutionApproval(job.approval as SuiteApproval);
      } else {
        const approval = job.approval as { id: string; digest: string; envelope: ApprovalEnvelope };
        const saved = r.get("plan_" + id) as StoredPlan;
        const verified = PlanStore.restore([saved]).snapshot()[0]!;
        if (!verified.consumed || verified.id !== approval.id || verified.digest !== approval.digest || verified.ownerKey !== job.ownerKey || JSON.stringify(verified.envelope) !== JSON.stringify(approval.envelope)) throw new Error("Approved V1 snapshot changed.");
      }
      if (job.status === "accepted" && Date.now() - job.createdAt > 600_000) { job.status = "running"; job.until = 0; r.set("job_" + id, job); }
      if (job.status === "running") {
        if (job.until > Date.now()) throw new Error("Approved job is already running.");
        const claim = { id, fence: job.fence + 1 }; const next: Job = { ...job, fence: claim.fence, until: Date.now() + 300_000 };
        r.set("job_" + id, next);
        if (job.kind === "v2") {
          const s = V2Store.restore(snapshotFromRecords(r), new GcpEvidenceIO(r, this.objects, this.namespace, claim));
          // Only this expired job is recovered; other accepted queued runs remain accepted.
          const snap = await s.snapshot();
          const active = Object.fromEntries(Object.entries(snap.state.runs).filter(([key, run]) => key !== id && ["accepted", "running"].includes(run.status)));
          for (const key of Object.keys(active)) delete snap.state.runs[key];
          const recovery = V2Store.restore({ ...snap, state: { ...snap.state, executionCount: Math.max(snap.state.executionCount, Object.keys(snap.state.runs).length) } }, new GcpEvidenceIO(r, this.objects, this.namespace, claim));
          await recovery.recoverInterruptedJobs(); const recovered = await recovery.snapshot(); Object.assign(recovered.state.runs, active); snapshotToRecords(r, recovered);
        } else {
          const approval = job.approval as { id: string; digest: string; envelope: ApprovalEnvelope };
          const now = new Date().toISOString();
          const report: RunManifest = { runId: id, planId: approval.id, approvalDigest: approval.digest, approvalEnvelope: approval.envelope, planner: approval.envelope.planner, scenario: approval.envelope.scenario, origin: "http://127.0.0.1:4173", startedAt: now, endedAt: now, executionStatus: "failed", verdict: "INCONCLUSIVE", actionResults: approval.envelope.plan.actions.map((a) => ({ id: a.id, status: "not-run", startedAt: null, endedAt: null, url: null })), assertions: approval.envelope.plan.assertions.map((a) => ({ id: a.id, expected: a.expected, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp: now, url: "http://127.0.0.1:4173" })), replay: approval.envelope.scenario.replay, executionError: "Execution was interrupted; a new approval is required." };
          await new GcpEvidenceIO(r, this.objects, this.namespace, claim).write(id, "manifest.json", Buffer.from(JSON.stringify(report, null, 2)));
          r.set("job_" + id, { ...next, report });
        }
        r.set("job_" + id, { ...(r.get("job_" + id) as Job), status: "interrupted", until: 0 });
        return null;
      }
      const claim = { id, fence: job.fence + 1 }; const next: Job = { ...job, status: "running", fence: claim.fence, until: Date.now() + 300_000 };
      r.set("job_" + id, next);
      if (job.kind === "v2") { const s = V2Store.restore(snapshotFromRecords(r), new GcpEvidenceIO(r, this.objects, this.namespace, claim)); await s.markRunning(id); snapshotToRecords(r, await s.snapshot()); }
      return { claim, job: next };
    });
  }
}

export class GcpPlans {
  constructor(readonly repo: Repository) {}
  private operate<T>(fn: (s: PlanStore, r: Records) => T) {
    return this.repo.withLock((r) => { const s = PlanStore.restore(entries<StoredPlan>(r, "plan_").map(([, p]) => p)); const value = fn(s, r); replace(r, "plan_", s.snapshot().map((p) => [p.id, p])); return value; });
  }
  create(...args: Parameters<PlanStore["create"]>) { return this.operate((s) => s.create(...args)); }
  approve(...args: Parameters<PlanStore["approve"]>) { return this.operate((s) => s.approve(...args)); }
  consume(...args: Parameters<PlanStore["consume"]>) { return this.operate((s) => s.consume(...args)); }
  accept(id: string, ownerKey?: string) {
    return this.operate((s, r) => { const old = r.get("job_" + id) as Job | undefined; if (old) { if (old.kind !== "v1" || old.ownerKey !== ownerKey) throw new Error("Unknown approved job."); return { runId: id }; }
      const count = (r.get("v1meta") as { count: number } | undefined)?.count ?? 0; if (count >= 50) throw new Error("Accepted single-journey job limit reached.");
      const approval = s.consume(id, ownerKey); r.set("v1meta", { count: count + 1 }); r.set("job_" + id, { kind: "v1", id, status: "accepted", fence: 0, until: 0, createdAt: Date.now(), dispatch: "pending", approval, ...(ownerKey ? { ownerKey } : {}) } satisfies Job); return { runId: id };
    });
  }
}
export const jobFromRecords = requireJob;
