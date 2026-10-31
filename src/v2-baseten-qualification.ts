import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  BASETEN_QUALIFICATION_MODEL, BASETEN_QUALIFICATION_MAX_OUTPUT_TOKENS,
  basetenQualificationDigest, buildBasetenQualificationRequest,
  parseBasetenQualificationEnvelope, readBasetenQualificationUsage, type BasetenQualificationUsage
} from "./v2-baseten-planner.js";
import type { V2Context } from "./v2-contracts.js";
import type { V2Store } from "./v2-store.js";

/** Deliberately synthetic rates, not Baseten pricing or authorized spending. */
const syntheticReservation = Number((16_000n * 1_130n + 4_096n * 4_170n + 999n) / 1_000n);
export const BASETEN_OFFLINE_POLICY = Object.freeze({
  version: "baseten-offline-1", scope: "operator-mock-only", syntheticOnly: true,
  model: BASETEN_QUALIFICATION_MODEL, protocol: "responses-provisional", maxAttempts: 1, maxReservations: 1,
  maxInputTokens: 16_000, maxOutputTokens: BASETEN_QUALIFICATION_MAX_OUTPUT_TOKENS,
  syntheticInputNanousdPerToken: 1_130, syntheticOutputNanousdPerToken: 4_170,
  reservationMicrousd: syntheticReservation, totalMicrousd: syntheticReservation
});
type Status = "reserved" | "dispatching" | "proposal" | "clarification" | "failed-or-uncertain" | "interrupted";
type Reservation = {
  readonly id: string; readonly requestDigest: string; readonly inputCap: number; readonly reservedMicrousd: number;
  readonly status: Status; readonly createdAt: string; readonly attemptStartedAt: string | null;
  readonly completedAt: string | null; readonly usage: BasetenQualificationUsage | null;
};
type State = {
  readonly version: "baseten-offline-1"; readonly policy: typeof BASETEN_OFFLINE_POLICY; readonly blocked: boolean;
  readonly reservedMicrousd: number; readonly reservations: readonly Reservation[];
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const json = (value: unknown) => JSON.stringify(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const unavailable = () => new Error("Offline Baseten qualification is unavailable.");
const digest = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
function usageValid(value: unknown, inputCap: number): value is BasetenQualificationUsage {
  if (!record(value) || !exact(value, ["inputTokens", "outputTokens", "totalTokens", "reasoningTokens"])) return false;
  const { inputTokens, outputTokens, totalTokens, reasoningTokens } = value;
  return count(inputTokens) && count(outputTokens) && count(totalTokens) && count(reasoningTokens) &&
    inputTokens <= inputCap && outputTokens <= BASETEN_OFFLINE_POLICY.maxOutputTokens &&
    totalTokens === inputTokens + outputTokens && reasoningTokens <= outputTokens;
}

/** Isolated synthetic state. No reviewer interface, provider I/O or secret lookup. */
export class BasetenQualificationLedger {
  private state: State | undefined;
  private failed = false;
  private closed = false;
  private closing = false;
  private closeResult: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private readonly token = randomBytes(24).toString("hex");

  private constructor(private readonly dir: string, private readonly key: Buffer) { if (key.length !== 32) throw unavailable(); }
  private path(name: string) { return join(this.dir, `baseten-qualification.${name}`); }
  private sign(value: unknown) { return createHmac("sha256", this.key).update(json(value)).digest("hex"); }
  private async directory() {
    const file = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { const stat = await file.stat(); if (!stat.isDirectory() || stat.mode & 0o077) throw unavailable(); }
    finally { await file.close(); }
  }
  private async syncDir() {
    const handle = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try { await handle.sync(); } finally { await handle.close(); }
  }
  private async read(name: string, limit = 65_536) {
    const file = await open(this.path(name), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.mode & 0o077 || stat.size > limit) throw unavailable();
      return await file.readFile("utf8");
    } finally { await file.close(); }
  }
  private async claim() {
    const file = await open(this.path("lock"), "wx", 0o600);
    try { await file.writeFile(this.token); await file.sync(); } finally { await file.close(); }
    await this.syncDir();
  }
  private async release() {
    if (await this.read("lock", 128) !== this.token) throw unavailable();
    await unlink(this.path("lock")); await this.syncDir();
  }
  static async initialize({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) {
    const ledger = new BasetenQualificationLedger(dataDir, Buffer.from(ledgerKey));
    try {
      await mkdir(dataDir, { recursive: true, mode: 0o700 }); await ledger.directory();
      if ((await readdir(dataDir)).length) throw unavailable();
      await ledger.claim();
      const anchor = await open(ledger.path("anchor"), "wx", 0o600);
      try { await anchor.writeFile("baseten-offline-1\n"); await anchor.sync(); } finally { await anchor.close(); }
      await ledger.syncDir();
      await ledger.persist({ version: "baseten-offline-1", policy: BASETEN_OFFLINE_POLICY, blocked: false, reservedMicrousd: 0, reservations: [] });
      return ledger;
    } catch { await ledger.release().catch(() => {}); throw unavailable(); }
  }
  static async open({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) {
    const ledger = new BasetenQualificationLedger(dataDir, Buffer.from(ledgerKey));
    try {
      await ledger.directory(); await ledger.claim();
      if (await ledger.read("anchor", 32) !== "baseten-offline-1\n") throw unavailable();
      ledger.state = ledger.decode(await ledger.read("json"));
      if (ledger.state.reservations.some((item) => item.status === "reserved" || item.status === "dispatching")) {
        await ledger.persist({ ...ledger.state, blocked: true, reservations: ledger.state.reservations.map((item) =>
          item.status === "reserved" || item.status === "dispatching" ? { ...item, status: "interrupted", completedAt: new Date().toISOString() } : item) });
      }
      return ledger;
    } catch { await ledger.release().catch(() => {}); throw unavailable(); }
  }
  private decode(raw: string): State {
    let envelope: unknown; try { envelope = JSON.parse(raw); } catch { throw unavailable(); }
    if (!record(envelope) || !exact(envelope, ["payload", "mac"]) || typeof envelope.mac !== "string" || !/^[a-f0-9]{64}$/.test(envelope.mac) || !record(envelope.payload)) throw unavailable();
    if (!timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(this.sign(envelope.payload), "hex"))) throw unavailable();
    const state = envelope.payload;
    if (!exact(state, ["version", "policy", "blocked", "reservedMicrousd", "reservations"]) ||
        state.version !== "baseten-offline-1" || json(state.policy) !== json(BASETEN_OFFLINE_POLICY) || typeof state.blocked !== "boolean" ||
        !Array.isArray(state.reservations) || state.reservations.length > BASETEN_OFFLINE_POLICY.maxReservations ||
        state.reservedMicrousd !== state.reservations.length * BASETEN_OFFLINE_POLICY.reservationMicrousd ||
        !count(state.reservedMicrousd) || state.reservedMicrousd > BASETEN_OFFLINE_POLICY.totalMicrousd) throw unavailable();
    for (const item of state.reservations) {
      if (!record(item) || !exact(item, ["id", "requestDigest", "inputCap", "reservedMicrousd", "status", "createdAt", "attemptStartedAt", "completedAt", "usage"]) ||
          typeof item.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item.id) ||
          !digest(item.requestDigest) || !count(item.inputCap) || item.inputCap > BASETEN_OFFLINE_POLICY.maxInputTokens ||
          item.reservedMicrousd !== BASETEN_OFFLINE_POLICY.reservationMicrousd || !iso(item.createdAt) ||
          !["reserved", "dispatching", "proposal", "clarification", "failed-or-uncertain", "interrupted"].includes(item.status as string)) throw unavailable();
      const active = item.status === "reserved" || item.status === "dispatching";
      if (active ? item.completedAt !== null : !iso(item.completedAt)) throw unavailable();
      if (item.attemptStartedAt !== null && (!iso(item.attemptStartedAt) || Date.parse(item.attemptStartedAt) < Date.parse(item.createdAt))) throw unavailable();
      if (item.status === "reserved" && (item.attemptStartedAt !== null || item.usage !== null)) throw unavailable();
      if (["dispatching", "proposal", "clarification"].includes(item.status as string) && item.attemptStartedAt === null) throw unavailable();
      if (item.usage !== null && (item.attemptStartedAt === null || !usageValid(item.usage, item.inputCap))) throw unavailable();
      if (["proposal", "clarification"].includes(item.status as string) && item.usage === null) throw unavailable();
      if (item.completedAt !== null && Date.parse(item.completedAt as string) < Date.parse((item.attemptStartedAt ?? item.createdAt) as string)) throw unavailable();
      if (["failed-or-uncertain", "interrupted"].includes(item.status as string) && !state.blocked) throw unavailable();
    }
    return state as State;
  }
  private require() { if (!this.state || this.failed || this.closed) throw unavailable(); return this.state; }
  private async persist(next: State) {
    try {
      const encoded = json({ payload: next, mac: this.sign(next) }); this.decode(encoded);
      if (await this.read("lock", 128) !== this.token) throw unavailable();
      const filePath = `${this.path("json")}.${randomUUID()}.tmp`;
      const file = await open(filePath, "wx", 0o600);
      try { await file.writeFile(encoded); await file.sync(); } finally { await file.close(); }
      await rename(filePath, this.path("json")); await this.syncDir(); this.state = structuredClone(next);
    } catch { this.failed = true; throw unavailable(); }
  }
  private mutate<T>(work: () => Promise<T>) {
    if (this.closing || this.closed || this.failed) return Promise.reject(unavailable());
    const result = this.writes.then(async () => {
      try {
        await this.directory();
        if (await this.read("lock", 128) !== this.token || await this.read("anchor", 32) !== "baseten-offline-1\n" || json(this.decode(await this.read("json"))) !== json(this.require())) throw unavailable();
      } catch { this.failed = true; throw unavailable(); }
      return work();
    });
    this.writes = result.then(() => undefined, () => undefined);
    return result;
  }
  async reserve(requestDigest: string, inputCap: number) {
    return this.mutate(async () => {
      const state = this.require();
      if (state.blocked || state.reservations.length || !digest(requestDigest) || !count(inputCap) || inputCap > BASETEN_OFFLINE_POLICY.maxInputTokens) throw unavailable();
      const id = randomUUID();
      await this.persist({ ...state, reservedMicrousd: BASETEN_OFFLINE_POLICY.reservationMicrousd, reservations: [{
        id, requestDigest, inputCap, reservedMicrousd: BASETEN_OFFLINE_POLICY.reservationMicrousd,
        status: "reserved", createdAt: new Date().toISOString(), attemptStartedAt: null, completedAt: null, usage: null
      }] });
      return id;
    });
  }
  async beforeScript(id: string) {
    return this.mutate(async () => {
      const state = this.require(); const item = state.reservations[0];
      if (!item || item.id !== id || state.blocked || item.status !== "reserved") throw unavailable();
      await this.persist({ ...state, reservations: [{ ...item, status: "dispatching", attemptStartedAt: new Date().toISOString() }] });
    });
  }
  async recordUsage(id: string, usage: BasetenQualificationUsage) {
    return this.mutate(async () => {
      const state = this.require(); const item = state.reservations[0];
      if (!item || item.id !== id || item.status !== "dispatching" || item.usage !== null || !usageValid(usage, item.inputCap)) {
        await this.persist({ ...state, blocked: true }); throw unavailable();
      }
      await this.persist({ ...state, reservations: [{ ...item, usage: structuredClone(usage) }] });
    });
  }
  async finish(id: string, status: "proposal" | "clarification" | "failed-or-uncertain") {
    return this.mutate(async () => {
      const state = this.require(); const item = state.reservations[0];
      if (!item || item.id !== id || item.status !== "dispatching" || !["proposal", "clarification", "failed-or-uncertain"].includes(status)) throw unavailable();
      await this.persist({ ...state, blocked: state.blocked || status === "failed-or-uncertain", reservations: [{ ...item, status, completedAt: new Date().toISOString() }] });
    });
  }
  async blockAndFinish(id: string) {
    return this.mutate(async () => {
      const state = this.require(); const item = state.reservations[0];
      if (!item || item.id !== id || !["reserved", "dispatching"].includes(item.status)) throw unavailable();
      await this.persist({ ...state, blocked: true, reservations: [{ ...item, status: "failed-or-uncertain", completedAt: new Date().toISOString() }] });
    });
  }
  async snapshot() { return this.mutate(async () => structuredClone(this.require())); }
  async close() {
    if (!this.closeResult) {
      this.closing = true;
      this.closeResult = (async () => {
        await this.writes; this.closed = true;
        // If a durable write/integrity check failed, leave ownership locked for explicit investigation.
        if (this.failed) throw unavailable();
        await this.release();
      })();
    }
    return this.closeResult;
  }
}

export type ScriptedBasetenResponse = Readonly<{ kind: "response"; envelope: unknown } | { kind: "uncertain" }>;
/** Finite, snapshotted data, with no callback or network-transport selection. */
export class ScriptedBasetenQualification {
  private readonly script: ScriptedBasetenResponse;
  private consumed = false;
  constructor(private readonly ledger: BasetenQualificationLedger, scripts: readonly ScriptedBasetenResponse[]) {
    try {
      if (!Array.isArray(scripts) || scripts.length !== 1) throw unavailable();
      this.script = structuredClone(scripts[0]!);
      if (!record(this.script) || (this.script.kind === "response" ? !exact(this.script, ["kind", "envelope"]) : this.script.kind !== "uncertain" || !exact(this.script, ["kind"]))) throw unavailable();
    } catch { throw unavailable(); }
  }
  async propose(context: V2Context, inputCap: number) {
    const snapshot = structuredClone(context);
    const request = buildBasetenQualificationRequest(snapshot);
    const reservationId = await this.ledger.reserve(basetenQualificationDigest(request), inputCap);
    try {
      await this.ledger.beforeScript(reservationId);
      if (this.consumed) throw unavailable();
      this.consumed = true;
      if (this.script.kind === "uncertain") throw unavailable();
      const envelope = this.script.envelope;
      await this.ledger.recordUsage(reservationId, readBasetenQualificationUsage(envelope));
      const parsed = parseBasetenQualificationEnvelope(envelope, snapshot);
      await this.ledger.finish(reservationId, parsed.proposal.kind);
      return { request, reservationId, proposal: parsed.proposal, provenance: ["baseten-mocked", "offline-unverified", "synthetic-accounting", `reservation:${reservationId}`] as const };
    } catch {
      await this.ledger.blockAndFinish(reservationId).catch(() => {});
      throw unavailable();
    }
  }
  async createPrepared(store: V2Store, context: V2Context, inputCap: number) {
    const snapshot = structuredClone(context);
    const result = await this.propose(snapshot, inputCap);
    return result.proposal.kind === "proposal" ? { ...result, prepared: await store.createProposal(result.proposal, snapshot, result.provenance) } : result;
  }
}
