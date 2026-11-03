import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LiveProposalBudgetLedger, V2LiveLedgerState } from "./v2-live-proposal.js";
import { LiveProposalBudgetLedgerV3, V2_LIVE_RETIREMENT_MARKER, liveLedgerV3ReceiptHash } from "./v2-live-ledger-v3.js";
import { ReviewerCodeRegistry } from "./v2-proposal-budget.js";

const unavailable = () => new Error("Live operator configuration is unavailable.");
const v3 = "v3";
const ledgerDirectory = "ledger";
const names = { ledger: "ledger.key", pepper: "reviewer.pepper", allowlist: "reviewer.allowlist.json", marker: "operator-v3.json", code: "reviewer-code.txt", receipt: "migration-receipt.json" } as const;
const oldNames = { ledger: "ledger.key", pepper: "reviewer.pepper", allowlist: "reviewer.allowlist.json", marker: "operator-v2.json", code: "reviewer-code.txt" } as const;
const canonical = (value: unknown) => JSON.stringify(value);
const hash = (value: string | Buffer) => "sha256:" + createHash("sha256").update(value).digest("hex");
const HASH = /^[a-f0-9]{64}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const code = () => randomBytes(24).toString("base64url");
const defaultDir = () => resolve(process.env.V2_OPERATOR_DIR ?? "runs/v2-live/operator");
export type LiveMigrationPhase = "config" | "ledger" | "receipt" | "verified" | "published" | "before-retire" | "retired";
let migrationPhaseHook: ((phase: LiveMigrationPhase) => void | Promise<void>) | undefined;
/** Test-only deterministic fault injection; callers receive phase names, never operator material. */
export function setLiveMigrationPhaseHookForTest(hook: ((phase: LiveMigrationPhase) => void | Promise<void>) | undefined) { migrationPhaseHook = hook; }
async function phase(name: LiveMigrationPhase) { await migrationPhaseHook?.(name); }

async function privateDir(dir: string) { const handle = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { const stat = await handle.stat(); if (!stat.isDirectory() || stat.mode & 0o077) throw unavailable(); } finally { await handle.close(); } }
async function privateFile(path: string, value: string | Buffer) { const file = await open(path, "wx", 0o600); try { await file.writeFile(value); await file.sync(); } finally { await file.close(); } }
async function secret(path: string) { const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const stat = await file.stat(); if (!stat.isFile() || stat.mode & 0o077 || stat.size < 1 || stat.size > 131_072) throw unavailable(); return await file.readFile(); } finally { await file.close(); } }
async function syncDir(dir: string) { const handle = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { await handle.sync(); } finally { await handle.close(); } }
async function exists(path: string) { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw unavailable(); } }
function parseConfig(raw: Buffer, expected: "2" | "3") { let value: unknown; try { value = JSON.parse(raw.toString("utf8")); } catch { throw unavailable(); } if (!record(value) || !exact(value, expected === "2" ? ["version", "profile"] : ["version", "migratedFromV2"]) || value.version !== expected || (expected === "2" && value.profile !== "responses-v1") || (expected === "3" && typeof value.migratedFromV2 !== "boolean")) throw unavailable(); return value; }
async function config(dir: string, versions: "2" | "3") {
  const map = versions === "2" ? oldNames : names; parseConfig(await secret(join(dir, map.marker)), versions);
  let allowed: unknown; try { allowed = JSON.parse((await secret(join(dir, map.allowlist))).toString("utf8")); } catch { throw unavailable(); }
  if (!record(allowed) || !exact(allowed, ["version", "digests"]) || allowed.version !== versions || !Array.isArray(allowed.digests)) throw unavailable();
  const ledgerKey = await secret(join(dir, map.ledger)); const pepper = await secret(join(dir, map.pepper)); const reviewerCode = (await secret(join(dir, map.code))).toString("utf8").trim();
  if (ledgerKey.length !== 32 || pepper.length !== 32 || !/^[A-Za-z0-9_-]{24,128}$/.test(reviewerCode)) throw unavailable();
  return { ledgerKey, pepper, reviewerCode, allowlist: allowed.digests as unknown[] };
}
function registry(pepper: Buffer, digests: readonly unknown[]) { if (!digests.every((item) => typeof item === "string" && HASH.test(item))) throw unavailable(); return new ReviewerCodeRegistry(pepper, digests as readonly string[]); }

