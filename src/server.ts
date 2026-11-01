import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validatePlannerResponse } from "./contracts.js";
import { saveRun, evidencePath, manifestPath, type ActionResult, type ExecutionStatus } from "./evidence.js";
import { PlanStore } from "./plan-store.js";
import { createPlanner, plannerLabel, type Planner } from "./planner.js";
import { RunnerExecutionError, runApprovedPlan } from "./runner.js";
import { getScenario } from "./scenarios.js";
import { aggregate, type AssertionResult } from "./verdict.js";
import { createV2Context } from "./v2-checkout.js";
import { handleV2Request, type V2HttpContext } from "./v2-http.js";
import { createV2Runtime } from "./v2-runner.js";
import { V2Store } from "./v2-store.js";
import { createFixtureServer } from "./fixture-server.js";
import { readHostedRuntimeConfig, type HostedRuntimeConfig } from "./runtime-config.js";

const host = "127.0.0.1";
const publicRoot = resolve(process.cwd(), "public");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

export class RunGate {
  private held = false;
  private idle: Promise<void> = Promise.resolve();
  private releaseIdle: (() => void) | undefined;
  acquire() {
    if (this.held) return false;
    this.held = true;
    this.idle = new Promise<void>((resolve) => { this.releaseIdle = resolve; });
    return true;
  }
  release() { this.held = false; this.releaseIdle?.(); this.releaseIdle = undefined; }
  async drain(timeoutMs: number): Promise<boolean> {
    if (!this.held) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([this.idle.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]); }
    finally { if (timer) clearTimeout(timer); }
  }
}

type ServerRuntimeOptions = Readonly<{
  readonly origin?: string;
  readonly fixtureOrigin?: string;
  readonly dataDir?: string;
  readonly hosted?: boolean;
  readonly v2Store?: V2Store;
}>;
type ServerServices = Pick<V2HttpContext, "inspect" | "propose" | "proposalService"> & {
  readonly controlledMeta?: boolean;
  readonly controlledLive?: boolean;
  readonly runtime?: ServerRuntimeOptions;
};

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

