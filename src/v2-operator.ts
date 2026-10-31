import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LiveProposalBudgetLedger } from "./v2-live-proposal.js";
import { ReviewerCodeRegistry } from "./v2-proposal-budget.js";
import { V2_LIVE_RETIREMENT_MARKER } from "./v2-live-ledger-v3.js";

const unavailable = () => new Error("Live operator configuration is unavailable.");
const names = { ledger: "ledger.key", pepper: "reviewer.pepper", allowlist: "reviewer.allowlist.json", marker: "operator-v2.json", code: "reviewer-code.txt" } as const;
const code = () => randomBytes(24).toString("base64url");
async function existingPrivateDir(dir: string) { const handle = await open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try { const stat = await handle.stat(); if (!stat.isDirectory() || stat.mode & 0o077) throw unavailable(); } finally { await handle.close(); } }
async function privateFile(path: string, value: string | Buffer) { const file = await open(path, "wx", 0o600); try { await file.writeFile(value); await file.sync(); } finally { await file.close(); } }
async function secret(path: string) { const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); try { const stat = await file.stat(); if (!stat.isFile() || stat.mode & 0o077 || stat.size < 1 || stat.size > 10_000) throw unavailable(); return await file.readFile(); } finally { await file.close(); } }

export type LiveOperator = { readonly ledger: LiveProposalBudgetLedger; readonly registry: ReviewerCodeRegistry; close(): Promise<void> };
/** Explicit one-time local setup. The returned code is intentionally not persisted in a report or URL. */
export async function initializeLiveOperator(dataDir = resolve(process.env.V2_OPERATOR_DIR ?? "runs/v2-live/operator")) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 }); await existingPrivateDir(dataDir);
  if ((await readdir(dataDir)).length !== 0 || Boolean(await lstat(join(dataDir, V2_LIVE_RETIREMENT_MARKER)).catch(() => null)) || Boolean(await lstat(join(dataDir, "v3")).catch(() => null))) throw unavailable();
  const ledgerKey = randomBytes(32); const pepper = randomBytes(32); const reviewerCode = code();
  await privateFile(join(dataDir, names.ledger), ledgerKey);
  await privateFile(join(dataDir, names.pepper), pepper);
  await privateFile(join(dataDir, names.allowlist), `${JSON.stringify({ version: "2", digests: [ReviewerCodeRegistry.digest(pepper, reviewerCode)] })}\n`);
  await privateFile(join(dataDir, names.marker), `${JSON.stringify({ version: "2", profile: "responses-v1" })}\n`);
  await privateFile(join(dataDir, names.code), `${reviewerCode}\n`);
  const ledger = await LiveProposalBudgetLedger.initialize({ dataDir, ledgerKey });
  return { dataDir, reviewerCode, ledger };
}

/** Opens an already initialized local profile; it never creates or repairs one. */
export async function openLiveOperator(dataDir = resolve(process.env.V2_OPERATOR_DIR ?? "runs/v2-live/operator")): Promise<LiveOperator> {
  try {
    await existingPrivateDir(dataDir);
    if (Boolean(await lstat(join(dataDir, V2_LIVE_RETIREMENT_MARKER)).catch(() => null)) || Boolean(await lstat(join(dataDir, "v3")).catch(() => null))) throw unavailable();
    const marker = JSON.parse((await secret(join(dataDir, names.marker))).toString("utf8"));
    const allowlist = JSON.parse((await secret(join(dataDir, names.allowlist))).toString("utf8"));
    if (!marker || typeof marker !== "object" || Object.keys(marker).length !== 2 || marker.version !== "2" || marker.profile !== "responses-v1" || !allowlist || typeof allowlist !== "object" || Object.keys(allowlist).length !== 2 || allowlist.version !== "2" || !Array.isArray(allowlist.digests)) throw unavailable();
    const ledgerKey = await secret(join(dataDir, names.ledger)); const pepper = await secret(join(dataDir, names.pepper));
    const reviewerCode = (await secret(join(dataDir, names.code))).toString("utf8").trim();
    if (ledgerKey.length !== 32 || pepper.length !== 32 || !/^[A-Za-z0-9_-]{24,128}$/.test(reviewerCode)) throw unavailable();
    const registry = new ReviewerCodeRegistry(pepper, allowlist.digests);
    const ledger = await LiveProposalBudgetLedger.open({ dataDir, ledgerKey });
    return { ledger, registry, async close() { await ledger.close(); } };
  } catch { throw unavailable(); }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname && process.argv[2] === "init") {
  const initialized = await initializeLiveOperator();
  process.stdout.write(`Reviewer code written to private file: ${join(initialized.dataDir, names.code)}\n`);
  await initialized.ledger.close();
}
