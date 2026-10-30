import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { buildMetaSuiteRequest, dispatchMockedV2MetaRequest, V2_META_MODEL } from "./v2-planner.js";
import type { ProposalResult, V2Context } from "./v2-contracts.js";

export const PROPOSAL_POLICY = Object.freeze({
  version: "1", reviewerLimit: 3, globalLimit: 50,
  reservationMicrousd: 50_000, globalMicrousd: 2_500_000,
  maxAttempts: 2, maxInputTokens: 6_073, maxCompletionTokens: 4_096,
  inputNanousdPerToken: 1_250, outputNanousdPerToken: 4_250,
  model: V2_META_MODEL
});
const MAX_STATE_BYTES = 512_000;
const CERTIFICATE_AGE_MS = 60_000;
const FUTURE_SKEW_MS = 5_000;
const HASH = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CERTIFICATE_ID = /^[A-Za-z0-9._-]{1,80}$/;

export class ProposalBudgetError extends Error {
  constructor(readonly status: 401 | 429 | 503, message: string) { super(message); }
}
const unavailable = () => new ProposalBudgetError(503, "Proposal budget is unavailable.");
const admissionUnavailable = () => new ProposalBudgetError(503, "Proposal admission is unavailable.");
const accessUnavailable = () => new ProposalBudgetError(401, "Reviewer access is unavailable.");
const exhausted = () => new ProposalBudgetError(429, "Proposal budget is exhausted.");
const canonical = (value: unknown) => JSON.stringify(value);
const digest = (value: unknown) => "sha256:" + createHash("sha256").update(canonical(value)).digest("hex");
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
function iso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export type AdmissionCertificate = {
  readonly requestDigest: string; readonly model: typeof V2_META_MODEL;
  readonly billableInputTokens: number; readonly method: "test-only";
  readonly certificateId: string; readonly measuredAt: string;
};
export interface TrustedInputAdmission {
  assess(request: Readonly<object>): Promise<AdmissionCertificate>;
}
const principalBrand: unique symbol = Symbol("reviewer-principal");
export type ReviewerPrincipal = { readonly key: string; readonly [principalBrand]: true };
type Attempt = { readonly number: 1 | 2; readonly startedAt: string };
type Status = "reserved" | "dispatching" | "proposal" | "clarification" | "failed-or-uncertain" | "interrupted";
type Reservation = {
  readonly id: string; readonly reviewerKey: string; readonly requestDigest: string;
  readonly inputTokens: number; readonly reservedMicrousd: 50_000; readonly maxAttempts: 2;
  readonly attempts: readonly Attempt[]; readonly status: Status;
  readonly createdAt: string; readonly completedAt: string | null;
  readonly admission: Pick<AdmissionCertificate, "method" | "certificateId" | "measuredAt">;
};
type Payload = { readonly version: "1"; readonly policy: typeof PROPOSAL_POLICY; readonly reservations: readonly Reservation[] };

function certificateShape(value: unknown): value is AdmissionCertificate {
  return record(value) && exact(value, ["requestDigest", "model", "billableInputTokens", "method", "certificateId", "measuredAt"])
    && typeof value.requestDigest === "string" && DIGEST.test(value.requestDigest)
    && value.model === V2_META_MODEL && value.method === "test-only"
    && Number.isSafeInteger(value.billableInputTokens) && (value.billableInputTokens as number) >= 0
    && (value.billableInputTokens as number) <= PROPOSAL_POLICY.maxInputTokens
    && typeof value.certificateId === "string" && CERTIFICATE_ID.test(value.certificateId) && iso(value.measuredAt);
}
function validateCertificate(value: unknown): AdmissionCertificate {
  if (!certificateShape(value)) throw admissionUnavailable();
  const age = Date.now() - Date.parse(value.measuredAt);
  // Integer nano-USD arithmetic, rounded up once for the whole reservation.
  const worstMicrousd = Math.ceil(PROPOSAL_POLICY.maxAttempts *
    (value.billableInputTokens * PROPOSAL_POLICY.inputNanousdPerToken
      + PROPOSAL_POLICY.maxCompletionTokens * PROPOSAL_POLICY.outputNanousdPerToken) / 1000);
  if (age > CERTIFICATE_AGE_MS || age < -FUTURE_SKEW_MS || worstMicrousd > PROPOSAL_POLICY.reservationMicrousd)
    throw admissionUnavailable();
  return freeze(structuredClone(value));
}

