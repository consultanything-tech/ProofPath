import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LiveProposalBudgetLedgerV3 } from "../src/v2-live-ledger-v3.js";
import { initializeLiveOperator, openLiveOperator } from "../src/v2-operator.js";
import { migrateLiveOperatorV2, openLiveOperatorV3 } from "../src/v2-operator-v3.js";
import { ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";

const digest = "sha256:" + "a".repeat(64);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-boundary-")); const key = randomBytes(32); const pepper = randomBytes(32);
  const code = randomBytes(24).toString("base64url");
  const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, code)]);
  return { root, key, principal: registry.authenticate(`Bearer ${code}`), ledger: await LiveProposalBudgetLedgerV3.initialize({ dataDir: root, ledgerKey: key }) };
}
async function clean(f: Awaited<ReturnType<typeof fixture>>) { await chmod(f.root, 0o700).catch(() => {}); await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }

test("migration keeps the real reviewer's consumed slot and verifies imported evidence after new admissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-import-")); const dir = join(root, "operator");
  try {
    const initialized = await initializeLiveOperator(dir); await initialized.ledger.close();
    const source = await openLiveOperator(dir); const principal = source.registry.authenticate(`Bearer ${initialized.reviewerCode}`);
    const oldId = await source.ledger.reserve(principal, digest, 100);
    await source.ledger.beforeAttempt(oldId, 1); await source.ledger.usage(oldId, { inputTokens: 100, outputTokens: 2, totalTokens: 102 }); await source.ledger.finish(oldId, "proposal");
    const oldRecord = (await source.ledger.snapshot()).reservations[0]!; await source.close();
    await migrateLiveOperatorV2(dir);
    const imported = await openLiveOperatorV3(dir);
    try {
      const saved = (await imported.ledger.snapshot()).reservations[0]!;
      assert.equal(saved.id, oldRecord.id); assert.equal(saved.reviewerKey, oldRecord.reviewerKey);
      assert.deepEqual(saved.attempts, oldRecord.attempts); assert.equal(saved.createdAt, oldRecord.createdAt); assert.equal(saved.completedAt, oldRecord.completedAt);
      const same = imported.registry.authenticate(`Bearer ${initialized.reviewerCode}`);
      for (let index = 0; index < 2; index += 1) {
        const id = await imported.ledger.reserve(same, digest, 100, "baseten");
        await imported.ledger.beforeAttempt(id, 1); await imported.ledger.usage(id, { inputTokens: 100, outputTokens: 2, totalTokens: 102 }); await imported.ledger.finish(id, "proposal");
      }
      await assert.rejects(imported.ledger.reserve(same, digest, 100, "meta"), /exhausted/i);
    } finally { await imported.close(); }
    const after = await openLiveOperatorV3(dir);
    try { assert.equal((await after.ledger.snapshot()).reservations.length, 3); } finally { await after.close(); }
    const path = join(dir, "live-proposal-budget.json"); const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from("\n")]));
    await assert.rejects(openLiveOperatorV3(dir), /unavailable/i);
    await assert.rejects(openLiveOperator(dir), /unavailable/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a global failure blocks attempts already reserved by the other provider", async () => {
  const f = await fixture();
  try {
    const first = await f.ledger.reserve(f.principal, digest, 100, "meta");
    const second = await f.ledger.reserve(f.principal, digest, 100, "baseten");
    await f.ledger.beforeAttempt(first, 1); await f.ledger.block();
    await assert.rejects(f.ledger.beforeAttempt(second, 1), /unavailable/i);
    assert.equal((await f.ledger.snapshot()).reservations[1]!.attempts.length, 0);
  } finally { await clean(f); }
});

test("signed impossible active state and terminal times cannot reopen", async () => {
  for (const malformed of ["dispatch-without-attempt", "reserved-with-attempt", "terminal-without-time"] as const) {
    const f = await fixture();
    try {
      const id = await f.ledger.reserve(f.principal, digest, 100, "baseten");
      if (malformed !== "dispatch-without-attempt") await f.ledger.beforeAttempt(id, 1);
      if (malformed === "terminal-without-time") {
        await f.ledger.usage(id, { inputTokens: 100, outputTokens: 2, totalTokens: 102 }); await f.ledger.finish(id, "proposal");
      }
      await f.ledger.close();
      const path = join(f.root, "live-ledger-v3.json"); const envelope = JSON.parse(await readFile(path, "utf8"));
      const row = envelope.payload.reservations[0];
      if (malformed === "dispatch-without-attempt") row.status = "dispatching";
      if (malformed === "reserved-with-attempt") row.status = "reserved";
      if (malformed === "terminal-without-time") row.completedAt = null;
      envelope.mac = createHmac("sha256", f.key).update(JSON.stringify(envelope.payload)).digest("hex");
      await writeFile(path, JSON.stringify(envelope));
      await assert.rejects(LiveProposalBudgetLedgerV3.open({ dataDir: f.root, ledgerKey: f.key }), /unavailable/i);
    } finally { await clean(f); }
  }
});

test("runtime integrity loss and real write failures retain owner locks across close", async () => {
  for (const fault of ["missing-state", "reserve-write", "usage-write"] as const) {
    const f = await fixture();
    try {
      let id: string | undefined;
      if (fault === "usage-write") { id = await f.ledger.reserve(f.principal, digest, 100, "baseten"); await f.ledger.beforeAttempt(id, 1); }
      if (fault === "missing-state") {
        await unlink(join(f.root, "live-ledger-v3.json")); await assert.rejects(f.ledger.snapshot(), /unavailable/i);
      } else {
        await chmod(f.root, 0o500);
        await assert.rejects(fault === "reserve-write" ? f.ledger.reserve(f.principal, digest, 100) : f.ledger.usage(id!, { inputTokens: 100, outputTokens: 2, totalTokens: 102 }), /unavailable/i);
        await chmod(f.root, 0o700);
      }
      await assert.rejects(f.ledger.close(), /unavailable/i);
      assert.ok((await lstat(join(f.root, "live-ledger-v3.lock"))).isFile());
      await assert.rejects(LiveProposalBudgetLedgerV3.open({ dataDir: f.root, ledgerKey: f.key }), /unavailable/i);
    } finally { await clean(f); }
  }
});
