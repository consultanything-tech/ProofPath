import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannerResponse } from "./contracts.js";
import { saveRun, evidencePath, manifestPath, type ActionResult, type ExecutionStatus } from "./evidence.js";
import { PlanStore } from "./plan-store.js";
import { createPlanner, plannerLabel, type Planner } from "./planner.js";
import { RunnerExecutionError, runApprovedPlan } from "./runner.js";
import { getScenario } from "./scenarios.js";
import { aggregate, type AssertionResult } from "./verdict.js";

const host = "127.0.0.1";
const publicRoot = resolve(process.cwd(), "public");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

export class RunGate {
  private held = false;
  acquire() { if (this.held) return false; this.held = true; return true; }
  release() { this.held = false; }
}

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 10_000) throw new Error("Request body is too large.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function exactJson(contentType: string | undefined) { return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"; }
function mutation(req: IncomingMessage, origin: string) { if (req.headers.origin !== origin || !exactJson(req.headers["content-type"])) throw new Error("Local same-origin JSON request required."); }
function emptyBody(value: unknown) { if (!isRecord(value) || Object.keys(value).length !== 0) throw new Error("An empty JSON body is required."); }
function sanitizedFailure(status: ExecutionStatus) { return status === "blocked" ? "Runner blocked a browser request." : status === "timed-out" ? "Runner timed out." : "Runner failed."; }

async function serveFile(res: ServerResponse, path: string) {
  const allowed = path === "/" ? "/index.html" : path;
  if (!/^\/[a-z0-9._/-]+$/i.test(allowed) || allowed.includes("..")) return send(res, 404, { error: "Not found." });
  const file = resolve(publicRoot, `.${allowed}`);
  if (!file.startsWith(publicRoot)) return send(res, 404, { error: "Not found." });
  try { send(res, 200, await readFile(file), mime[extname(file)] ?? "application/octet-stream"); } catch { send(res, 404, { error: "Not found." }); }
}

export function createProofPathServer(port: number, planner: Planner = createPlanner(process.env)) {
  const origin = `http://${host}:${port}`;
  const store = new PlanStore();
  const gate = new RunGate();
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== `${host}:${port}`) throw new Error("Exact local Host header required.");
      const url = new URL(req.url ?? "/", origin);
      if (url.origin !== origin) throw new Error("Local request URL required.");
      if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { planner: planner.provenance, plannerLabel: plannerLabel(planner.provenance) });
      if (req.method === "POST" && url.pathname === "/api/plans") {
        mutation(req, origin);
        const input = await readJson(req);
        if (!isRecord(input) || typeof input.requirement !== "string" || input.requirement.trim().length === 0 || input.requirement.length > 2000) throw new Error("A requirement of up to 2,000 characters is required.");
        const scenario = getScenario(input.scenarioId, input.revision);
        const response = validatePlannerResponse(await planner.propose(input.requirement.trim(), scenario));
        const label = plannerLabel(planner.provenance);
        if (response.kind === "clarification") return send(res, 200, { kind: "clarification", question: response.question, plannerLabel: label });
        return send(res, 201, { kind: "plan", ...store.create(input.requirement.trim(), scenario, response.plan!, planner.provenance), plannerLabel: label });
      }
      const approve = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/approve$/);
      if (req.method === "POST" && approve) {
        mutation(req, origin);
        emptyBody(await readJson(req));
        return send(res, 200, store.approve(approve[1]));
      }
      const run = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/run$/);
      if (req.method === "POST" && run) {
        mutation(req, origin);
        emptyBody(await readJson(req));
        if (!gate.acquire()) throw new Error("Another approved run is already in progress.");
        try {
          const plan = store.consume(run[1]);
          const startedAt = new Date().toISOString();
          const temporaryId = randomUUID();
          let executionStatus: ExecutionStatus = "completed";
          let executionError: string | undefined;
          let assertions: AssertionResult[];
          let actionResults: ActionResult[];
          try {
            const result = await runApprovedPlan(plan.envelope, origin, temporaryId);
            assertions = result.assertions;
            actionResults = result.actionResults;
          }
          catch (error) {
            executionStatus = error instanceof RunnerExecutionError ? error.status : "failed";
            executionError = sanitizedFailure(executionStatus);
            assertions = error instanceof RunnerExecutionError ? error.assertions : plan.envelope.plan.assertions.map((item) => ({ id: item.id, expected: item.expected, observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", timestamp: new Date().toISOString(), url: origin }));
            actionResults = error instanceof RunnerExecutionError ? error.actionResults : plan.envelope.plan.actions.map((item) => ({ id: item.id, status: "not-run" as const, startedAt: null, endedAt: null, url: null }));
          }
          const report = await saveRun({ planId: plan.id, approvalDigest: plan.digest, approvalEnvelope: plan.envelope, planner: plan.envelope.planner, scenario: plan.envelope.scenario, origin, startedAt, endedAt: new Date().toISOString(), executionStatus, verdict: aggregate(assertions, executionStatus === "completed"), actionResults, assertions, replay: plan.envelope.scenario.replay, ...(executionError ? { executionError } : {}) }, temporaryId);
          return send(res, 201, report);
        } finally { gate.release(); }
      }
      const manifest = url.pathname.match(/^\/runs\/([a-f0-9-]{36})\/manifest\.json$/);
      if (req.method === "GET" && manifest) {
        const contents = await readFile(manifestPath(manifest[1]), "utf8");
        const saved = JSON.parse(contents);
        if (saved.runId !== manifest[1]) return send(res, 404, { error: "Not found." });
        return send(res, 200, contents, "application/json; charset=utf-8");
      }
      const evidence = url.pathname.match(/^\/evidence\/([a-f0-9-]{36})\/([a-z0-9-]+\.png)$/);
      if (req.method === "GET" && evidence) {
        const saved = JSON.parse(await readFile(manifestPath(evidence[1]), "utf8"));
        if (saved.runId !== evidence[1] || !saved.assertions.some((item: { screenshot?: string }) => item.screenshot === evidence[2])) return send(res, 404, { error: "Not found." });
        return send(res, 200, await readFile(evidencePath(evidence[1], evidence[2])), "image/png");
      }
      if (req.method === "GET") return serveFile(res, url.pathname);
      return send(res, 405, { error: "Method not allowed." });
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : "Request failed." }); }
  });
  return { server, origin, gate };
}

const port = Number(process.env.PORT ?? 3000);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, origin } = createProofPathServer(port);
  server.listen(port, host, () => console.log(`ProofPath ${process.env.PLANNER_MODE} mode at ${origin}`));
}