export class ReviewerCodeRegistry {
  private readonly issued = new WeakSet<object>();
  private readonly pepper: Buffer;
  private readonly allowedDigests: readonly string[];
  constructor(pepper: Buffer, allowedDigests: readonly string[]) {
    if (!Buffer.isBuffer(pepper) || pepper.length !== 32 || !Array.isArray(allowedDigests)
      || !allowedDigests.length || allowedDigests.some((item) => typeof item !== "string" || !HASH.test(item))
      || new Set(allowedDigests).size !== allowedDigests.length) throw unavailable();
    this.pepper = Buffer.from(pepper);
    this.allowedDigests = Object.freeze([...allowedDigests]);
  }
  authenticate(header: string | undefined): ReviewerPrincipal {
    const match = typeof header === "string" && /^Bearer ([A-Za-z0-9_-]{24,128})$/.exec(header);
    if (!match) throw accessUnavailable();
    const candidate = createHmac("sha256", this.pepper).update(match[1]!).digest("hex");
    const found = this.allowedDigests.find((allowed) =>
      timingSafeEqual(Buffer.from(allowed, "hex"), Buffer.from(candidate, "hex")));
    if (!found) throw accessUnavailable();
    const principal = Object.freeze({ key: found, [principalBrand]: true as const });
    this.issued.add(principal);
    return principal;
  }
  owns(principal: unknown): principal is ReviewerPrincipal {
    return Boolean(principal) && typeof principal === "object" && this.issued.has(principal as object);
  }
  static digest(pepper: Buffer, code: string) {
    return createHmac("sha256", pepper).update(code).digest("hex");
  }
}

