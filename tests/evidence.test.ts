import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { evidencePath, saveRun } from "../src/evidence.js";
import { getScenario } from "../src/scenarios.js";
import { fixturePlanFor } from "../src/planner.js";

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
        targetRegistryVersion: "1",
        planner: { mode: "fixture", provider: null, model: null },
        plan: fixturePlanFor(getScenario("add-to-cart", "baseline")).plan!
      },
      origin: "http://127.0.0.1:3000",
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      verdict: "PASS",
      assertions: [{ id: "assertion", expected: "1", observed: "1", verdict: "PASS", screenshot: "assertion.png" }],
      replay: []
    }, runId);
    assert.equal(report.assertions[0].screenshotSha256, `sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  } finally {
    await rm(dirname(screenshot), { recursive: true, force: true });
  }
});
