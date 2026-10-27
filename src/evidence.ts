import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AssertionResult } from "./verdict.js";
import { aggregate } from "./verdict.js";
import type { ApprovalEnvelope, PlannerProvenance } from "./plan-store.js";
import type { Scenario } from "./scenarios.js";

export type ActionResult = {
  id: string;
  status: "completed" | "blocked" | "timed-out" | "failed" | "not-run";
  startedAt: string | null;
  endedAt: string | null;
  url: string | null;
  error?: string;
};

export type RunManifest = {
  runId: string;
  planId: string;
  approvalDigest: string;
  planner: PlannerProvenance;
  scenario: Scenario;
  approvalEnvelope: ApprovalEnvelope;
  origin: string;
  startedAt: string;
  endedAt: string;
  executionStatus: ExecutionStatus;
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
  executionError?: string;
  actionResults: ActionResult[];
  assertions: AssertionResult[];
  replay: string[];
};

export type ExecutionStatus = "completed" | "blocked" | "timed-out" | "failed";

const runsRoot = resolve(process.cwd(), "runs");

export async function saveRun(manifest: Omit<RunManifest, "runId">, runId = randomUUID()) {
  const directory = join(runsRoot, runId);
  await mkdir(directory, { recursive: true });
  const assertions = await Promise.all(manifest.assertions.map(async (assertion) => {
    try {
      const bytes = await readFile(evidencePath(runId, assertion.screenshot));
      const screenshotSha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      return { ...assertion, screenshotSha256 };
    } catch {
      return assertion.verdict === "PASS"
        ? { ...assertion, observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png" }
        : { ...assertion, screenshot: "not-captured.png" };
    }
  }));
  const complete = { runId, ...manifest, verdict: aggregate(assertions, manifest.executionStatus === "completed"), assertions };
  const contents = JSON.stringify(complete, null, 2);
  await writeFile(join(directory, "manifest.json"), contents);
  await writeFile(join(directory, "manifest.sha256"), createHash("sha256").update(contents).digest("hex") + "\n");
  return complete;
}

export function manifestPath(runId: string) {
  if (!/^[a-f0-9-]{36}$/.test(runId)) throw new Error("Invalid run ID.");
  return join(runsRoot, runId, "manifest.json");
}

export function evidencePath(runId: string, filename: string) {
  if (!/^[a-f0-9-]{36}$/.test(runId) || !/^[a-z0-9-]+\.png$/.test(filename)) throw new Error("Invalid evidence path.");
  return join(runsRoot, runId, filename);
}
