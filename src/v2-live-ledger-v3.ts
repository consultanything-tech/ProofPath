import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { ProposalBudgetError, type ReviewerPrincipal } from "./v2-proposal-budget.js";

export const V2_LIVE_RETIREMENT_MARKER = "v2-live.retired.json";
export const LIVE_LEDGER_V3_POLICY = Object.freeze({
  version: "3", reviewerLimit: 3, globalLimit: 50, reservationMicrousd: 50_000, globalMicrousd: 2_500_000,
  profiles: Object.freeze({
    meta: Object.freeze({ profile: "responses-v1", model: "muse-spark-1.3", protocol: "responses", endpoint: "https://api.meta.ai/v1/responses", inputCountEndpoint: "https://api.meta.ai/v1/responses/input_tokens", maxAttempts: 2, maxInputTokens: 6_073, maxOutputTokens: 4_096, inputNanousdPerToken: 1_250, outputNanousdPerToken: 4_250 }),
    baseten: Object.freeze({ profile: "baseten-v1", model: "meta-models/muse-spark-open-1026", protocol: "responses", endpoint: "https://inference.baseten.co/v1/responses", inputCountEndpoint: "https://inference.baseten.co/v1/responses/input_tokens", maxAttempts: 1, maxInputTokens: 26_073, maxOutputTokens: 4_096, inputNanousdPerToken: 1_250, outputNanousdPerToken: 4_250 })
  })
});
const HASH = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const MAX_BYTES = 131_072;
const unavailable = () => new ProposalBudgetError(503, "Live proposal admission is unavailable.");
const exhausted = () => new ProposalBudgetError(429, "Proposal budget is exhausted.");
const canonical = (value: unknown) => JSON.stringify(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;

export type LiveProvider = "meta" | "baseten";
export type LiveUsage = { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number };
export type LiveAttempt = { readonly number: number; readonly startedAt: string; readonly usage: LiveUsage | null };
export type LiveReservationStatus = "reserved" | "dispatching" | "proposal" | "clarification" | "failed-or-uncertain" | "interrupted";
export type LiveReservationV3 = { readonly id: string; readonly reviewerKey: string; readonly requestDigest: string; readonly renderedInputTokens: number; readonly provider: LiveProvider; readonly profile: string; readonly maxAttempts: number; readonly reservedMicrousd: number; readonly createdAt: string; readonly completedAt: string | null; readonly attempts: readonly LiveAttempt[]; readonly status: LiveReservationStatus };
export type LiveLedgerV3State = { readonly version: "3"; readonly policy: typeof LIVE_LEDGER_V3_POLICY; readonly liveAdmissionBlocked: null | { readonly reason: "usage-breach" | "provider-failure"; readonly at: string }; readonly reservations: readonly LiveReservationV3[] };
type LegacyReservation = { readonly id: string; readonly reviewerKey: string; readonly requestDigest: string; readonly renderedInputTokens: number; readonly createdAt: string; readonly completedAt: string | null; readonly attempts: readonly LiveAttempt[]; readonly status: LiveReservationStatus };
type LegacyState = { readonly reservations: readonly LegacyReservation[]; readonly liveAdmissionBlocked: unknown };

/** A single, provider-neutral durable admission ledger. Initialization is always explicit. */
export class LiveProposalBudgetLedgerV3 {
  private state: LiveLedgerV3State | undefined;
  private failed = false; private closed = false; private closing = false; private writes: Promise<void> = Promise.resolve(); private closeResult: Promise<void> | undefined;
  private readonly token = randomBytes(24).toString("hex"); private readonly key: Buffer;
  private constructor(private readonly dir: string, key: Buffer) { if (!Buffer.isBuffer(key) || key.length !== 32) throw unavailable(); this.key = Buffer.from(key); }
  private path(name: string) { return join(this.dir, `live-ledger-v3.${name}`); }
  private sign(value: unknown) { return createHmac("sha256", this.key).update(canonical(value)).digest("hex"); }
  private async read(name: string, limit = MAX_BYTES) { const file = await open(this.path(name), constants.O_RDONLY | constants.O_NOFOLLOW); try { const stat = await file.stat(); if (!stat.isFile() || stat.size < 1 || stat.size > limit || stat.mode & 0o077) throw unavailable(); return await file.readFile("utf8"); } finally { await file.close(); } }
  private async syncDir() { const handle = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
  private async privateDir() { const handle = await open(this.dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { const stat = await handle.stat(); if (!stat.isDirectory() || stat.mode & 0o077) throw unavailable(); } finally { await handle.close(); } }
  private async claim() { try { const file = await open(this.path("lock"), "wx", 0o600); try { await file.writeFile(this.token); await file.sync(); } finally { await file.close(); } await this.syncDir(); } catch { throw unavailable(); } }
  private async release() { if (await this.read("lock", 128) !== this.token) throw unavailable(); await unlink(this.path("lock")); await this.syncDir(); }
  private static empty(): LiveLedgerV3State { return { version: "3", policy: LIVE_LEDGER_V3_POLICY, liveAdmissionBlocked: null, reservations: [] }; }
  static async initialize({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) { return this.create(dataDir, ledgerKey, this.empty()); }
  static async migrateFromV2({ dataDir, ledgerKey, source }: { dataDir: string; ledgerKey: Buffer; source: LegacyState }) {
    if (!isRecord(source) || !Array.isArray(source.reservations) || source.liveAdmissionBlocked !== null || source.reservations.some((item) => !["proposal", "clarification"].includes(item.status))) throw unavailable();
    const reservations: LiveReservationV3[] = source.reservations.map((item) => ({ ...structuredClone(item), provider: "meta", profile: LIVE_LEDGER_V3_POLICY.profiles.meta.profile, maxAttempts: 2, reservedMicrousd: 50_000 }));
    return this.create(dataDir, ledgerKey, { version: "3", policy: LIVE_LEDGER_V3_POLICY, liveAdmissionBlocked: null, reservations });
  }
  private static async create(dataDir: string, ledgerKey: Buffer, initial: LiveLedgerV3State) {
    const ledger = new LiveProposalBudgetLedgerV3(dataDir, ledgerKey);
    try { await mkdir(dataDir, { recursive: true, mode: 0o700 }); await ledger.privateDir(); if ((await readdir(dataDir)).length !== 0) throw unavailable(); await ledger.claim(); const anchor = await open(ledger.path("anchor"), "wx", 0o600); try { await anchor.writeFile("v3\n"); await anchor.sync(); } finally { await anchor.close(); } await ledger.syncDir(); await ledger.persist(initial); return ledger; } catch { await ledger.release().catch(() => {}); throw unavailable(); }
  }
  static async open({ dataDir, ledgerKey }: { dataDir: string; ledgerKey: Buffer }) {
    const ledger = new LiveProposalBudgetLedgerV3(dataDir, ledgerKey); await ledger.privateDir(); await ledger.claim();
    try { if (await ledger.read("anchor", 8) !== "v3\n") throw unavailable(); ledger.state = ledger.decode(await ledger.read("json")); const active = ledger.state.reservations.some((item) => item.status === "reserved" || item.status === "dispatching"); if (active) await ledger.persist({ ...ledger.state, liveAdmissionBlocked: { reason: "provider-failure", at: new Date().toISOString() }, reservations: ledger.state.reservations.map((item) => item.status === "reserved" || item.status === "dispatching" ? { ...item, status: "interrupted", completedAt: new Date().toISOString() } : item) }); return ledger; } catch { if (!ledger.failed) await ledger.release().catch(() => {}); throw unavailable(); }
  }
  private profile(provider: LiveProvider) { if (provider !== "meta" && provider !== "baseten") throw unavailable(); return LIVE_LEDGER_V3_POLICY.profiles[provider]; }
  private decode(raw: string): LiveLedgerV3State {
    let env: unknown; try { env = JSON.parse(raw); } catch { throw unavailable(); }
    if (!isRecord(env) || !exact(env, ["payload", "mac"]) || typeof env.mac !== "string" || !HASH.test(env.mac) || !isRecord(env.payload) || !timingSafeEqual(Buffer.from(env.mac, "hex"), Buffer.from(this.sign(env.payload), "hex"))) throw unavailable();
    const state = env.payload;
    if (!exact(state, ["version", "policy", "liveAdmissionBlocked", "reservations"]) || state.version !== "3" || canonical(state.policy) !== canonical(LIVE_LEDGER_V3_POLICY) || !Array.isArray(state.reservations) || state.reservations.length > 50 || (state.liveAdmissionBlocked !== null && (!isRecord(state.liveAdmissionBlocked) || !exact(state.liveAdmissionBlocked, ["reason", "at"]) || !["usage-breach", "provider-failure"].includes(state.liveAdmissionBlocked.reason as string) || !iso(state.liveAdmissionBlocked.at)))) throw unavailable();
    const reviewers = new Map<string, number>(); const ids = new Set<string>();
    for (const item of state.reservations) {
      if (!isRecord(item) || !exact(item, ["id", "reviewerKey", "requestDigest", "renderedInputTokens", "provider", "profile", "maxAttempts", "reservedMicrousd", "createdAt", "completedAt", "attempts", "status"]) || typeof item.id !== "string" || !UUID.test(item.id) || ids.has(item.id) || typeof item.reviewerKey !== "string" || !HASH.test(item.reviewerKey) || typeof item.requestDigest !== "string" || !DIGEST.test(item.requestDigest) || typeof item.provider !== "string" || (item.provider !== "meta" && item.provider !== "baseten") || typeof item.renderedInputTokens !== "number" || !Number.isSafeInteger(item.renderedInputTokens) || !iso(item.createdAt) || !Array.isArray(item.attempts) || !["reserved", "dispatching", "proposal", "clarification", "failed-or-uncertain", "interrupted"].includes(item.status as string)) throw unavailable();
      const profile = this.profile(item.provider); if (item.profile !== profile.profile || item.maxAttempts !== profile.maxAttempts || item.reservedMicrousd !== 50_000 || item.renderedInputTokens < 0 || item.renderedInputTokens > profile.maxInputTokens || item.attempts.length > profile.maxAttempts) throw unavailable();
      if (["failed-or-uncertain", "interrupted"].includes(item.status as string) && state.liveAdmissionBlocked === null) throw unavailable();
      const active = item.status === "reserved" || item.status === "dispatching";
      if ((active && item.completedAt !== null) || (!active && !iso(item.completedAt)) || (item.status === "reserved" && item.attempts.length !== 0) || (["dispatching", "proposal", "clarification"].includes(item.status as string) && item.attempts.length === 0)) throw unavailable();
      let previous = Date.parse(item.createdAt);
      for (const [index, attempt] of item.attempts.entries()) {
        if (!isRecord(attempt) || !exact(attempt, ["number", "startedAt", "usage"]) || attempt.number !== index + 1 || typeof attempt.number !== "number" || attempt.number < 1 || attempt.number > profile.maxAttempts || !iso(attempt.startedAt) || Date.parse(attempt.startedAt) < previous) throw unavailable();
        if (attempt.usage !== null) { if (!isRecord(attempt.usage) || !exact(attempt.usage, ["inputTokens", "outputTokens", "totalTokens"])) throw unavailable(); const usage = attempt.usage; if (![usage.inputTokens, usage.outputTokens, usage.totalTokens].every((value) => typeof value === "number" && Number.isSafeInteger(value)) || (usage.inputTokens as number) < 0 || (usage.inputTokens as number) > item.renderedInputTokens || (usage.outputTokens as number) < 0 || (usage.outputTokens as number) > profile.maxOutputTokens || usage.totalTokens !== (usage.inputTokens as number) + (usage.outputTokens as number)) throw unavailable(); }
        previous = Date.parse(attempt.startedAt);
      }
      if (["proposal", "clarification"].includes(item.status as string) && item.attempts.at(-1)?.usage === null) throw unavailable(); if (!active && Date.parse(item.completedAt as string) < previous) throw unavailable(); ids.add(item.id); const count = (reviewers.get(item.reviewerKey) ?? 0) + 1; if (count > 3) throw unavailable(); reviewers.set(item.reviewerKey, count);
    }
    if (state.reservations.length * 50_000 > 2_500_000) throw unavailable(); return state as LiveLedgerV3State;
  }
  private require() { if (this.failed || this.closed || !this.state) throw unavailable(); return this.state; }
  private async persist(next: LiveLedgerV3State) { try { const encoded = canonical({ payload: next, mac: this.sign(next) }); this.decode(encoded); if (await this.read("lock", 128) !== this.token) throw unavailable(); const temporary = this.path("json") + `.${randomUUID()}.tmp`; const file = await open(temporary, "wx", 0o600); try { await file.writeFile(encoded); await file.sync(); } finally { await file.close(); } await rename(temporary, this.path("json")); await this.syncDir(); this.state = structuredClone(next); } catch { this.failed = true; throw unavailable(); } }
  private async checked() { try { await this.privateDir(); if (await this.read("lock", 128) !== this.token || await this.read("anchor", 8) !== "v3\n" || canonical(this.decode(await this.read("json"))) !== canonical(this.require())) throw unavailable(); } catch { this.failed = true; throw unavailable(); } }
  private mutate<T>(work: () => Promise<T>) { if (this.closing || this.closed || this.failed) return Promise.reject(unavailable()); const result = this.writes.then(async () => { this.require(); await this.checked(); return work(); }); this.writes = result.then(() => undefined, () => undefined); return result; }
  private quota(principal: ReviewerPrincipal) { const state = this.require(); if (state.liveAdmissionBlocked) throw unavailable(); if (state.reservations.length >= 50 || state.reservations.filter((item) => item.reviewerKey === principal.key).length >= 3) throw exhausted(); }
  async preflight(principal: ReviewerPrincipal) { return this.mutate(async () => { this.quota(principal); }); }
  async reserve(principal: ReviewerPrincipal, requestDigest: string, renderedInputTokens: number, provider: LiveProvider = "meta") { return this.mutate(async () => { const profile = this.profile(provider); if (!DIGEST.test(requestDigest) || !Number.isSafeInteger(renderedInputTokens) || renderedInputTokens < 0 || renderedInputTokens > profile.maxInputTokens) throw unavailable(); this.quota(principal); const state = this.require(); const id = randomUUID(); const reservation: LiveReservationV3 = { id, reviewerKey: principal.key, requestDigest, renderedInputTokens, provider, profile: profile.profile, maxAttempts: profile.maxAttempts, reservedMicrousd: 50_000, createdAt: new Date().toISOString(), completedAt: null, attempts: [], status: "reserved" }; await this.persist({ ...state, reservations: [...state.reservations, reservation] }); return id; }); }
  async beforeAttempt(id: string, number: number) { return this.mutate(async () => { const state = this.require(); const item = state.reservations.find((candidate) => candidate.id === id); if (state.liveAdmissionBlocked || !item || !Number.isSafeInteger(number) || number < 1 || number > item.maxAttempts || (number === 1 ? item.status !== "reserved" || item.attempts.length !== 0 : item.status !== "dispatching" || item.attempts.length !== number - 1)) throw unavailable(); await this.persist({ ...state, reservations: state.reservations.map((candidate) => candidate.id === id ? { ...candidate, status: "dispatching", attempts: [...candidate.attempts, { number, startedAt: new Date().toISOString(), usage: null }] } : candidate) }); }); }
  async usage(id: string, value: LiveUsage) { return this.mutate(async () => { const state = this.require(); const item = state.reservations.find((candidate) => candidate.id === id); const invalid = !item || item.status !== "dispatching" || item.attempts.at(-1)?.usage !== null || ![value.inputTokens, value.outputTokens, value.totalTokens].every((v) => Number.isSafeInteger(v) && v >= 0) || value.inputTokens > item.renderedInputTokens || value.outputTokens > this.profile(item.provider).maxOutputTokens || value.totalTokens !== value.inputTokens + value.outputTokens; if (invalid) { await this.persist({ ...state, liveAdmissionBlocked: { reason: "usage-breach", at: new Date().toISOString() } }); throw unavailable(); } const usage: LiveUsage = { inputTokens: value.inputTokens, outputTokens: value.outputTokens, totalTokens: value.totalTokens }; await this.persist({ ...state, reservations: state.reservations.map((candidate) => candidate.id === id ? { ...candidate, attempts: candidate.attempts.map((attempt, index) => index === candidate.attempts.length - 1 ? { ...attempt, usage } : attempt) } : candidate) }); }); }
  async block() { return this.mutate(async () => { const state = this.require(); if (!state.liveAdmissionBlocked) await this.persist({ ...state, liveAdmissionBlocked: { reason: "provider-failure", at: new Date().toISOString() } }); }); }
  async finish(id: string, status: Exclude<LiveReservationStatus, "reserved" | "dispatching" | "interrupted">) { return this.mutate(async () => { const state = this.require(); const item = state.reservations.find((candidate) => candidate.id === id); if (!item || !["reserved", "dispatching"].includes(item.status) || !["proposal", "clarification", "failed-or-uncertain"].includes(status)) throw unavailable(); await this.persist({ ...state, liveAdmissionBlocked: status === "failed-or-uncertain" ? state.liveAdmissionBlocked ?? { reason: "provider-failure", at: new Date().toISOString() } : state.liveAdmissionBlocked, reservations: state.reservations.map((candidate) => candidate.id === id ? { ...candidate, status, completedAt: new Date().toISOString() } : candidate) }); }); }
  async snapshot() { return this.mutate(async () => structuredClone(this.require())); }
  async close() { if (!this.closeResult) { this.closing = true; this.closeResult = (async () => { await this.writes; if (this.failed) throw unavailable(); this.closed = true; await this.release(); })(); } return this.closeResult; }
}

export const liveLedgerV3ReceiptHash = (raw: string) => "sha256:" + createHash("sha256").update(raw).digest("hex");