export type LiveOperatorV3 = { readonly ledger: LiveProposalBudgetLedgerV3; readonly registry: ReviewerCodeRegistry; close(): Promise<void> };

/** Fresh accounting is explicit and only permitted in an empty operator root. */
export async function initializeLiveOperatorV3(dataDir = defaultDir()) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 }); await privateDir(dataDir);
  if ((await readdir(dataDir)).length !== 0 || await exists(join(dataDir, V2_LIVE_RETIREMENT_MARKER))) throw unavailable();
  const dir = join(dataDir, v3); await mkdir(dir, { mode: 0o700 }); await privateDir(dir);
  try {
    const ledgerKey = randomBytes(32); const pepper = randomBytes(32); const reviewerCode = code();
    await privateFile(join(dir, names.ledger), ledgerKey); await privateFile(join(dir, names.pepper), pepper);
    await privateFile(join(dir, names.allowlist), `${JSON.stringify({ version: "3", digests: [ReviewerCodeRegistry.digest(pepper, reviewerCode)] })}\n`);
    await privateFile(join(dir, names.marker), `${JSON.stringify({ version: "3", migratedFromV2: false })}\n`); await privateFile(join(dir, names.code), `${reviewerCode}\n`);
    const ledger = await LiveProposalBudgetLedgerV3.initialize({ dataDir: join(dir, ledgerDirectory), ledgerKey }); await syncDir(dir); await syncDir(dataDir); return { dataDir, reviewerCode, ledger };
  } catch { throw unavailable(); }
}

