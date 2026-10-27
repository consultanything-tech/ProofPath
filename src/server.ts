import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { validatePlannerResponse } from "./contracts.js";
import { saveRun, evidencePath, manifestPath } from "./evidence.js";
import { PlanStore } from "./plan-store.js";
import { fixturePlanFor } from "./planner.js";
import { RunnerExecutionError, runApprovedPlan } from "./runner.js";
import { getScenario } from "./scenarios.js";
import { aggregate } from "./verdict.js";

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const origin = `http://${host}:${port}`;
const publicRoot = resolve(process.cwd(), "public");
const store = new PlanStore();
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) { chunks.push(Buffer.from(chunk)); if (Buffer.concat(chunks).length > 10_000) throw new Error("Request body is too large."); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function mutation(req: IncomingMessage) {
  if (req.headers.host !== `${host}:${port}` || req.headers.origin !== origin || !req.headers["content-type"]?.startsWith("application/json")) throw new Error("Local same-origin JSON request required.");
}

async function serveFile(res: ServerResponse, path: string) {
  const allowed = path === "/" ? "/index.html" : path;
  if (!/^\/[a-z0-9._/-]+$/i.test(allowed) || allowed.includes("..")) return send(res, 404, { error: "Not found." });
  const file = resolve(publicRoot, `.${allowed}`);
  if (!file.startsWith(publicRoot)) return send(res, 404, { error: "Not found." });
  try { send(res, 200, await readFile(file), mime[extname(file)] ?? "application/octet-stream"); } catch { send(res, 404, { error: "Not found." }); }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", origin);
    if (req.method === "POST" && url.pathname === "/api/plans") {
      mutation(req); const input = await body(req);
      if (!input || typeof input.requirement !== "string" || input.requirement.trim().length === 0 || input.requirement.length > 2000) throw new Error("A requirement of up to 2,000 characters is required.");
      const scenario = getScenario(input.scenarioId, input.revision);
      const response = validatePlannerResponse(fixturePlanFor(scenario));
      if (response.kind !== "plan" || !response.plan) throw new Error("Fixture planner did not return a plan.");
      return send(res, 201, { ...store.create(input.requirement.trim(), scenario, response.plan), planner: "Fixture planner — Meta not used" });
    }
    const approve = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/approve$/);
    if (req.method === "POST" && approve) { mutation(req); return send(res, 200, store.approve(approve[1])); }
    const run = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/run$/);
    if (req.method === "POST" && run) {
      mutation(req); const plan = store.consume(run[1]); const startedAt = new Date().toISOString();
      const temporaryId = randomUUID();
      let executionError: string | undefined;
      let assertions;
      try { assertions = await runApprovedPlan(plan.envelope, origin, temporaryId); }
      catch (error) {
        executionError = error instanceof Error ? error.message : "Runner failed.";
        assertions = error instanceof RunnerExecutionError
          ? error.assertions
          : plan.envelope.plan.assertions.map((item) => ({ id: item.id, expected: item.expected, observed: null, verdict: "INCONCLUSIVE" as const, screenshot: "not-captured.png", timestamp: new Date().toISOString(), url: origin }));
      }
      const report = await saveRun({ planId: plan.id, approvalDigest: plan.digest, approvalEnvelope: plan.envelope, planner: plan.envelope.planner, scenario: plan.envelope.scenario, origin, startedAt, endedAt: new Date().toISOString(), verdict: aggregate(assertions, executionError === undefined), assertions, replay: plan.envelope.scenario.replay, ...(executionError ? { executionError } : {}) }, temporaryId);
      return send(res, 201, report);
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

server.listen(port, host, () => console.log(`ProofPath fixture mode at ${origin}`));
