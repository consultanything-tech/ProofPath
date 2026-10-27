import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { manifestPath, saveRun } from "../src/evidence.js";
import type { ApprovalEnvelope } from "../src/plan-store.js";
import { fixturePlanFor } from "../src/planner.js";
import { RunnerExecutionError, runApprovedPlan } from "../src/runner.js";
import { getScenario } from "../src/scenarios.js";
import type { AssertionResult } from "../src/verdict.js";
import { aggregate } from "../src/verdict.js";

type Mode = "normal" | "same-origin-resource" | "same-origin-redirect" | "cross-origin-redirect" | "popup" | "download" | "websocket" | "service-worker" | "post-action-navigation" | "slow";
type Outcome = { ok: true; result: AssertionResult[]; runId: string; hits: Record<string, number>; origin: string } | { ok: false; error: unknown; runId: string; hits: Record<string, number>; origin: string };

const coreScript = `
const quantity = document.querySelector('#quantity');
const render = () => { const n = Math.max(0, Number.parseInt(quantity.value, 10) || 0); document.querySelector('#cart-quantity').textContent = String(n); document.querySelector('#cart-total').textContent = 'S$' + (n * 39).toFixed(2); };
document.querySelector('#add').addEventListener('click', () => { quantity.value = '1'; render(); });
quantity.addEventListener('input', render);
`;
const page = (mode: Mode) => `<!doctype html><link rel="stylesheet" href="/styles.css"><button id="add">Add Desk Lamp</button><label>Quantity <input id="quantity" value="1"></label><p id="cart-quantity">0</p><p id="cart-total">S$0.00</p><script src="/shop.js"></script>${mode === "same-origin-resource" ? '<script src="/escape.js"></script>' : ""}`;

function envelope(): ApprovalEnvelope {
  const scenario = getScenario("add-to-cart", "baseline");
  return { originalRequirement: "Add one lamp", scenario, contractVersion: "1", targetRegistryVersion: "2", planner: { mode: "fixture", provider: null, model: null }, plan: fixturePlanFor(scenario).plan! };
}