type ReceiptPayload = { readonly version: "3"; readonly sourceStateHash: string; readonly importedReservationsHash: string; readonly reservationCount: number; readonly reservedMicrousd: number; readonly migratedAt: string };
function receiptEnvelope(key: Buffer, payload: ReceiptPayload) { return { payload, mac: createHmac("sha256", key).update(canonical(payload)).digest("hex") }; }
function verifyReceipt(raw: Buffer, key: Buffer): ReceiptPayload {
  let value: unknown; try { value = JSON.parse(raw.toString("utf8")); } catch { throw unavailable(); }
  if (!record(value) || !exact(value, ["payload", "mac"]) || typeof value.mac !== "string" || !HASH.test(value.mac) || !record(value.payload) || !exact(value.payload, ["version", "sourceStateHash", "importedReservationsHash", "reservationCount", "reservedMicrousd", "migratedAt"])) throw unavailable();
  const payload = value.payload;
  if (payload.version !== "3" || typeof payload.sourceStateHash !== "string" || !DIGEST.test(payload.sourceStateHash) || typeof payload.importedReservationsHash !== "string" || !DIGEST.test(payload.importedReservationsHash) || typeof payload.reservationCount !== "number" || !Number.isSafeInteger(payload.reservationCount) || payload.reservationCount < 0 || payload.reservationCount > 50 || payload.reservedMicrousd !== payload.reservationCount * 50_000 || !iso(payload.migratedAt)) throw unavailable();
  const mac = createHmac("sha256", key).update(canonical(value.payload)).digest("hex"); if (!timingSafeEqual(Buffer.from(value.mac, "hex"), Buffer.from(mac, "hex"))) throw unavailable(); return value.payload as ReceiptPayload;
}
type VerifiedV2Source = { readonly ledgerKey: Buffer; readonly pepper: Buffer; readonly reviewerCode: string; readonly allowlist: readonly unknown[]; readonly rawState: Buffer; readonly state: V2LiveLedgerState };
async function verifiedV2Source(dataDir: string): Promise<VerifiedV2Source> {
  const source = await config(dataDir, "2"); registry(source.pepper, source.allowlist).authenticate(`Bearer ${source.reviewerCode}`);
  const rawState = await secret(join(dataDir, "live-proposal-budget.json")); const state = await LiveProposalBudgetLedger.readVerifiedState({ dataDir, ledgerKey: source.ledgerKey });
  if (state.liveAdmissionBlocked || state.reservations.some((item) => !["proposal", "clarification"].includes(item.status))) throw unavailable();
  return { ...source, rawState, state };
}
const importedReservationsHash = (state: V2LiveLedgerState) => hash(canonical(state.reservations.map((item) => ({ ...item, provider: "meta", profile: "responses-v1", maxAttempts: 2, reservedMicrousd: 50_000 }))));
async function verifyPublishedCandidate(dataDir: string, dir: string, source: VerifiedV2Source) {
  await privateDir(dir); const loaded = await config(dir, "3"); const marker = parseConfig(await secret(join(dir, names.marker)), "3");
  if (!marker.migratedFromV2) throw unavailable(); registry(loaded.pepper, loaded.allowlist).authenticate(`Bearer ${loaded.reviewerCode}`);
  const receipt = await secret(join(dir, names.receipt)); const payload = verifyReceipt(receipt, loaded.ledgerKey);
  if (payload.sourceStateHash !== hash(source.rawState) || payload.importedReservationsHash !== importedReservationsHash(source.state) || payload.reservationCount !== source.state.reservations.length || payload.reservedMicrousd !== source.state.reservations.length * 50_000) throw unavailable();
  const ledger = await LiveProposalBudgetLedgerV3.open({ dataDir: join(dir, ledgerDirectory), ledgerKey: loaded.ledgerKey });
  try { const state = await ledger.snapshot(); if (state.reservations.length !== payload.reservationCount || hash(canonical(state.reservations)) !== payload.importedReservationsHash) throw unavailable(); } finally { await ledger.close(); }
  return receipt;
}
async function publishRetirement(dataDir: string, receipt: Buffer) {
  const target = join(dataDir, V2_LIVE_RETIREMENT_MARKER); if (await exists(target)) throw unavailable();
  const temporary = join(dataDir, `.${V2_LIVE_RETIREMENT_MARKER}.${randomUUID()}.tmp`);
  await privateFile(temporary, `${canonical({ version: "3", receiptHash: liveLedgerV3ReceiptHash(receipt.toString("utf8")) })}\n`);
  await rename(temporary, target); await syncDir(dataDir);
}

/** Opens only an existing v3 profile. A migrated profile additionally proves its v2 retirement binding. */
export async function openLiveOperatorV3(dataDir = defaultDir()): Promise<LiveOperatorV3> {
  try {
    if (await exists(join(dataDir, "gcp-live.retired.json"))) throw new Error("Local operator has been retired for GCP.");
    await privateDir(dataDir); const dir = join(dataDir, v3); await privateDir(dir); const loaded = await config(dir, "3"); const marker = parseConfig(await secret(join(dir, names.marker)), "3"); const reg = registry(loaded.pepper, loaded.allowlist); reg.authenticate(`Bearer ${loaded.reviewerCode}`); if (!marker.migratedFromV2 && (await exists(join(dataDir, oldNames.marker)) || await exists(join(dataDir, V2_LIVE_RETIREMENT_MARKER)))) throw unavailable(); const ledger = await LiveProposalBudgetLedgerV3.open({ dataDir: join(dir, ledgerDirectory), ledgerKey: loaded.ledgerKey });
    try {
      if (marker.migratedFromV2) { const receipt = await secret(join(dir, names.receipt)); const payload = verifyReceipt(receipt, loaded.ledgerKey); const retirement = JSON.parse((await secret(join(dataDir, V2_LIVE_RETIREMENT_MARKER))).toString("utf8")); const state = await ledger.snapshot(); if (!record(retirement) || !exact(retirement, ["version", "receiptHash"]) || retirement.version !== "3" || typeof retirement.receiptHash !== "string" || retirement.receiptHash !== liveLedgerV3ReceiptHash(receipt.toString("utf8")) || hash(await secret(join(dataDir, "live-proposal-budget.json"))) !== payload.sourceStateHash || state.reservations.length < payload.reservationCount || hash(canonical(state.reservations.slice(0, payload.reservationCount))) !== payload.importedReservationsHash) throw unavailable(); }
      return { ledger, registry: reg, async close() { await ledger.close(); } };
    } catch (error) { await ledger.close().catch(() => {}); throw error; }
  } catch { throw unavailable(); }
}

