import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { calculateCheckout } from "./v2-oracle.js";
import { deriveCaseInput, digestV2, validateCase } from "./v2-checkout.js";
import { applyReviewedNumericRuleChanges, compileReviewedSuite } from "./v2-planner.js";
import { classifyComparison } from "./v2-comparison.js";
import type { ApprovalReceipt, CaseComparison, CaseReleaseRecord, PreparedProposal, PreparedSuite, ProposalResult, ReviewDecision, SavedRegression, SuiteApproval, SuiteDefinition, SuiteRun, V2Context } from "./v2-contracts.js";

type DurableSuite = { definition: SuiteDefinition; expectations: PreparedSuite["expectations"]; grounding: V2Context["grounding"]; context: V2Context; provenance: string[]; digest: string };
type DurableState = { version: "2"; executionCount: number; suites: Record<string, DurableSuite>; runs: Record<string, SuiteRun>; regressions: Record<string, SavedRegression> };
type PendingProposal = { prepared: PreparedProposal; provenance: string[]; expiresAt: number };
type PendingApproval = { suite: DurableSuite; expiresAt: number; consumed: boolean };

const clone = <T>(value: T): T => structuredClone(value);
const approvalDigest = (suite: Omit<DurableSuite, "digest"> | DurableSuite) => digestV2({ definition: suite.definition, expectations: suite.expectations, grounding: suite.grounding, context: suite.context, provenance: suite.provenance });
const nowIso = (now: () => number) => new Date(now()).toISOString();
const initial = (): DurableState => ({ version: "2", executionCount: 0, suites: {}, runs: {}, regressions: {} });