async function harness(mode: Mode) {
  const hits: Record<string, number> = {};
  const decoy = createServer((_req, res) => res.end("unexpected destination"));
  decoy.on("connection", () => { hits["/decoy-connections"] = (hits["/decoy-connections"] ?? 0) + 1; });
  await new Promise<void>((resolve) => decoy.listen(0, "127.0.0.1", resolve));
  const decoyAddress = decoy.address();
  if (!decoyAddress || typeof decoyAddress === "string") throw new Error("Decoy did not bind.");
  const crossOrigin = `http://127.0.0.1:${decoyAddress.port}`;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture").pathname;
    hits[path] = (hits[path] ?? 0) + 1;
    if (path === "/shop.html" && (mode === "same-origin-redirect" || mode === "cross-origin-redirect")) {
      res.writeHead(302, { Location: mode === "same-origin-redirect" ? "/escaped" : `${crossOrigin}/escaped` });
      return res.end();
    }
    if (path === "/shop.html") {
      res.setHeader("Content-Type", "text/html");
      if (mode === "slow") {
        const pending = setTimeout(() => res.end(page(mode)), 10_000);
        res.on("close", () => clearTimeout(pending));
        return;
      }
      return res.end(page(mode));
    }
    if (path === "/styles.css") { res.setHeader("Content-Type", "text/css"); return res.end("body { color: black; }"); }
    if (path === "/shop.js") {
      res.setHeader("Content-Type", "application/javascript");
      const trigger = mode === "popup" ? "document.querySelector('#add').addEventListener('click',()=>window.open('about:blank'));" : mode === "download" ? "document.querySelector('#add').addEventListener('click',()=>{const a=document.createElement('a');a.href='data:text/plain,synthetic';a.download='synthetic.txt';a.click()});" : mode === "websocket" ? `new WebSocket('${crossOrigin.replace('http:', 'ws:')}/socket');` : mode === "service-worker" ? "navigator.serviceWorker.register('/serviceworker.js').catch(()=>{});" : mode === "post-action-navigation" ? "document.querySelector('#add').addEventListener('click', () => { location.hash = 'escaped'; });" : "";
      return res.end(`${coreScript}${trigger}`);
    }
    res.end("escaped");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
  return { server, decoy, hits, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }

async function run(mode: Mode, limits?: { actionTimeoutMs: number; totalTimeoutMs: number }): Promise<Outcome> {
  const fixture = await harness(mode);
  const runId = randomUUID();
  const approved = envelope();
  const startedAt = new Date().toISOString();
  let outcome: Outcome;
  try {
    try {
      const result = await runApprovedPlan(approved, fixture.origin, runId, limits);
      outcome = { ok: true, result, runId, hits: fixture.hits, origin: fixture.origin };
    } catch (error) {
      assert.ok(error instanceof RunnerExecutionError);
      outcome = { ok: false, error, runId, hits: fixture.hits, origin: fixture.origin };
    }
    const error = outcome.ok ? undefined : outcome.error as RunnerExecutionError;
    const assertions = outcome.ok ? outcome.result : error!.assertions;
    const executionStatus = error?.status ?? "completed";
    const report = await saveRun({ planId: "synthetic-safety-test", approvalDigest: "sha256:synthetic", approvalEnvelope: approved, planner: approved.planner, scenario: approved.scenario, origin: fixture.origin, startedAt, endedAt: new Date().toISOString(), executionStatus, assertions, verdict: aggregate(assertions, executionStatus === "completed"), replay: approved.scenario.replay }, runId);
    const bytes = await readFile(manifestPath(runId));
    const sidecar = (await readFile(manifestPath(runId).replace("manifest.json", "manifest.sha256"), "utf8")).trim();
    assert.equal(sidecar, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(report.executionStatus, executionStatus);
    if (error) { assert.equal(report.verdict, "INCONCLUSIVE"); assert.equal(report.assertions.length, 2); }
    console.log(JSON.stringify({ mode, executionStatus, verdict: report.verdict, runId }));
    return outcome;
  } finally {
    await Promise.all([close(fixture.server), close(fixture.decoy)]);
  }
}

test("safety runner completes only the controlled fixture flow", async () => {
  const outcome = await run("normal");
  try {
    if (!outcome.ok) assert.fail("Normal controlled fixture was blocked or failed.");
    assert.deepEqual(outcome.result.map((item) => item.verdict), ["PASS", "PASS"]);
  } finally { /* Preserve ignored synthetic artifacts for evidence review. */ }
});

for (const mode of ["same-origin-resource", "same-origin-redirect", "cross-origin-redirect", "popup", "download", "websocket", "post-action-navigation"] as const) {
  test(`safety runner blocks ${mode} without reaching an escape target`, async () => {
    const outcome = await run(mode);
    try {
      if (outcome.ok) assert.fail("Unsafe fixture unexpectedly completed.");
      assert.ok(outcome.error instanceof RunnerExecutionError);
      assert.equal(outcome.error.status, "blocked");
      assert.equal(outcome.hits["/escape.js"] ?? 0, 0);
      assert.equal(outcome.hits["/escaped"] ?? 0, 0);
      assert.equal(outcome.hits["/popup"] ?? 0, 0);
      assert.equal(outcome.hits["/download"] ?? 0, 0);
      assert.equal(outcome.hits["/socket"] ?? 0, 0);
      assert.equal(outcome.hits["/decoy-connections"] ?? 0, 0);
    } finally { /* Preserve ignored synthetic artifacts for evidence review. */ }
  });
}

test("service worker registration is prevented before its script is fetched", async () => {
  const outcome = await run("service-worker");
  try {
    if (!outcome.ok) assert.fail("Service-worker fixture was blocked or failed.");
    assert.equal(outcome.hits["/serviceworker.js"] ?? 0, 0);
  } finally { /* Preserve ignored synthetic artifacts for evidence review. */ }
});

test("total execution deadline becomes timed-out", async () => {
  const outcome = await run("slow", { actionTimeoutMs: 10_000, totalTimeoutMs: 3_000 });
  try {
    if (outcome.ok) assert.fail("Slow fixture unexpectedly completed.");
    assert.ok(outcome.error instanceof RunnerExecutionError);
    assert.equal(outcome.error.status, "timed-out");
    assert.equal(outcome.hits["/shop.html"], 1);
  } finally { /* Preserve ignored synthetic artifacts for evidence review. */ }
});
