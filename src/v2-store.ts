import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calculateCheckout } from "./v2-oracle.js";
import { deriveCaseInput, digestV2 } from "./v2-checkout.js";
import { compileReviewedSuite } from "./v2-planner.js";
import type { ApprovalReceipt, CaseReleaseRecord, PreparedProposal, PreparedSuite, ProposalResult, ReviewDecision, SavedRegression, SuiteApproval, SuiteDefinition, SuiteRun, V2Context } from "./v2-contracts.js";

type DurableSuite = { definition: SuiteDefinition; expectations: PreparedSuite["expectations"]; grounding: V2Context["grounding"]; provenance: string[]; digest: string };
type DurableState = { version: "2"; executionCount: number; suites: Record<string, DurableSuite>; runs: Record<string, SuiteRun>; regressions: Record<string, SavedRegression> };
type PendingApproval = { suite: DurableSuite; expiresAt: number; consumed: boolean };

const clone = <T>(value: T): T => structuredClone(value);
const approvalDigest = (suite: Omit<DurableSuite, "digest"> | DurableSuite) => digestV2({ definition: suite.definition, expectations: suite.expectations, grounding: suite.grounding, provenance: suite.provenance });
const nowIso = (now: () => number) => new Date(now()).toISOString();
const initial = (): DurableState => ({ version: "2", executionCount: 0, suites: {}, runs: {}, regressions: {} });

export class V2Store {
  private readonly proposals = new Map<string, PreparedProposal>();
  private readonly approvals = new Map<string, PendingApproval>();
  private state: DurableState | undefined;
  private loading: Promise<DurableState> | undefined;
  private failure: Error | undefined;

  constructor(private readonly dataDir: string, private readonly clock: () => number = Date.now) {}

  async createProposal(proposal: ProposalResult, context: V2Context): Promise<PreparedProposal> {
    if (proposal.kind !== "proposal") throw new Error("Clarification does not create a prepared suite or approval.");
    const prepared: PreparedProposal = { id: randomUUID(), proposal: clone(proposal), context: clone(context) };
    this.proposals.set(prepared.id, prepared);
    return clone(prepared);
  }

