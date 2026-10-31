import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LiveProposalBudgetLedgerV3 } from "../src/v2-live-ledger-v3.js";
import { ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";

const digest = (value: string) => "sha256:" + createHash("sha256").update(value).digest("hex");

async function setup(codes = 1) {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v3-ledger-")); const key = randomBytes(32); const pepper = randomBytes(32);
  const values = Array.from({ length: codes }, () => randomBytes(24).toString("base64url"));
  const registry = new ReviewerCodeRegistry(pepper, values.map((value) => ReviewerCodeRegistry.digest(pepper, value)));
  const ledger = await LiveProposalBudgetLedgerV3.initialize({ dataDir: root, ledgerKey: key });
  return { root, key, values, registry, ledger };
}

test("v3 serializes Meta and Baseten admissions into one no-refund fifty-reservation budget", async () => {
  const f = await setup(17);
  try {
    const principal = (index: number) => f.registry.authenticate(`Bearer ${f.values[index]!}`);
    const same = principal(0);
    const first = await Promise.allSettled([
      f.ledger.reserve(same, digest("meta-a"), 6_073), f.ledger.reserve(same, digest("baseten-a"), 26_073, "baseten"),
      f.ledger.reserve(same, digest("meta-b"), 1), f.ledger.reserve(same, digest("baseten-b"), 1, "baseten")
    ]);
    assert.equal(first.filter((entry) => entry.status === "fulfilled").length, 3);
    for (let index = 3; index < 50; index += 1) await f.ledger.reserve(principal(Math.floor(index / 3)), digest(String(index)), index % 2 ? 6_073 : 26_073, index % 2 ? "meta" : "baseten");
    const state = await f.ledger.snapshot();
    assert.equal(state.reservations.length, 50); assert.equal(state.reservations.reduce((total, item) => total + item.reservedMicrousd, 0), 2_500_000);
    assert.equal(state.reservations.filter((item) => item.provider === "baseten").every((item) => item.maxAttempts === 1), true);
    await assert.rejects(f.ledger.reserve(principal(16), digest("too-many"), 1), /exhausted/i);
  } finally { await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }
});

test("v3 journals attempts and latches all providers after unsafe usage", async () => {
  const f = await setup();
  try {
    const principal = f.registry.authenticate(`Bearer ${f.values[0]!}`); const id = await f.ledger.reserve(principal, digest("one"), 26_073, "baseten");
    await f.ledger.beforeAttempt(id, 1); await assert.rejects(f.ledger.usage(id, { inputTokens: 26_074, outputTokens: 1, totalTokens: 26_075 }), /unavailable/i);
    assert.equal((await f.ledger.snapshot()).liveAdmissionBlocked?.reason, "usage-breach");
    await assert.rejects(f.ledger.reserve(principal, digest("two"), 1), /unavailable/i);
  } finally { await f.ledger.close().catch(() => {}); await rm(f.root, { recursive: true, force: true }); }
});