export function createProofPathServer(port: number, planner: Planner = createPlanner(process.env), v2Services: ServerServices = {}) {
  if (v2Services.propose && v2Services.proposalService) throw new Error("V2 proposal service configuration is unavailable.");
  const controlledLive = Boolean(v2Services.controlledLive || v2Services.controlledMeta || v2Services.proposalService?.requiresAuthentication);
  const runtime = v2Services.runtime;
  const origin = runtime?.origin ?? `http://${host}:${port}`;
  const fixtureOrigin = runtime?.fixtureOrigin ?? origin;
  const store = new PlanStore();
  const gate = new RunGate();
  const inspectionGate = new RunGate();
  const v2Store = runtime?.v2Store ?? new V2Store(runtime?.dataDir ?? process.env.DATA_DIR ?? process.cwd());
  const v2Context = createV2Context(fixtureOrigin);
  const v2Runtime = createV2Runtime(v2Store, fixtureOrigin, { gate });
  const ready = v2Store.recoverInterruptedJobs();
  if (!runtime?.hosted) void ready.catch(() => {});
  const { runtime: ignoredRuntime, controlledMeta: ignoredControlledMeta, controlledLive: ignoredControlledLive, ...v2HttpServices } = v2Services;
  let accepting = true;
  const server = createServer(async (req, res) => {
    try {
      if (!accepting) return send(res, 503, { error: "Runtime is shutting down." });
      if (req.headers.host !== new URL(origin).host) throw new Error("Exact configured Host header required.");
      if (runtime?.hosted && req.headers.origin !== undefined && req.headers.origin !== origin) throw new Error("Exact configured Origin header required.");
      const url = new URL(req.url ?? "/", origin);
      if (url.origin !== origin) throw new Error("Configured request URL required.");
      if (runtime?.hosted && req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { status: "ok" });
      if (await handleV2Request(req, res, { origin, fixtureOrigin, store: v2Store, runtime: v2Runtime, v2: v2Context, inspectionGate, ...v2HttpServices })) return;
      if (runtime?.hosted && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/runs/") || url.pathname.startsWith("/evidence/"))) return send(res, 404, { error: "Not found." });
      if (runtime?.hosted && !["/", "/workbench.html", "/workbench.js", "/styles.css"].includes(url.pathname)) return send(res, 404, { error: "Not found." });
      if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { planner: planner.provenance, plannerLabel: plannerLabel(planner.provenance), controlledMeta: controlledLive, controlledLive });
      if (req.method === "POST" && url.pathname === "/api/plans") {
        if (controlledLive) return send(res, 403, { error: "V1 model planning is disabled in controlled live mode." });
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
        if (controlledLive) return send(res, 403, { error: "V1 model planning is disabled in controlled live mode." });
        mutation(req, origin);
        emptyBody(await readJson(req));
        return send(res, 200, store.approve(approve[1]));
      }
      const run = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/run$/);
      if (req.method === "POST" && run) {
        if (controlledLive) return send(res, 403, { error: "V1 model planning is disabled in controlled live mode." });
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
      if (req.method === "GET") return serveFile(res, runtime?.hosted && url.pathname === "/" ? "/workbench.html" : url.pathname);
      return send(res, 405, { error: "Method not allowed." });
    } catch (error) { return send(res, 400, { error: error instanceof Error ? error.message : "Request failed." }); }
  });
  return {
    server, origin, fixtureOrigin, gate, ready,
    stopAdmissions() { accepting = false; v2Runtime.stopAdmissions(); },
    async drain(timeoutMs = 30_000) {
      const started = Date.now();
      const execution = await v2Runtime.drain(timeoutMs);
      if (!execution) return false;
      return await inspectionGate.drain(Math.max(0, timeoutMs - (Date.now() - started)));
    }
  };
}

function listen(server: import("node:http").Server, port: number, bind: string) {
  return new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, bind, () => { server.off("error", reject); resolve(); }); });
}
function close(server: import("node:http").Server) { return new Promise<void>((resolve) => server.close(() => resolve())); }
const pathWithin = (parent: string, child: string) => { const value = relative(parent, child); return value === "" || (!value.startsWith("..") && !isAbsolute(value)); };
async function verifyLiveOperatorPath(config: HostedRuntimeConfig) {
  try {
    const [dataDir, operatorDir] = await Promise.all([realpath(config.dataDir), realpath(config.operatorDir)]);
    if (!pathWithin(dataDir, operatorDir)) throw new Error("Hosted operator state escapes DATA_DIR.");
  } catch (error) { if (error instanceof Error && error.message.includes("escapes")) throw error; throw new Error("Hosted operator state is unavailable."); }
}

export type HostedRuntime = Readonly<{ readonly config: HostedRuntimeConfig; readonly server: import("node:http").Server; readonly fixtureServer: import("node:http").Server; close(): Promise<void> }>;