async function claimV2Source(dir: string) { const path = join(dir, "live-proposal-budget.lock"); const token = randomBytes(24).toString("hex"); try { const file = await open(path, "wx", 0o600); try { await file.writeFile(token); await file.sync(); } finally { await file.close(); } await syncDir(dir); } catch { throw unavailable(); } return async () => { const raw = await secret(path); if (raw.toString("utf8") !== token) throw unavailable(); await unlink(path); await syncDir(dir); }; }

/** One-way, local migration. It intentionally leaves the signed v2 files in place. */
export async function migrateLiveOperatorV2(dataDir = defaultDir()) {
  await privateDir(dataDir);
  if (await exists(join(dataDir, V2_LIVE_RETIREMENT_MARKER))) { const opened = await openLiveOperatorV3(dataDir); const count = (await opened.ledger.snapshot()).reservations.length; await opened.close(); return { status: "already-migrated" as const, dataDir, reservations: count }; }
  const release = await claimV2Source(dataDir);
  try {
    const source = await verifiedV2Source(dataDir); const dir = join(dataDir, v3);
    if (await exists(dir)) {
      const receipt = await verifyPublishedCandidate(dataDir, dir, source); await phase("before-retire"); await publishRetirement(dataDir, receipt); await phase("retired");
      const reopened = await openLiveOperatorV3(dataDir); const count = (await reopened.ledger.snapshot()).reservations.length; await reopened.close(); return { status: "resumed" as const, dataDir, reservations: count };
    }
    const stage = join(dataDir, `v3.migration-${randomUUID()}`); await mkdir(stage, { mode: 0o700 }); await privateDir(stage);
    const ledgerKey = randomBytes(32); await privateFile(join(stage, names.ledger), ledgerKey); await privateFile(join(stage, names.pepper), source.pepper); await privateFile(join(stage, names.allowlist), `${JSON.stringify({ version: "3", digests: source.allowlist })}\n`); await privateFile(join(stage, names.marker), `${JSON.stringify({ version: "3", migratedFromV2: true })}\n`); await privateFile(join(stage, names.code), `${source.reviewerCode}\n`);
    await phase("config");
    const ledger = await LiveProposalBudgetLedgerV3.migrateFromV2({ dataDir: join(stage, ledgerDirectory), ledgerKey, source: source.state }); await ledger.close(); await phase("ledger");
    const payload: ReceiptPayload = { version: "3", sourceStateHash: hash(source.rawState), importedReservationsHash: importedReservationsHash(source.state), reservationCount: source.state.reservations.length, reservedMicrousd: source.state.reservations.length * 50_000, migratedAt: new Date().toISOString() }; const receipt = `${canonical(receiptEnvelope(ledgerKey, payload))}\n`; await privateFile(join(stage, names.receipt), receipt); await phase("receipt");
    await verifyPublishedCandidate(dataDir, stage, source); await syncDir(stage); await phase("verified");
    await rename(stage, dir); await syncDir(dataDir); await phase("published");
    await phase("before-retire"); await publishRetirement(dataDir, Buffer.from(receipt)); await phase("retired");
    const reopened = await openLiveOperatorV3(dataDir); const count = (await reopened.ledger.snapshot()).reservations.length; await reopened.close(); return { status: "migrated" as const, dataDir, reservations: count };
  } finally { await release().catch(() => {}); }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv[2] === "init") { const initialized = await initializeLiveOperatorV3(); process.stdout.write(`Reviewer code written to private file: ${join(initialized.dataDir, v3, names.code)}\n`); await initialized.ledger.close(); }
  if (process.argv[2] === "migrate") { const result = await migrateLiveOperatorV2(); process.stdout.write(`Migration ${result.status}: ${join(result.dataDir, v3)} (${result.reservations} reservations)\n`); }
}