/** One owner per directory. Stale locks require explicit operator recovery. */
export class ProposalBudgetLedger {
  private state: Payload | undefined;
  private failed = false;
  private closed = false;
  private closing = false;
  private writes: Promise<void> = Promise.resolve();
  private closeResult: Promise<void> | undefined;
  private readonly token = randomBytes(24).toString("hex");
  private readonly key: Buffer;
  private constructor(private readonly dir: string, key: Buffer) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw unavailable();
    this.key = Buffer.from(key);
  }
  private path(name = "json") { return join(this.dir, "proposal-budget." + name); }
  private sign(payload: unknown) { return createHmac("sha256", this.key).update(canonical(payload)).digest("hex"); }
  private async read(name: string, limit: number): Promise<string> {
    const file = await open(this.path(name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > limit) throw unavailable();
      return await file.readFile("utf8");
    } finally { await file.close(); }
  }
  private async syncDirectory() {
    const directory = await open(this.dir, "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
  private async claim() {
    try {
      const file = await open(this.path("lock"), "wx", 0o600);
      try { await file.writeFile(this.token); await file.sync(); } finally { await file.close(); }
      await this.syncDirectory();
    } catch { throw unavailable(); }
  }
  private async release() {
    if (await this.read("lock", 128) !== this.token) throw unavailable();
    await unlink(this.path("lock"));
    await this.syncDirectory();
  }

  static async initialize({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) {
    const ledger = new ProposalBudgetLedger(dataDir, ledgerKey);
    try {
      await mkdir(dataDir, { recursive: true, mode: 0o700 });
      if ((await readdir(dataDir)).some((name) => name.startsWith("proposal-budget"))) throw new Error("exists");
    } catch { throw unavailable(); }
    await ledger.claim();
    try {
      // Recheck after claiming: a concurrent initializer cannot overwrite an anchor.
      if ((await readdir(dataDir)).some((name) => name.startsWith("proposal-budget") && name !== "proposal-budget.lock"))
        throw unavailable();
      const anchor = await open(ledger.path("anchor"), "wx", 0o600);
      try { await anchor.writeFile("v1\n"); await anchor.sync(); } finally { await anchor.close(); }
      await ledger.syncDirectory();
      await ledger.persist({ version: "1", policy: PROPOSAL_POLICY, reservations: [] });
      return ledger;
    } catch {
      await ledger.release().catch(() => {});
      throw unavailable();
    }
  }
  static async open({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) {
    const ledger = new ProposalBudgetLedger(dataDir, ledgerKey);
    await ledger.claim();
    try {
      if (await ledger.read("anchor", 8) !== "v1\n") throw unavailable();
      ledger.state = freeze(ledger.decode(await ledger.read("json", MAX_STATE_BYTES)));
      const active = ledger.state.reservations.some((item) => ["reserved", "dispatching"].includes(item.status));
      if (active) {
        const completedAt = new Date().toISOString();
        await ledger.persist({ ...ledger.state, reservations: ledger.state.reservations.map((item) =>
          ["reserved", "dispatching"].includes(item.status) ? { ...item, status: "interrupted", completedAt } : item) });
      }
      return ledger;
    } catch {
      await ledger.release().catch(() => {});
      throw unavailable();
    }
  }

  private decode(raw: string): Payload {
    const envelope: unknown = JSON.parse(raw);
    if (!record(envelope) || !exact(envelope, ["payload", "mac"]) || typeof envelope.mac !== "string"
      || !HASH.test(envelope.mac) || !record(envelope.payload)) throw unavailable();
    const actual = this.sign(envelope.payload);
    if (!timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(actual, "hex"))) throw unavailable();
    const payload = envelope.payload;
    if (!exact(payload, ["version", "policy", "reservations"]) || payload.version !== "1"
      || canonical(payload.policy) !== canonical(PROPOSAL_POLICY) || !Array.isArray(payload.reservations)
      || payload.reservations.length > PROPOSAL_POLICY.globalLimit) throw unavailable();
    const ids = new Set<string>();
    const counts = new Map<string, number>();
    for (const item of payload.reservations) {
      if (!record(item) || !exact(item, ["id", "reviewerKey", "requestDigest", "inputTokens",
        "reservedMicrousd", "maxAttempts", "attempts", "status", "createdAt", "completedAt", "admission"])
        || typeof item.id !== "string" || !UUID.test(item.id) || ids.has(item.id)
        || typeof item.reviewerKey !== "string" || !HASH.test(item.reviewerKey)
        || typeof item.requestDigest !== "string" || !DIGEST.test(item.requestDigest)
        || !Number.isSafeInteger(item.inputTokens) || (item.inputTokens as number) < 0 || (item.inputTokens as number) > PROPOSAL_POLICY.maxInputTokens
        || item.reservedMicrousd !== PROPOSAL_POLICY.reservationMicrousd || item.maxAttempts !== PROPOSAL_POLICY.maxAttempts
        || !iso(item.createdAt) || !Array.isArray(item.attempts) || item.attempts.length > 2
        || !["reserved", "dispatching", "proposal", "clarification", "failed-or-uncertain", "interrupted"].includes(item.status as string)
        || !record(item.admission) || !exact(item.admission, ["method", "certificateId", "measuredAt"])
        || item.admission.method !== "test-only" || typeof item.admission.certificateId !== "string"
        || !CERTIFICATE_ID.test(item.admission.certificateId) || !iso(item.admission.measuredAt)) throw unavailable();
      const created = Date.parse(item.createdAt);
      const measuredAge = created - Date.parse(item.admission.measuredAt);
      if (measuredAge > CERTIFICATE_AGE_MS || measuredAge < -FUTURE_SKEW_MS) throw unavailable();
      const active = item.status === "reserved" || item.status === "dispatching";
      if (active ? item.completedAt !== null : !iso(item.completedAt)) throw unavailable();
      if ((item.status === "reserved" && item.attempts.length !== 0)
        || (["dispatching", "proposal", "clarification"].includes(item.status as string) && item.attempts.length === 0))
        throw unavailable();
      let lastTime = created;
      for (const [index, attempt] of item.attempts.entries()) {
        if (!record(attempt) || !exact(attempt, ["number", "startedAt"]) || attempt.number !== index + 1 || !iso(attempt.startedAt))
          throw unavailable();
        const time = Date.parse(attempt.startedAt);
        if (time < lastTime) throw unavailable();
        lastTime = time;
      }
      if (!active && Date.parse(item.completedAt as string) < lastTime) throw unavailable();
      ids.add(item.id);
      const count = (counts.get(item.reviewerKey) ?? 0) + 1;
      if (count > PROPOSAL_POLICY.reviewerLimit) throw unavailable();
      counts.set(item.reviewerKey, count);
    }
    if (payload.reservations.length * PROPOSAL_POLICY.reservationMicrousd > PROPOSAL_POLICY.globalMicrousd) throw unavailable();
    return payload as unknown as Payload;
  }
  private require(): Payload {
    if (this.failed || this.closed || !this.state) throw unavailable();
    return this.state;
  }
  private async verifyDisk() {
    if (await this.read("lock", 128) !== this.token || await this.read("anchor", 8) !== "v1\n")
      throw unavailable();
    const disk = this.decode(await this.read("json", MAX_STATE_BYTES));
    if (canonical(disk) !== canonical(this.require())) throw unavailable();
  }
  private mutate<T>(work: () => Promise<T>): Promise<T> {
    if (this.closing || this.closed || this.failed) return Promise.reject(unavailable());
    const result = this.writes.then(async () => {
      this.require();
      try { await this.verifyDisk(); } catch { this.failed = true; throw unavailable(); }
      return work();
    });
    this.writes = result.then(() => undefined, () => undefined);
    return result;
  }
  private async persist(next: Payload) {
    try {
      const encoded = canonical({ payload: next, mac: this.sign(next) });
      this.decode(encoded);
      if (await this.read("lock", 128) !== this.token) throw unavailable();
      const temporary = this.path("json") + "." + randomUUID() + ".tmp";
      const file = await open(temporary, "wx", 0o600);
      try { await file.writeFile(encoded); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.path());
      await this.syncDirectory();
      this.state = freeze(next);
    } catch { this.failed = true; throw unavailable(); }
  }
  async close(): Promise<void> {
    if (!this.closeResult) {
      this.closing = true;
      this.closeResult = (async () => {
        await this.writes;
        this.closed = true;
        try { await this.release(); } catch { throw unavailable(); }
      })();
    }
    return this.closeResult;
  }
  private quota(principal: ReviewerPrincipal) {
    const state = this.require();
    const used = state.reservations.length;
    if (state.reservations.filter((item) => item.reviewerKey === principal.key).length >= PROPOSAL_POLICY.reviewerLimit
      || used >= PROPOSAL_POLICY.globalLimit || used * PROPOSAL_POLICY.reservationMicrousd >= PROPOSAL_POLICY.globalMicrousd)
      throw exhausted();
  }
  async preflight(principal: ReviewerPrincipal) { return this.mutate(async () => { this.quota(principal); }); }
  async reserve(principal: ReviewerPrincipal, value: AdmissionCertificate): Promise<string> {
    return this.mutate(async () => {
      const certificate = validateCertificate(value);
      if (!principal || typeof principal.key !== "string" || !HASH.test(principal.key)) throw accessUnavailable();
      this.quota(principal);
      const id = randomUUID();
      const reservation: Reservation = {
        id, reviewerKey: principal.key, requestDigest: certificate.requestDigest, inputTokens: certificate.billableInputTokens,
        reservedMicrousd: 50_000, maxAttempts: 2, attempts: [], status: "reserved",
        createdAt: new Date().toISOString(), completedAt: null,
        admission: { method: certificate.method, certificateId: certificate.certificateId, measuredAt: certificate.measuredAt }
      };
      await this.persist({ ...this.require(), reservations: [...this.require().reservations, reservation] });
      return id;
    });
  }
  async beforeAttempt(id: string, number: 1 | 2) {
    return this.mutate(async () => {
      const state = this.require();
      const item = state.reservations.find((candidate) => candidate.id === id);
      if (!item || ![1, 2].includes(number)
        || (number === 1 ? item.status !== "reserved" || item.attempts.length !== 0 : item.status !== "dispatching" || item.attempts.length !== 1))
        throw unavailable();
      await this.persist({ ...state, reservations: state.reservations.map((candidate) => candidate.id === id
        ? { ...candidate, status: "dispatching", attempts: [...candidate.attempts, { number, startedAt: new Date().toISOString() }] } : candidate) });
    });
  }
  async finish(id: string, status: Status) {
    return this.mutate(async () => {
      const state = this.require();
      const item = state.reservations.find((candidate) => candidate.id === id);
      if (!item || !["reserved", "dispatching"].includes(item.status)
        || !["proposal", "clarification", "failed-or-uncertain"].includes(status)
        || (status !== "failed-or-uncertain" && item.attempts.length === 0)) throw unavailable();
      await this.persist({ ...state, reservations: state.reservations.map((candidate) => candidate.id === id
        ? { ...candidate, status, completedAt: new Date().toISOString() } : candidate) });
    });
  }
  async snapshot() {
    return this.mutate(async () => structuredClone({ reservations: this.require().reservations,
      counts: { used: this.require().reservations.length, money: this.require().reservations.length * PROPOSAL_POLICY.reservationMicrousd } }));
  }
}

/** Test-only transport/meter injection; this is deliberately not a live factory. */
export class BudgetedMockProposalService {
  constructor(private readonly ledger: ProposalBudgetLedger, private readonly registry: ReviewerCodeRegistry,
    private readonly admission: TrustedInputAdmission | undefined, private readonly fetcher: typeof fetch) {}
  async authorize(header: string | undefined) {
    const principal = this.registry.authenticate(header);
    await this.ledger.preflight(principal);
    return principal;
  }
  async propose(context: V2Context, principal: ReviewerPrincipal):
    Promise<{ proposal: ProposalResult; reservationId: string; provenance: readonly string[] }> {
    if (!this.registry.owns(principal)) throw accessUnavailable();
    let snapshot: V2Context;
    let request: object;
    let certificate: AdmissionCertificate;
    try {
      snapshot = freeze(structuredClone(context));
      request = freeze(structuredClone(buildMetaSuiteRequest(snapshot)));
      const expectedDigest = digest(request);
      certificate = validateCertificate(structuredClone(await this.admission?.assess(request)));
      if (certificate.requestDigest !== expectedDigest || digest(request) !== expectedDigest) throw admissionUnavailable();
    } catch { throw admissionUnavailable(); }
    const reservationId = await this.ledger.reserve(principal, certificate);
    try {
      const proposal = await dispatchMockedV2MetaRequest(snapshot, this.fetcher,
        (attempt) => this.ledger.beforeAttempt(reservationId, attempt), request);
      await this.ledger.finish(reservationId, proposal.kind === "proposal" ? "proposal" : "clarification");
      return { proposal, reservationId, provenance: ["budgeted-test-only-v2", "reservation:" + reservationId] };
    } catch {
      await this.ledger.finish(reservationId, "failed-or-uncertain").catch(() => {});
      throw new ProposalBudgetError(503, "Budgeted proposal was unavailable.");
    }
  }
}
export class TestOnlyInputAdmission implements TrustedInputAdmission {
  constructor(private readonly tokens: number, private readonly certificateId = "test-meter") {}
  async assess(request: Readonly<object>): Promise<AdmissionCertificate> {
    return { requestDigest: digest(request), model: V2_META_MODEL, billableInputTokens: this.tokens,
      method: "test-only", certificateId: this.certificateId, measuredAt: new Date().toISOString() };
  }
}

