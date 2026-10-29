import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { renderBugPacket, renderPlaywrightExport } from "../src/v2-artifacts.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner } from "../src/v2-planner.js";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { V2Store } from "../src/v2-store.js";

const runFile = promisify(execFile);
const source = "Cart total must match unit prices. An invalid coupon must display an error. SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted subtotal S$75.00 or more. Contact fields are required before synthetic confirmation.";

async function port() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

async function approved(origin = "http://127.0.0.1:4173", releases: ["r2", "r3"] = ["r2", "r3"]) {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-artifact-"));
  const context = withSourceRequirement(createV2Context(origin, releases), source);
  const proposed = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  assert.equal(proposed.kind, "proposal");
  const store = new V2Store(root);
  const pending = await store.createProposal(proposed, context);
  const review = { decisions: proposed.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged" as const, adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposed.gaps, acceptedNumericRuleChanges: [] })) };
  const suite = await store.reviewProposal(pending.id, review);
  return { root, store, approval: await store.consumeApproval((await store.approveSuite(suite.id)).id) };
}

test("bug packet deterministically carries reviewed evidence and escapes untrusted literals", async () => {
  const fixture = await approved();
  try {
    const run = await fixture.store.createJob(fixture.approval);
    const altered = structuredClone(run);
    (altered.artifact.definition.requirement as { originalText: string }).originalText = "quoted \"line\"\nSnowman ☃ </script>";
    const first = renderBugPacket(altered);
    assert.equal(first, renderBugPacket(altered));
    assert.match(first, /approvalDigest/);
    assert.match(first, /"releases"/);
    assert.match(first, /"coverage"/);
    assert.match(first, /\\"line\\"\\nSnowman ☃ \\u003c\/script\\u003e/);
    assert.ok(!first.includes("expiresAt"));
    assert.ok(!first.includes("rootCause"));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("exported reviewed adapter test fails against r2 and passes against r3", { timeout: 60_000 }, async () => {
  const targetPort = await port();
  const server = createProofPathServer(targetPort, createPlanner({ PLANNER_MODE: "fixture" }));
  const fixture = await approved(server.origin);
  const exportDirectory = await mkdtemp(join(process.cwd(), "tests/.task4-export-"));
  const exportPath = join(exportDirectory, "reviewed-checkout.test.mjs");
  try {
    await new Promise<void>((resolve) => server.server.listen(targetPort, "127.0.0.1", resolve));
    await writeFile(exportPath, renderPlaywrightExport(fixture.approval));
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: server.origin, NODE_OPTIONS: "" };
    delete childEnv.NODE_TEST_CONTEXT;
    await assert.rejects(runFile(process.execPath, ["--test", exportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r2" } }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(`${error.stdout}\n${error.stderr}`, /7200|7700/);
      return true;
    });
    const passing = await runFile(process.execPath, ["--test", exportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r3" } });
    assert.match(passing.stdout, /pass 1/);
  } finally {
    server.server.closeAllConnections();
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
    await rm(exportDirectory, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});