/** Starts only an already-initialized, durable hosted V2 Meta runtime. */
export async function startHostedRuntime(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: { readonly createLiveServices?: typeof import("./v2-live-bootstrap.js").createControlledLiveServices; readonly shutdownTimeoutMs?: number } = {}
): Promise<HostedRuntime> {
  const config = readHostedRuntimeConfig(env);
  if (!config) throw new Error("Hosted runtime requires PROOFPATH_RUNTIME=hosted.");
  const fixtureOnly = env.V2_PLANNER_MODE === "fixture";
  if (!fixtureOnly && env.V2_PLANNER_MODE !== "meta") throw new Error("Hosted runtime supports only fixture or verified direct Meta V2 planning.");
  const v2Store = fixtureOnly ? await V2Store.openOrInitializeHostedFixture(config.dataDir) : await V2Store.openHosted(config.dataDir);
  if (!fixtureOnly) await verifyLiveOperatorPath(config);
  const fixture = createFixtureServer(config.fixturePort);
  const createLiveServices = dependencies.createLiveServices ?? (await import("./v2-live-bootstrap.js")).createControlledLiveServices;
  let live: Awaited<ReturnType<typeof createLiveServices>> | undefined;
  let instance: ReturnType<typeof createProofPathServer> | undefined;
  try {
    await listen(fixture.server, config.fixturePort, host);
    if (!fixtureOnly) live = await createLiveServices({ ...env, DATA_DIR: config.dataDir, V2_OPERATOR_DIR: config.operatorDir });
    instance = createProofPathServer(config.port, createPlanner({ ...env, PLANNER_MODE: "fixture" }), {
      ...(live ? { proposalService: live.service, controlledLive: true } : {}),
      runtime: { hosted: true, origin: config.publicOrigin, fixtureOrigin: fixture.origin, dataDir: config.dataDir, v2Store }
    });
    await instance.ready;
    await listen(instance.server, config.port, "0.0.0.0");
    const publicServer = instance.server;
    let closing: Promise<void> | undefined;
    return {
      config, server: publicServer, fixtureServer: fixture.server,
      close() { return closing ??= (async () => {
        // Stop admission before fixture/operator teardown. A timeout leaves their
        // state untouched so a forced process stop remains fail-closed.
        instance!.stopAdmissions();
        const ingressClosed = close(publicServer).catch(() => {});
        if (!await instance!.drain(dependencies.shutdownTimeoutMs ?? 30_000)) throw new Error("Hosted runtime did not drain before shutdown.");
        await ingressClosed;
        await close(fixture.server).catch(() => {});
        await live?.close().catch(() => {});
      })(); }
    };
  } catch (error) {
    await close(instance?.server ?? fixture.server).catch(() => {});
    if (instance) await close(fixture.server).catch(() => {});
    await live?.close().catch(() => {});
    throw error;
  }
}

const port = Number(process.env.PORT ?? 3000);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const boot = async () => {
    if (readHostedRuntimeConfig(process.env)) {
      const runtime = await startHostedRuntime(process.env);
      const closeRuntime = () => { void runtime.close().catch(() => { process.stderr.write("Hosted shutdown incomplete; operator ownership retained.\n"); process.exitCode = 1; }); };
      process.once("SIGINT", closeRuntime); process.once("SIGTERM", closeRuntime);
      runtime.server.once("error", closeRuntime);
      console.log(`ProofPath hosted ${process.env.V2_PLANNER_MODE === "fixture" ? "fixture validation" : "direct Meta"} mode at ${runtime.config.publicOrigin}`);
      return;
    }
    if (process.env.V2_PLANNER_MODE === "meta" || process.env.V2_PLANNER_MODE === "baseten") {
      const { createControlledLiveServices } = await import("./v2-live-bootstrap.js");
      const live = await createControlledLiveServices(process.env);
      let instance: ReturnType<typeof createProofPathServer>;
      try {
        instance = createProofPathServer(port, createPlanner({ ...process.env, PLANNER_MODE: "fixture" }), { proposalService: live.service, controlledLive: true });
      } catch (error) { await live.close().catch(() => {}); throw error; }
      const close = () => { instance.server.close(() => { void live.close().catch(() => {}); }); };
      process.once("SIGINT", close); process.once("SIGTERM", close);
      instance.server.once("error", () => { void live.close().catch(() => {}); });
      instance.server.listen(port, host, () => console.log(`ProofPath controlled ${process.env.V2_PLANNER_MODE} mode at ${instance.origin}`));
      return;
    }
    const { server, origin } = createProofPathServer(port);
    server.listen(port, host, () => console.log(`ProofPath ${process.env.PLANNER_MODE} mode at ${origin}`));
  };
  void boot().catch(() => { process.stderr.write("ProofPath startup unavailable.\n"); process.exitCode = 1; });
}
