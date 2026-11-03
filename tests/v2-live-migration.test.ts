import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LIVE_LEDGER_V3_POLICY, V2_LIVE_RETIREMENT_MARKER } from "../src/v2-live-ledger-v3.js";
import { initializeLiveOperator, openLiveOperator } from "../src/v2-operator.js";
import { migrateLiveOperatorV2, openLiveOperatorV3, setLiveMigrationPhaseHookForTest, type LiveMigrationPhase } from "../src/v2-operator-v3.js";

const digest = (value: string) => "sha256:" + createHash("sha256").update(value).digest("hex");

test("migration preserves old Meta reservations, retires v2, and is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-migration-")); const dir = join(root, "operator");
  try {
    const initialized = await initializeLiveOperator(dir); await initialized.ledger.close(); const old = await openLiveOperator(dir); const reviewer = old.registry.authenticate(`Bearer ${initialized.reviewerCode}`);
    for (let index = 0; index < 3; index += 1) {
      const id = await old.ledger.reserve(reviewer, digest(`migrate-${index}`), 100); await old.ledger.beforeAttempt(id, 1); await old.ledger.usage(id, { inputTokens: 100, outputTokens: 2, totalTokens: 102 }); await old.ledger.finish(id, "proposal");
    }
    await old.ledger.close();
    const migrated = await migrateLiveOperatorV2(dir); assert.deepEqual(migrated.status, "migrated"); assert.equal(migrated.reservations, 3);
    const next = await openLiveOperatorV3(dir); const state = await next.ledger.snapshot(); const migratedReviewer = next.registry.authenticate(`Bearer ${initialized.reviewerCode}`); await next.ledger.reserve(migratedReviewer, digest("after-migration"), 1, "baseten"); await next.close();
    assert.deepEqual(state.policy, LIVE_LEDGER_V3_POLICY);
    assert.equal(state.reservations[0]!.provider, "meta"); assert.equal(state.reservations[0]!.reservedMicrousd, 50_000); assert.equal(state.reservations[0]!.attempts[0]!.usage?.totalTokens, 102);
    const afterNewAdmission = await openLiveOperatorV3(dir); assert.equal((await afterNewAdmission.ledger.snapshot()).reservations.length, 4); await afterNewAdmission.close();
    await assert.rejects(openLiveOperator(dir), /unavailable/i); assert.ok(await lstat(join(dir, V2_LIVE_RETIREMENT_MARKER)));
    assert.equal((await migrateLiveOperatorV2(dir)).status, "already-migrated");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("migration refuses a running or active v2 source without mutating it", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-migration-")); const dir = join(root, "operator");
  try {
    const old = await initializeLiveOperator(dir); await assert.rejects(migrateLiveOperatorV2(dir), /unavailable/i);
    const operator = await openLiveOperator(dir).catch(() => null); assert.equal(operator, null);
    await old.ledger.close();
    const reopened = await openLiveOperator(dir); const reviewer = { key: createHash("sha256").update("active-reviewer").digest("hex") } as any; const id = await reopened.ledger.reserve(reviewer, digest("active"), 1); assert.ok(id); await reopened.ledger.close();
    await assert.rejects(migrateLiveOperatorV2(dir), /unavailable/i); assert.equal(await readFile(join(dir, "reviewer-code.txt"), "utf8"), `${old.reviewerCode}\n`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const fault of ["config", "ledger", "receipt", "verified", "published", "before-retire", "retired"] as const) test(`migration ${fault} fault preserves an old usable profile or resumes verified publication`, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-migration-fault-")); const dir = join(root, "operator");
  try {
    const old = await initializeLiveOperator(dir); const reviewer = { key: createHash("sha256").update(`fault-${fault}`).digest("hex") } as any;
    const id = await old.ledger.reserve(reviewer, digest(`fault-${fault}`), 10); await old.ledger.beforeAttempt(id, 1); await old.ledger.usage(id, { inputTokens: 10, outputTokens: 1, totalTokens: 11 }); await old.ledger.finish(id, "proposal"); await old.ledger.close();
    setLiveMigrationPhaseHookForTest((phase: LiveMigrationPhase) => { if (phase === fault) throw new Error("test migration fault"); });
    await assert.rejects(migrateLiveOperatorV2(dir), /test migration fault/);
    setLiveMigrationPhaseHookForTest(undefined);
    if (["config", "ledger", "receipt", "verified"].includes(fault)) { const legacy = await openLiveOperator(dir); await legacy.close(); }
    else await assert.rejects(openLiveOperator(dir), /unavailable/i);
    const resumed = await migrateLiveOperatorV2(dir); assert.equal(resumed.status, ["config", "ledger", "receipt", "verified"].includes(fault) ? "migrated" : fault === "retired" ? "already-migrated" : "resumed");
    const opened = await openLiveOperatorV3(dir); assert.equal((await opened.ledger.snapshot()).reservations.length, 1); await opened.close();
  } finally { setLiveMigrationPhaseHookForTest(undefined); await rm(root, { recursive: true, force: true }); }
});