export class V2Store {
  private readonly proposals = new Map<string, PendingProposal>();
  private readonly approvals = new Map<string, PendingApproval>();
  private state: DurableState | undefined;
  private loading: Promise<DurableState> | undefined;
  private failure: Error | undefined;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly dataDir: string, private readonly clock: () => number = Date.now) {}

  async createProposal(proposal: ProposalResult, context: V2Context, provenance: readonly string[] = ["fixture-v2"]): Promise<PreparedProposal> {
    if (proposal.kind !== "proposal") throw new Error("Clarification does not create a prepared suite or approval.");
    this.clearPending();
    if (this.proposals.size >= 16) throw new Error("Too many pending V2 proposals; review or let one expire first.");
    const prepared: PreparedProposal = { id: randomUUID(), proposal: clone(proposal), context: clone(context) };
    this.proposals.set(prepared.id, { prepared, provenance: [...provenance], expiresAt: this.clock() + 600_000 });
    return clone(prepared);
  }

  async reviewProposal(proposalId: string, review: ReviewDecision): Promise<PreparedSuite> {
    this.clearPending();
    const pending = this.proposals.get(proposalId);
    if (!pending) throw new Error("Unknown pending proposal.");
    const proposal = pending.prepared;
    const definition = compileReviewedSuite(proposal.proposal, review, proposal.context);
    const expectations = definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], { ...proposal.context, rules: definition.rules, requirement: definition.requirement }), definition.rules, proposal.context.catalog));
    const record: DurableSuite = { definition: clone(definition), expectations: clone(expectations), grounding: clone(proposal.context.grounding), context: clone(proposal.context), provenance: [...pending.provenance, "reviewed-v2"], digest: "" };
    record.digest = approvalDigest(record);
    const state = await this.ready();
    const duplicate = Object.entries(state.suites).find(([, candidate]) => candidate.digest === record.digest);
    if (duplicate) {
      if (digestV2(duplicate[1]) !== digestV2(record)) throw new Error("Durable suite digest collision.");
      this.proposals.delete(proposalId);
      return { id: duplicate[0], definition: clone(duplicate[1].definition), expectations: clone(duplicate[1].expectations), digest: duplicate[1].digest };
    }
    const id = randomUUID();
    state.suites[id] = record;
    await this.persist();
    this.proposals.delete(proposalId);
    return { id, definition: clone(record.definition), expectations: clone(record.expectations), digest: record.digest };
  }

  async approveSuite(suiteId: string): Promise<ApprovalReceipt> {
    this.clearPending();
    const suite = (await this.ready()).suites[suiteId];
    if (!suite) throw new Error("Unknown reviewed suite.");
    this.revalidateSuite(suite);
    if (this.approvals.size >= 16) throw new Error("Too many pending V2 approvals; run or let one expire first.");
    const id = randomUUID();
    const expiresAt = this.clock() + 600_000;
    this.approvals.set(id, { suite: clone(suite), expiresAt, consumed: false });
    return { id, digest: suite.digest, expiresAt: new Date(expiresAt).toISOString() };
  }

  async consumeApproval(approvalId: string): Promise<SuiteApproval> {
    const approval = this.approvals.get(approvalId);
    this.clearPending();
    if (!approval) throw new Error("Unknown approval.");
    if (approval.consumed) throw new Error("Suite approval has already been used.");
    if (this.clock() >= approval.expiresAt) throw new Error("Suite approval expired; approve a new snapshot.");
    this.revalidateSuite(approval.suite);
    approval.consumed = true;
    return {
      definition: clone(approval.suite.definition), rules: clone(approval.suite.definition.rules), referenceId: approval.suite.definition.referenceId,
      expectations: clone(approval.suite.expectations), grounding: clone(approval.suite.grounding), provenance: clone(approval.suite.provenance),
      digest: approval.suite.digest, expiresAt: new Date(approval.expiresAt).toISOString(), consumed: true
    };
  }

  async createJob(approval: SuiteApproval): Promise<SuiteRun> {
    const state = await this.ready();
    this.revalidateApproval(approval);
    if (state.executionCount >= 50) throw new Error("This runtime data set has reached its 50 accepted suite-job limit.");
    const run: SuiteRun = { id: randomUUID(), approvalDigest: approval.digest, artifact: { definition: clone(approval.definition), expectations: clone(approval.expectations), provenance: clone(approval.provenance) }, status: "accepted", records: [], comparisons: [], coverage: [], verdict: "INCONCLUSIVE", candidateVerdict: "INCONCLUSIVE", startedAt: nowIso(this.clock), endedAt: null };
    state.executionCount += 1;
    state.runs[run.id] = run;
    await this.persist();
    return clone(run);
  }

  async markRunning(runId: string): Promise<SuiteRun> { return this.updateRun(runId, (run) => ({ ...run, status: "running" })); }
  async appendRecord(runId: string, record: CaseReleaseRecord): Promise<SuiteRun> {
    return this.updateRun(runId, (run) => {
      if (run.status !== "running") throw new Error("Only a running suite can persist execution progress.");
      if (run.records.some((item) => item.caseId === record.caseId && item.releaseId === record.releaseId)) throw new Error("Duplicate case-release progress record.");
      validateRecords(this.suiteForDigest(run.approvalDigest), [record]);
      return { ...run, records: [...run.records, clone(record)] };
    });
  }
  async completeJob(runId: string, records: readonly CaseReleaseRecord[], coverage: readonly string[]): Promise<SuiteRun> {
    const state = await this.ready();
    const current = state.runs[runId];
    if (!current) throw new Error("Unknown suite run.");
    const merged = mergeRecords(current.records, records);
    const suite = this.suiteForDigest(current.approvalDigest);
    validateRecords(suite, merged);
    const padded = padRecords(suite, merged, this.clock);
    const finalRecords = await sanitizeEvidence(padded, this.runDirectory(runId));
    const comparisons = comparisonsFor(suite, finalRecords);
    const authoritativeCoverage = [...new Set([...suite.definition.requirement.coverageGaps, ...coverage])];
    const next: SuiteRun = { ...current, status: "completed", records: finalRecords, comparisons, coverage: authoritativeCoverage, verdict: verdictFor(finalRecords, authoritativeCoverage), candidateVerdict: candidateVerdict(finalRecords, suite.definition.releases[1].id), endedAt: nowIso(this.clock) };
    if (next.verdict === "PASS" && !isCompleteSet(suite, next.records)) throw new Error("A complete PASS requires every reviewed case-release observation.");
    try { await this.writeManifest(next); }
    catch { this.failure = new Error("V2 evidence artifact could not be persisted; this runtime data set is fail-closed."); throw this.failure; }
    state.runs[runId] = next;
    await this.persist();
    return clone(next);
  }
  async readJob(runId: string): Promise<SuiteRun> {
    const run = (await this.ready()).runs[runId];
    if (!run) throw new Error("Unknown suite run.");
    if (run.status === "completed" || run.status === "interrupted") await this.verifyManifest(run);
    return clone(run);
  }

  async recoverInterruptedJobs(): Promise<number> {
    try {
      const state = await this.ready();
      let recovered = 0;
      for (const [id, run] of Object.entries(state.runs)) {
      if (run.status !== "accepted" && run.status !== "running") continue;
      const suite = this.suiteForDigest(run.approvalDigest);
      const known = new Set(run.records.map((record) => `${record.caseId}:${record.releaseId}`));
      const padded = suite.definition.cases.flatMap((definition, index) => suite.definition.releases.flatMap((release) => {
        if (known.has(`${definition.id}:${release.id}`)) return [];
        const expected = suite.expectations[index]!;
        return [{ caseId: definition.id, releaseId: release.id, actions: definition.actions.map((action) => ({ id: action.id, status: "not-run" as const, startedAt: null, endedAt: null, url: null })), assertions: definition.assertions.map((assertion) => ({ id: assertion.id, expected: expectedValue(assertion.predicate, expected), observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", timestamp: nowIso(this.clock), url: suite.definition.app.origin })), verdict: "INCONCLUSIVE" as const, startedAt: nowIso(this.clock), endedAt: nowIso(this.clock) }];
      }));
      const records = [...run.records, ...padded];
      const next: SuiteRun = { ...run, status: "interrupted", records, comparisons: comparisonsFor(suite, records), coverage: [...run.coverage, "Execution was interrupted before all reviewed observations were captured."], verdict: records.some((record) => record.verdict === "FAIL") ? "FAIL" : "INCONCLUSIVE", candidateVerdict: candidateVerdict(records, suite.definition.releases[1].id), endedAt: nowIso(this.clock) };
      await this.writeManifest(next);
      state.runs[id] = next;
        recovered += 1;
      }
      if (recovered) await this.persist();
      return recovered;
    } catch {
      this.failure = new Error("V2 recovery failed; this runtime data set is fail-closed.");
      throw this.failure;
    }
  }

  async listRegressions(): Promise<readonly SavedRegression[]> {
    return Object.values((await this.ready()).regressions).map(clone);
  }

  async readRegression(regressionId: string): Promise<SavedRegression> {
    const regression = (await this.ready()).regressions[regressionId];
    if (!regression) throw new Error("Unknown saved regression.");
    return clone(regression);
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
    if (digestV2(regression.definition.app.catalog) !== digestV2(context.app.catalog) || regression.definition.app.adapterVersion !== context.app.adapterVersion || regression.definition.referenceId !== context.requirement.adoptedReferenceIds[0] || digestV2(regression.definition.requirement.criteria.map(({ id, sourceQuote }) => ({ id, sourceQuote }))) !== digestV2(context.requirement.criteria.map(({ id, sourceQuote }) => ({ id, sourceQuote }))) || digestV2(regression.definition.rules) !== digestV2(applyReviewedNumericRuleChanges(context.rules, regression.definition.requirement.numericRuleChanges)) || regression.definition.requirement.originalText !== context.requirement.originalText || digestV2(regression.definition.requirement.adoptedReferenceIds) !== digestV2(context.requirement.adoptedReferenceIds)) throw new Error("Saved regression is incompatible with the current reviewed app or reference identity.");
    const definition: SuiteDefinition = { ...clone(regression.definition), releases: [context.grounding.releases[0], context.grounding.releases[1]] };
    const expectations = definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], { ...context, rules: definition.rules, requirement: definition.requirement }), definition.rules, context.catalog));
    const record: DurableSuite = { definition, expectations, grounding: clone(context.grounding), context: clone(context), provenance: [...regression.provenance, "saved-regression"], digest: "" };
    record.digest = approvalDigest(record);
    const state = await this.ready();
    const duplicate = Object.entries(state.suites).find(([, candidate]) => candidate.digest === record.digest);
    if (duplicate) {
      if (digestV2(duplicate[1]) !== digestV2(record)) throw new Error("Durable suite digest collision.");
      return { id: duplicate[0], definition: clone(duplicate[1].definition), expectations: clone(duplicate[1].expectations), digest: duplicate[1].digest };
    }
    const id = randomUUID();
    state.suites[id] = record;
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
    this.writes = this.writes.then(async () => { await mkdir(this.runtimeRoot(), { recursive: true }); await this.atomic(join(this.runtimeRoot(), "state.json"), JSON.stringify(this.state)); });
    try { await this.writes; }
    catch { this.failure = new Error("V2 durable state could not be persisted; execution is fail-closed."); throw this.failure; }
  }
  private async atomic(file: string, contents: string): Promise<void> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, file);
  }
  private runtimeRoot() { return join(this.dataDir, "runs", "v2"); }
  private clearPending() {
    const now = this.clock();
    for (const [id, pending] of this.proposals) if (pending.expiresAt <= now) this.proposals.delete(id);
    for (const [id, approval] of this.approvals) if (approval.expiresAt <= now) this.approvals.delete(id);
  }
  private suiteForDigest(digest: string) {
    const suite = Object.values(this.state?.suites ?? {}).find((candidate) => candidate.digest === digest);
    if (!suite) throw new Error("V2 accounting cannot resolve the reviewed definition for this run.");
    return suite;
  }
  private revalidateSuite(suite: DurableSuite) {
    if (approvalDigest(suite) !== suite.digest) throw new Error("Approved suite integrity check failed.");
    if (digestV2(suite.definition.rules) !== digestV2(suite.definition.requirement.normalizedRules) || digestV2(suite.grounding) !== digestV2(suite.context.grounding)) throw new Error("Reviewed suite no longer matches its trusted context.");
    const context = { ...suite.context, rules: suite.definition.rules, requirement: suite.definition.requirement, grounding: suite.grounding };
    const expected = suite.definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], context), suite.definition.rules, context.catalog));
    if (digestV2(expected) !== digestV2(suite.expectations)) throw new Error("Approved suite expectations could not be re-derived.");
  }
  private revalidateApproval(approval: SuiteApproval) {
    const suite = this.suiteForDigest(approval.digest);
    this.revalidateSuite(suite);
    if (digestV2(approval.definition) !== digestV2(suite.definition) || digestV2(approval.expectations) !== digestV2(suite.expectations) || digestV2(approval.grounding) !== digestV2(suite.grounding)) throw new Error("Approval snapshot does not match its durable reviewed suite.");
  }
  private async verifyManifest(run: SuiteRun) {
    const directory = this.runDirectory(run.id);
    const contents = JSON.stringify(run, null, 2);
    const [manifest, sidecar] = await Promise.all([readFile(join(directory, "manifest.json"), "utf8"), readFile(join(directory, "manifest.sha256"), "utf8")]);
    if (manifest !== contents || sidecar.trim() !== createHash("sha256").update(manifest).digest("hex")) throw new Error("Saved V2 run manifest integrity check failed.");
    await sanitizeEvidence(run.records, directory, true);
  }
}

