import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evidencePath, manifestPath, saveRun } from "../src/evidence.js";
import { getScenario } from "../src/scenarios.js";
import { fixturePlanFor } from "../src/planner.js";

function actionResultsFor(scenario: ReturnType<typeof getScenario>) {
  return fixturePlanFor(scenario).plan!.actions.map((action) => ({ id: action.id, status: "completed" as const, startedAt: new Date(0).toISOString(), endedAt: new Date(0).toISOString(), url: "http://127.0.0.1:3000/shop.html?revision=baseline" }));
}

test("manifest records the digest of each captured screenshot", async () => {
  const runId = "00000000-0000-4000-8000-000000000001";
  const screenshot = evidencePath(runId, "assertion.png");
  await rm(dirname(screenshot), { recursive: true, force: true });
  await mkdir(dirname(screenshot), { recursive: true });
  const bytes = Buffer.from("synthetic screenshot fixture");
  await writeFile(screenshot, bytes);
  try {
    const report = await saveRun({
      planId: "plan-test",
      approvalDigest: "sha256:test",
      planner: { mode: "fixture", provider: null, model: null },
      scenario: getScenario("add-to-cart", "baseline"),
      approvalEnvelope: {
        originalRequirement: "Add one lamp",
        scenario: getScenario("add-to-cart", "baseline"),
        contractVersion: "1",
        targetRegistryVersion: "2",
        planner: { mode: "fixture", provider: null, model: null },
        plan: fixturePlanFor(getScenario("add-to-cart", "baseline")).plan!
      },
      origin: "http://127.0.0.1:3000",
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      executionStatus: "completed",
      verdict: "PASS",
      actionResults: actionResultsFor(getScenario("add-to-cart", "baseline")),
      assertions: [{ id: "assertion", expected: "1", observed: "1", verdict: "PASS", screenshot: "assertion.png" }],
      replay: []
    }, runId);
    assert.equal(report.assertions[0].screenshotSha256, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
    assert.deepEqual(report.actionResults.map((result) => result.status), ["completed", "completed", "completed"]);
    const manifest = await readFile(manifestPath(runId));
    const sidecar = (await readFile(manifestPath(runId).replace("manifest.json", "manifest.sha256"), "utf8")).trim();
    assert.equal(sidecar, createHash("sha256").update(manifest).digest("hex"));
    assert.deepEqual(JSON.parse(manifest.toString("utf8")).actionResults, report.actionResults);
  } finally {
    await rm(dirname(screenshot), { recursive: true, force: true });
  }
});

test("missing screenshot evidence downgrades a PASS assertion to inconclusive", async () => {
  const runId = "00000000-0000-4000-8000-000000000002";
  const scenario = getScenario("add-to-cart", "baseline");
  const directory = dirname(evidencePath(runId, "missing.png"));
  await rm(directory, { recursive: true, force: true });
  try {
    const report = await saveRun({
      planId: "plan-missing-evidence",
      approvalDigest: "sha256:test",
      planner: { mode: "fixture", provider: null, model: null },
      scenario,
      approvalEnvelope: { originalRequirement: "Add one lamp", scenario, contractVersion: "1", targetRegistryVersion: "2", planner: { mode: "fixture", provider: null, model: null }, plan: fixturePlanFor(scenario).plan! },
      origin: "http://127.0.0.1:3000",
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      executionStatus: "completed",
      verdict: "PASS",
      actionResults: actionResultsFor(scenario),
      assertions: [{ id: "missing", expected: "1", observed: "1", verdict: "PASS", screenshot: "missing.png" }],
      replay: []
    }, runId);
    assert.deepEqual(report.assertions[0], { id: "missing", expected: "1", observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png" });
    assert.equal(report.verdict, "INCONCLUSIVE");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
