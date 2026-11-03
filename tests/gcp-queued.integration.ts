import assert from "node:assert/strict";
import test from "node:test";
import { createServer, type Server } from "node:http";
import { createProofPathServer } from "../src/server.js";
import { createPlanner } from "../src/planner.js";
import { createFixtureServer } from "../src/fixture-server.js";
import { V2Store } from "../src/v2-store.js";
import { GcpJobs } from "../src/gcp/jobs.js";
import { GcpActivityGate } from "../src/gcp/activity.js";
import { snapshotToRecords } from "../src/gcp/state.js";
import { smokeQueuedWorkflows } from "../src/gcp/smoke.js";
import type { GcpConfig } from "../src/gcp/config.js";
import { MemoryRepository, MemoryEvidence } from "./helpers/gcp.js";
const listen = (s: Server, port = 0) => new Promise<void>((resolve) => s.listen(port, "127.0.0.1", resolve));
const close = (s: Server) => { s.closeAllConnections(); return new Promise<void>((resolve) => s.close(() => resolve())); };
async function port() { const s = createServer(); await listen(s); const a = s.address(); assert.ok(a && typeof a !== "string"); await close(s); return a.port; }

test("both hosted APIs queue browser jobs and preserve reports across service replacement", { timeout: 120_000 }, async () => {
  const fixturePort = await port(); const webPort = await port(); const origin = `http://127.0.0.1:${webPort}`;
  const config = { namespace: "fixture-tests", fixturePort } as GcpConfig;
  const repo = new MemoryRepository(); snapshotToRecords(repo.records, V2Store.emptySnapshot()); const objects = new MemoryEvidence();
  const failures: unknown[] = []; const executions: Promise<void>[] = [];
  const jobs = new GcpJobs(repo, objects, config, { async enqueue(id) { executions.push(jobs.execute(id).catch((e) => { failures.push(e); })); } });
  const fixture = createFixtureServer(fixturePort, true); await listen(fixture.server, fixturePort);
  const app = () => createProofPathServer(webPort, createPlanner({ PLANNER_MODE: "fixture" }), { runtime: { hosted: true, bothJourneys: true, origin, fixtureOrigin: fixture.origin, v2Store: jobs.v2, plans: jobs.plans, planningGate: new GcpActivityGate(repo), v2Runtime: { start: (id) => jobs.startV2(id), read: (id) => jobs.readV2(id), stopAdmissions() {}, async drain() { return true; } }, v1Jobs: { start: (id, owner) => jobs.startV1(id, owner), read: (id, owner) => jobs.readV1(id, owner), evidence: (id, name, owner) => jobs.readV1Evidence(id, name, owner) } } });
  let instance = app();
  try {
    await listen(instance.server, webPort);
    const transport: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), Connection: "close" } });
    const result = await smokeQueuedWorkflows(origin, transport);
    await Promise.all(executions); assert.deepEqual(failures, []);
    await close(instance.server); instance = app(); await listen(instance.server, webPort);
    assert.equal((await (await fetch(`${origin}/runs/${result.v1[0]}/manifest.json`)).json() as { verdict: string }).verdict, "FAIL");
    assert.equal((await (await fetch(`${origin}/api/v2/runs/${result.v2[1]}`)).json() as { candidateVerdict: string }).candidateVerdict, "PASS");
    assert.equal((repo.records.get("v2meta") as { executionCount: number }).executionCount, 2);
    for (const value of repo.records.values()) assert.ok(Buffer.byteLength(JSON.stringify(value)) < 800_000);
  } finally { await Promise.all(executions); await close(instance.server); await close(fixture.server); }
});