  async reviewProposal(proposalId: string, review: ReviewDecision): Promise<PreparedSuite> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error("Unknown pending proposal.");
    const definition = compileReviewedSuite(proposal.proposal, review, proposal.context);
    const expectations = definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], { ...proposal.context, rules: definition.rules, requirement: definition.requirement }), definition.rules, proposal.context.catalog));
    const record: DurableSuite = { definition: clone(definition), expectations: clone(expectations), grounding: clone(proposal.context.grounding), provenance: ["reviewed-v2"], digest: "" };
    record.digest = approvalDigest(record);
    const id = randomUUID();
    const state = await this.ready();
    state.suites[id] = record;
    await this.persist();
    this.proposals.delete(proposalId);
    return { id, definition: clone(record.definition), expectations: clone(record.expectations), digest: record.digest };
  }

  async approveSuite(suiteId: string): Promise<ApprovalReceipt> {
    const suite = (await this.ready()).suites[suiteId];
    if (!suite) throw new Error("Unknown reviewed suite.");
    const id = randomUUID();
    const expiresAt = this.clock() + 600_000;
    this.approvals.set(id, { suite: clone(suite), expiresAt, consumed: false });
    return { id, digest: suite.digest, expiresAt: new Date(expiresAt).toISOString() };
  }

  async consumeApproval(approvalId: string): Promise<SuiteApproval> {
    const approval = this.approvals.get(approvalId);
    if (!approval) throw new Error("Unknown approval.");
    if (approval.consumed) throw new Error("Suite approval has already been used.");
    if (this.clock() >= approval.expiresAt) throw new Error("Suite approval expired; approve a new snapshot.");
    if (approvalDigest(approval.suite) !== approval.suite.digest) throw new Error("Approved suite integrity check failed.");
    approval.consumed = true;
    return {
      definition: clone(approval.suite.definition), rules: clone(approval.suite.definition.rules), referenceId: approval.suite.definition.referenceId,
      expectations: clone(approval.suite.expectations), grounding: clone(approval.suite.grounding), provenance: clone(approval.suite.provenance),
      digest: approval.suite.digest, expiresAt: new Date(approval.expiresAt).toISOString(), consumed: true
    };
  }

  async createJob(approval: SuiteApproval): Promise<SuiteRun> {
    const state = await this.ready();
    if (state.executionCount >= 50) throw new Error("This runtime data set has reached its 50 accepted suite-job limit.");
    const run: SuiteRun = { id: randomUUID(), approvalDigest: approval.digest, status: "accepted", records: [], coverage: [], verdict: "INCONCLUSIVE", startedAt: nowIso(this.clock), endedAt: null };
    state.executionCount += 1;
    state.runs[run.id] = run;
    await this.persist();
    return clone(run);
  }

  async markRunning(runId: string): Promise<SuiteRun> { return this.updateRun(runId, (run) => ({ ...run, status: "running" })); }
  async completeJob(runId: string, records: readonly CaseReleaseRecord[], coverage: readonly string[]): Promise<SuiteRun> {
    return this.updateRun(runId, (run) => ({ ...run, status: "completed", records: clone(records), coverage: clone(coverage), verdict: verdictFor(records, coverage), endedAt: nowIso(this.clock) }));
  }
  async readJob(runId: string): Promise<SuiteRun> {
    const run = (await this.ready()).runs[runId];
    if (!run) throw new Error("Unknown suite run.");
    return clone(run);
  }

  async recoverInterruptedJobs(): Promise<number> {
    const state = await this.ready();
    let recovered = 0;
    for (const [id, run] of Object.entries(state.runs)) {
      if (run.status !== "accepted" && run.status !== "running") continue;
      const suite = Object.values(state.suites).find((candidate) => candidate.digest === run.approvalDigest);
      if (!suite) throw new Error("V2 accounting cannot recover a run without its reviewed definition.");
      const known = new Set(run.records.map((record) => `${record.caseId}:${record.releaseId}`));
      const padded = suite.definition.cases.flatMap((definition, index) => suite.definition.releases.flatMap((release) => {
        if (known.has(`${definition.id}:${release.id}`)) return [];
        const expected = suite.expectations[index]!;
        return [{ caseId: definition.id, releaseId: release.id, actions: definition.actions.map((action) => ({ id: action.id, status: "not-run" as const, startedAt: null, endedAt: null, url: null })), assertions: definition.assertions.map((assertion) => ({ id: assertion.id, expected: expectedValue(assertion.predicate, expected), observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", timestamp: nowIso(this.clock), url: suite.definition.app.origin })), verdict: "INCONCLUSIVE" as const, startedAt: nowIso(this.clock), endedAt: nowIso(this.clock) }];
      }));
      const records = [...run.records, ...padded];
      state.runs[id] = { ...run, status: "interrupted", records, coverage: [...run.coverage, "Execution was interrupted before all reviewed observations were captured."], verdict: records.some((record) => record.verdict === "FAIL") ? "FAIL" : "INCONCLUSIVE", endedAt: nowIso(this.clock) };
      recovered += 1;
    }
    if (recovered) await this.persist();
    return recovered;
  }

  async saveRegression(runId: string): Promise<SavedRegression> {
    const run = await this.readJob(runId);
    const suite = Object.values((await this.ready()).suites).find((candidate) => candidate.digest === run.approvalDigest);
    if (!suite) throw new Error("Run has no durable reviewed definition.");
    const regression: SavedRegression = { id: randomUUID(), definition: clone(suite.definition), provenance: clone(suite.provenance) };
    (await this.ready()).regressions[regression.id] = regression;
    await this.persist();
    return clone(regression);
  }

  async prepareRegression(regressionId: string, context: V2Context): Promise<PreparedSuite> {
    const regression = (await this.ready()).regressions[regressionId];
    if (!regression || regression.definition.app.appId !== context.app.appId) throw new Error("Unknown compatible saved regression.");
    const definition = clone(regression.definition);
    const expectations = definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], { ...context, rules: definition.rules, requirement: definition.requirement }), definition.rules, context.catalog));
    const record: DurableSuite = { definition, expectations, grounding: clone(context.grounding), provenance: [...regression.provenance, "saved-regression"], digest: "" };
    record.digest = approvalDigest(record);
    const id = randomUUID();
    (await this.ready()).suites[id] = record;
    await this.persist();
    return { id, definition: clone(definition), expectations: clone(expectations), digest: record.digest };
  }

  async writeManifest(run: SuiteRun): Promise<void> {
    const directory = join(this.runtimeRoot(), run.id);
    await mkdir(directory, { recursive: true });
    const contents = JSON.stringify(run, null, 2);
    await this.atomic(join(directory, "manifest.json"), contents);
    await this.atomic(join(directory, "manifest.sha256"), `${createHash("sha256").update(contents).digest("hex")}\n`);
  }
  runDirectory(runId: string) {
    if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error("Invalid suite run ID.");
    return join(this.runtimeRoot(), runId);
  }

  // Test-only tampering proves the approval digest is checked before launch.
  testOnlyTamperApproval(id: string) { const approval = this.approvals.get(id); if (!approval) throw new Error("Unknown approval."); (approval.suite.definition.rules as { deliveryFeeMinor: number }).deliveryFeeMinor += 1; }
  async testOnlySetExecutionCount(count: number) { (await this.ready()).executionCount = count; await this.persist(); }

  private async updateRun(runId: string, update: (run: SuiteRun) => SuiteRun): Promise<SuiteRun> {
    const state = await this.ready();
    const current = state.runs[runId];
    if (!current) throw new Error("Unknown suite run.");
    state.runs[runId] = update(current);
    await this.persist();
    return clone(state.runs[runId]);
  }

  private async ready(): Promise<DurableState> {
    if (this.failure) throw this.failure;
    if (!this.loading) this.loading = this.load().catch((error) => { this.failure = error instanceof Error ? error : new Error("V2 durable state is unavailable."); throw this.failure; });
    return this.loading;
  }
  private async load(): Promise<DurableState> {
    const file = join(this.runtimeRoot(), "state.json");
    try {
      const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
      if (!isState(parsed)) throw new Error("V2 durable state is corrupt.");
      this.state = parsed;
      return this.state;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const priorRuns = await exists(this.runtimeRoot());
      if (priorRuns) throw new Error("V2 accounting is missing for an existing runtime data set.");
      this.state = initial();
      await this.persist();
      return this.state;
    }
  }
  private async persist(): Promise<void> {
    if (!this.state) throw new Error("V2 durable state was not initialized.");
    try { await mkdir(this.runtimeRoot(), { recursive: true }); await this.atomic(join(this.runtimeRoot(), "state.json"), JSON.stringify(this.state)); }
    catch (error) { this.failure = new Error("V2 durable state could not be persisted; execution is fail-closed."); throw this.failure; }
  }
  private async atomic(file: string, contents: string): Promise<void> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, file);
  }
  private runtimeRoot() { return join(this.dataDir, "runs", "v2"); }
}

function verdictFor(records: readonly CaseReleaseRecord[], coverage: readonly string[]): "PASS" | "FAIL" | "INCONCLUSIVE" {
  if (records.some((record) => record.verdict === "FAIL")) return "FAIL";
  if (coverage.length || records.length === 0 || records.some((record) => record.verdict === "INCONCLUSIVE")) return "INCONCLUSIVE";
  return "PASS";
}
function expectedValue(predicate: "total-minor" | "coupon-error" | "contact-errors" | "synthetic-confirmation", expected: PreparedSuite["expectations"][number]): unknown {
  if (predicate === "total-minor") return expected.totalMinor;
  if (predicate === "coupon-error") return expected.couponError;
  if (predicate === "contact-errors") return expected.contactErrors;
  return expected.syntheticConfirmation;
}
function isState(value: unknown): value is DurableState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<DurableState>;
  return Object.keys(state).length === 5 && ["version", "executionCount", "suites", "runs", "regressions"].every((key) => key in state) && state.version === "2" && typeof state.executionCount === "number" && Number.isInteger(state.executionCount) && state.executionCount >= 0 && Boolean(state.suites) && Boolean(state.runs) && Boolean(state.regressions);
}
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