function verdictFor(records: readonly CaseReleaseRecord[], coverage: readonly string[]): "PASS" | "FAIL" | "INCONCLUSIVE" {
  if (records.some((record) => record.verdict === "FAIL")) return "FAIL";
  if (coverage.length || records.length === 0 || records.some((record) => record.verdict === "INCONCLUSIVE")) return "INCONCLUSIVE";
  return "PASS";
}
function candidateVerdict(records: readonly CaseReleaseRecord[], candidateId: string): "PASS" | "FAIL" | "INCONCLUSIVE" {
  const candidate = records.filter((record) => record.releaseId === candidateId);
  return verdictFor(candidate, []);
}
function mergeRecords(existing: readonly CaseReleaseRecord[], incoming: readonly CaseReleaseRecord[]) {
  const merged = new Map(existing.map((record) => [`${record.caseId}:${record.releaseId}`, record]));
  for (const record of incoming) if (!merged.has(`${record.caseId}:${record.releaseId}`)) merged.set(`${record.caseId}:${record.releaseId}`, clone(record));
  return [...merged.values()];
}
function validateRecords(suite: DurableSuite, records: readonly CaseReleaseRecord[]) {
  const seen = new Set<string>();
  for (const record of records) {
    const key = `${record.caseId}:${record.releaseId}`;
    if (seen.has(key)) throw new Error("Duplicate case-release record.");
    seen.add(key);
    const index = suite.definition.cases.findIndex((item) => item.id === record.caseId);
    const definition = suite.definition.cases[index];
    if (!definition || !suite.definition.releases.some((release) => release.id === record.releaseId)) throw new Error("Run record is outside the reviewed suite.");
    if (record.actions.length !== definition.actions.length || record.actions.some((action, position) => action.id !== definition.actions[position]?.id)) throw new Error("Run record action set does not match the reviewed case.");
    if (record.assertions.length !== definition.assertions.length || record.assertions.some((assertion, position) => assertion.id !== definition.assertions[position]?.id || digestV2(assertion.expected) !== digestV2(expectedValue(definition.assertions[position]!.predicate, suite.expectations[index]!)))) throw new Error("Run record assertion set does not match the reviewed case.");
  }
}
function padRecords(suite: DurableSuite, records: readonly CaseReleaseRecord[], clock: () => number) {
  const known = new Set(records.map((record) => `${record.caseId}:${record.releaseId}`));
  return [...records, ...suite.definition.cases.flatMap((definition, index) => suite.definition.releases.flatMap((release) => {
    if (known.has(`${definition.id}:${release.id}`)) return [];
    const expected = suite.expectations[index]!;
    return [{ caseId: definition.id, releaseId: release.id, actions: definition.actions.map((action) => ({ id: action.id, status: "not-run" as const, startedAt: null, endedAt: null, url: null })), assertions: definition.assertions.map((assertion) => ({ id: assertion.id, expected: expectedValue(assertion.predicate, expected), observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", timestamp: nowIso(clock), url: suite.definition.app.origin })), verdict: "INCONCLUSIVE" as const, startedAt: nowIso(clock), endedAt: nowIso(clock) }];
  }))];
}
function isCompleteSet(suite: DurableSuite, records: readonly CaseReleaseRecord[]) { return records.length === suite.definition.cases.length * suite.definition.releases.length && records.every((record) => record.verdict === "PASS"); }
function comparisonsFor(suite: DurableSuite, records: readonly CaseReleaseRecord[]): CaseComparison[] {
  return suite.definition.cases.map((definition) => {
    const previous = records.find((record) => record.caseId === definition.id && record.releaseId === suite.definition.releases[0].id);
    const candidate = records.find((record) => record.caseId === definition.id && record.releaseId === suite.definition.releases[1].id);
    const scope = definition.criterionIds.some((id) => suite.definition.requirement.expectationScope.find((item) => item.criterionId === id)?.scope === "new-or-changed") ? "new-or-changed" : "unchanged";
    const outcome = (record: CaseReleaseRecord | undefined) => record ? { verdict: record.verdict, fingerprint: suite.digest, observed: record.assertions.length === definition.assertions.length && record.assertions.every((item) => item.screenshotSha256 && item.verdict !== "INCONCLUSIVE") } : undefined;
    return { caseId: definition.id, classification: classifyComparison(outcome(previous), outcome(candidate), scope) };
  });
}
async function sanitizeEvidence(records: readonly CaseReleaseRecord[], directory: string, verifyOnly = false): Promise<CaseReleaseRecord[]> {
  const output: CaseReleaseRecord[] = [];
  for (const record of records) {
    const assertions = [];
    for (const assertion of record.assertions) {
      let valid = assertion.screenshot !== "not-captured.png" && /^sha256:[a-f0-9]{64}$/.test(assertion.screenshotSha256 ?? "");
      if (valid) try { valid = `sha256:${createHash("sha256").update(await readFile(join(directory, assertion.screenshot))).digest("hex")}` === assertion.screenshotSha256; } catch { valid = false; }
      if (!valid && assertion.verdict === "PASS") {
        if (verifyOnly) throw new Error("V2 PASS evidence is missing or tampered.");
        assertions.push({ ...assertion, observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", screenshotSha256: undefined });
      } else assertions.push(assertion);
    }
    output.push({ ...record, assertions, verdict: assertions.some((item) => item.verdict === "FAIL") ? "FAIL" : assertions.some((item) => item.verdict === "INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS" });
  }
  return output;
}
function expectedValue(predicate: "total-minor" | "coupon-error" | "contact-errors" | "synthetic-confirmation", expected: PreparedSuite["expectations"][number]): unknown {
  if (predicate === "total-minor") return expected.totalMinor;
  if (predicate === "coupon-error") return expected.couponError;
  if (predicate === "contact-errors") return expected.contactErrors;
  return expected.syntheticConfirmation;
}
function isState(value: unknown): value is DurableState {
  if (!record(value)) return false;
  const state = value as Partial<DurableState>;
  if (!exactKeys(state, ["version", "executionCount", "suites", "runs", "regressions"]) || state.version !== "2" || typeof state.executionCount !== "number" || !Number.isInteger(state.executionCount) || state.executionCount < 0 || state.executionCount > 50 || !record(state.suites) || !record(state.runs) || !record(state.regressions) || state.executionCount < Object.keys(state.runs).length) return false;
  if (!Object.entries(state.suites).every(([id, suite]) => uuid(id) && isSuite(suite))) return false;
  const suites = Object.values(state.suites) as DurableSuite[];
  if (new Set(suites.map((suite) => suite.digest)).size !== suites.length) return false;
  if (!Object.entries(state.runs).every(([id, run]) => {
    const suite = suites.find((candidate) => candidate.digest === (run as SuiteRun).approvalDigest);
    return uuid(id) && isRun(run) && run.id === id && Boolean(suite) && runMatchesSuite(run, suite!);
  })) return false;
  return Object.entries(state.regressions).every(([id, regression]) => uuid(id) && record(regression) && exactKeys(regression, ["id", "definition", "provenance"]) && regression.id === id && Array.isArray(regression.provenance) && regression.provenance.every(shortText) && isRegressionDefinition(regression.definition));
}
function record(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value: Record<string, any>, keys: readonly string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
function uuid(value: unknown) { return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value); }
function shortText(value: unknown) { return typeof value === "string" && value.length > 0 && value.length <= 500; }
function isSuite(value: unknown): value is DurableSuite {
  if (!record(value) || !exactKeys(value, ["definition", "expectations", "grounding", "context", "provenance", "digest"]) || !record(value.definition) || !Array.isArray(value.expectations) || !record(value.grounding) || !record(value.context) || !Array.isArray(value.provenance) || !/^sha256:[a-f0-9]{64}$/.test(value.digest ?? "")) return false;
  if (!isRegressionDefinition(value.definition) || value.expectations.length !== value.definition.cases.length || !value.provenance.every(shortText)) return false;
  try {
    const suite = value as DurableSuite;
    const context = { ...suite.context, rules: suite.definition.rules, requirement: suite.definition.requirement, grounding: suite.grounding };
    return approvalDigest(suite) === suite.digest && digestV2(suite.context.app) === digestV2(suite.definition.app) && digestV2(suite.context.catalog) === digestV2(suite.definition.app.catalog) && reviewedDefinitionMatchesContext(suite.definition, suite.context) && digestV2(suite.grounding) === digestV2(suite.context.grounding) && digestV2(suite.definition.releases) === digestV2(suite.grounding.releases) && digestV2(suite.definition.cases.map((item) => calculateCheckout(deriveCaseInput([...item.actions], context), suite.definition.rules, context.catalog))) === digestV2(suite.expectations);
  } catch { return false; }
}
function isRun(value: unknown): value is SuiteRun {
  if (!record(value) || !exactKeys(value, ["id", "approvalDigest", "artifact", "status", "records", "comparisons", "coverage", "verdict", "candidateVerdict", "startedAt", "endedAt"]) || !uuid(value.id) || !/^sha256:[a-f0-9]{64}$/.test(value.approvalDigest ?? "") || !isArtifactSnapshot(value.artifact) || !["accepted", "running", "completed", "interrupted"].includes(value.status) || !Array.isArray(value.records) || !Array.isArray(value.comparisons) || !Array.isArray(value.coverage) || !["PASS", "FAIL", "INCONCLUSIVE"].includes(value.verdict) || !["PASS", "FAIL", "INCONCLUSIVE"].includes(value.candidateVerdict) || !shortText(value.startedAt) || !(value.endedAt === null || shortText(value.endedAt))) return false;
  return value.records.length <= 10 && value.records.every((item) => record(item) && exactKeys(item, ["caseId", "releaseId", "actions", "assertions", "verdict", "startedAt", "endedAt"]) && shortText(item.caseId) && ["r1", "r2", "r3"].includes(item.releaseId) && Array.isArray(item.actions) && item.actions.length <= 10 && item.actions.every(isAction) && Array.isArray(item.assertions) && item.assertions.length <= 6 && item.assertions.every(isAssertion) && ["PASS", "FAIL", "INCONCLUSIVE"].includes(item.verdict) && shortText(item.startedAt) && shortText(item.endedAt)) && value.comparisons.every((item: unknown) => record(item) && exactKeys(item, ["caseId", "classification"]) && shortText(item.caseId) && ["regression", "resolved-failure", "persistent-failure", "stable-observation", "expectation-met", "expectation-not-met", "inconclusive", "non-comparable"].includes(item.classification)) && value.coverage.length <= 12 && value.coverage.every(shortText) && new Set(value.coverage).size === value.coverage.length;
}
function isAction(value: unknown) { return record(value) && exactKeys(value, ["id", "status", "startedAt", "endedAt", "url", ...(value.error === undefined ? [] : ["error"])]) && shortText(value.id) && ["completed", "blocked", "timed-out", "failed", "not-run"].includes(value.status) && (value.startedAt === null || shortText(value.startedAt)) && (value.endedAt === null || shortText(value.endedAt)) && (value.url === null || shortText(value.url)) && (value.error === undefined || shortText(value.error)); }
function isAssertion(value: unknown) { return record(value) && exactKeys(value, ["id", "expected", "observed", "verdict", "screenshot", "timestamp", "url", ...(value.screenshotSha256 === undefined ? [] : ["screenshotSha256"])]) && shortText(value.id) && ["PASS", "FAIL", "INCONCLUSIVE"].includes(value.verdict) && shortText(value.screenshot) && shortText(value.timestamp) && shortText(value.url) && (value.screenshotSha256 === undefined || /^sha256:[a-f0-9]{64}$/.test(value.screenshotSha256)); }
function runMatchesSuite(run: SuiteRun, suite: DurableSuite) {
  try {
    if (digestV2(run.artifact) !== digestV2({ definition: suite.definition, expectations: suite.expectations, provenance: suite.provenance })) return false;
    validateRecords(suite, run.records);
    if (run.status === "accepted" || run.status === "running") return run.comparisons.length === 0 && run.coverage.length === 0 && run.endedAt === null;
    const expectedCount = suite.definition.cases.length * suite.definition.releases.length;
    return run.records.length === expectedCount && run.comparisons.length === suite.definition.cases.length && new Set(run.comparisons.map((item) => item.caseId)).size === run.comparisons.length && digestV2(run.comparisons) === digestV2(comparisonsFor(suite, run.records)) && run.verdict === verdictFor(run.records, run.coverage) && run.candidateVerdict === candidateVerdict(run.records, suite.definition.releases[1].id) && run.endedAt !== null;
  } catch { return false; }
}
function isArtifactSnapshot(value: unknown) {
  return record(value) && exactKeys(value, ["definition", "expectations", "provenance"]) && isRegressionDefinition(value.definition) && Array.isArray(value.expectations) && value.expectations.length > 0 && value.expectations.length <= 5 && Array.isArray(value.provenance) && value.provenance.every(shortText);
}
function isRegressionDefinition(value: unknown) {
  if (!record(value) || !exactKeys(value, ["version", "requirement", "rules", "referenceId", "cases", "app", "releases"]) || value.version !== "2" || !record(value.requirement) || !record(value.rules) || !record(value.app) || !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > 5 || !Array.isArray(value.releases) || value.releases.length !== 2 || typeof value.referenceId !== "string") return false;
  try {
    const definition = value as SuiteDefinition;
    if (definition.app.appId !== "registered-checkout" || definition.app.adapterVersion !== "2" || !/^http:\/\/127\.0\.0\.1:\d+$/.test(definition.app.origin) || definition.app.catalog.version !== "2" || definition.app.catalog.currency !== "SGD" || !Array.isArray(definition.app.semanticTargets) || !Array.isArray(definition.requirement.criteria) || !Array.isArray(definition.requirement.adoptedReferenceIds) || definition.requirement.adoptedReferenceIds.length !== 1 || definition.referenceId !== definition.requirement.adoptedReferenceIds[0] || digestV2(definition.rules) !== digestV2(definition.requirement.normalizedRules) || definition.releases[0]?.id === definition.releases[1]?.id || new Set(definition.cases.map((item) => item.id)).size !== definition.cases.length) return false;
    const context: V2Context = { app: definition.app, catalog: definition.app.catalog, rules: definition.rules, releases: definition.releases, grounding: { releases: definition.releases, observedTargets: [], declaredTargets: definition.app.semanticTargets.map((target) => target.id), pairFingerprint: digestV2(definition.releases.map((release) => release.fingerprint)) }, requirement: definition.requirement };
    return definition.cases.every((item) => digestV2(validateCase(item, context)) === digestV2(item));
  } catch { return false; }
}
function reviewedDefinitionMatchesContext(definition: SuiteDefinition, context: V2Context) {
  try {
    const reviewedSource = definition.requirement.criteria.map(({ id, sourceQuote }) => ({ id, sourceQuote }));
    const originalSource = context.requirement.criteria.map(({ id, sourceQuote }) => ({ id, sourceQuote }));
    return definition.requirement.originalText === context.requirement.originalText && definition.referenceId === context.requirement.adoptedReferenceIds[0] && digestV2(definition.requirement.adoptedReferenceIds) === digestV2(context.requirement.adoptedReferenceIds) && digestV2(reviewedSource) === digestV2(originalSource) && digestV2(definition.rules) === digestV2(applyReviewedNumericRuleChanges(context.rules, definition.requirement.numericRuleChanges)) && context.requirement.coverageGaps.every((gap) => definition.requirement.coverageGaps.includes(gap));
  } catch { return false; }
}
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
