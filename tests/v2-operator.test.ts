import assert from "node:assert/strict";
import { lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import { initializeLiveOperator, openLiveOperator } from "../src/v2-operator.js";

test("operator initialization writes private artifacts without emitting the reviewer code", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-operator-")); const dir = join(root, "operator");
  try {
    const initialized = await initializeLiveOperator(dir);
    assert.match(initialized.reviewerCode, /^[A-Za-z0-9_-]{24,128}$/);
    await initialized.ledger.close();
    assert.equal((await stat(dir)).mode & 0o077, 0);
    for (const name of ["ledger.key", "reviewer.pepper", "reviewer.allowlist.json", "operator-v2.json", "reviewer-code.txt"]) {
      assert.equal((await stat(join(dir, name))).mode & 0o077, 0);
    }
    assert.equal((await readFile(join(dir, "reviewer-code.txt"), "utf8")).trim(), initialized.reviewerCode);
    const opened = await openLiveOperator(dir); await opened.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("operator initialization never overwrites a partial profile and open rejects malformed config before claiming a ledger", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-operator-")); const partial = join(root, "partial"); const valid = join(root, "valid");
  try {
    await mkdir(partial, { mode: 0o700 }); await writeFile(join(partial, "leftover"), "x", { mode: 0o600 });
    await assert.rejects(initializeLiveOperator(partial), /unavailable/i); assert.equal(await readFile(join(partial, "leftover"), "utf8"), "x");
    const initialized = await initializeLiveOperator(valid); await initialized.ledger.close();
    await writeFile(join(valid, "operator-v2.json"), JSON.stringify({ version: "2", profile: "responses-v1", extra: true }), { mode: 0o600 });
    await assert.rejects(openLiveOperator(valid), /unavailable/i);
    assert.equal((await lstat(join(valid, "live-proposal-budget.lock")).catch(() => null)), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
