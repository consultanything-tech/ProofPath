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
import { ProposalBudgetError } from "./v2-proposal-budget.js";

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
  readonly bothJourneys?: boolean;
  readonly planningGate?: V2HttpContext["inspectionGate"];
  readonly v2Runtime?: { start(id: string): Promise<{ runId: string }>; read(id: string): Promise<import("./v2-contracts.js").SuiteRun>; stopAdmissions(): void; drain(ms?: number): Promise<boolean> };
  readonly plans?: { create(...args: Parameters<PlanStore["create"]>): ReturnType<PlanStore["create"]> | Promise<ReturnType<PlanStore["create"]>>; approve(...args: Parameters<PlanStore["approve"]>): ReturnType<PlanStore["approve"]> | Promise<ReturnType<PlanStore["approve"]>>; consume(...args: Parameters<PlanStore["consume"]>): ReturnType<PlanStore["consume"]> | Promise<ReturnType<PlanStore["consume"]>> };
  readonly v1Jobs?: { start(id: string, owner?: string): Promise<{ runId: string; jobStatus: string }>; read(id: string, owner?: string): Promise<import("./evidence.js").RunManifest | { runId: string; jobStatus: string }>; evidence(id: string, filename: string, owner?: string): Promise<Buffer> };
}>;
type ServerServices = Pick<V2HttpContext, "inspect" | "propose" | "proposalService"> & {
  readonly controlledMeta?: boolean;
  readonly controlledLive?: boolean;
  readonly runtime?: ServerRuntimeOptions;
};

function send(res: ServerResponse, status: number, body: unknown, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Content-Security-Policy": "default-src 'self'; img-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
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
  const store = runtime?.plans ?? new PlanStore();
  const gate = new RunGate();
  const localInspectionGate = new RunGate();
  const inspectionGate = {
    async acquire() {
      if (!localInspectionGate.acquire()) return false;
      try {
        if (runtime?.planningGate && !await runtime.planningGate.acquire()) { localInspectionGate.release(); return false; }
        return true;
      } catch (error) { localInspectionGate.release(); throw error; }
    },
    async release() { try { await runtime?.planningGate?.release(); } finally { localInspectionGate.release(); } }
  };
  const v2Store = runtime?.v2Store ?? new V2Store(runtime?.dataDir ?? process.env.DATA_DIR ?? process.cwd());
  const v2Context = createV2Context(fixtureOrigin);
  const v2Runtime = runtime?.v2Runtime ?? createV2Runtime(v2Store, fixtureOrigin, { gate });
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
      if (runtime?.hosted && !runtime.bothJourneys && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/runs/") || url.pathname.startsWith("/evidence/"))) return send(res, 404, { error: "Not found." });
      const v1Route = runtime?.bothJourneys && (/^\/api\/(?:config|plans(?:\/[a-f0-9-]{36}\/(?:approve|run))?|v1\/jobs\/[a-f0-9-]{36})$/.test(url.pathname) || /^\/runs\/[a-f0-9-]{36}\/manifest\.json$/.test(url.pathname) || /^\/evidence\/[a-f0-9-]{36}\/[a-z0-9-]+\.png$/.test(url.pathname));
      const assets = runtime?.bothJourneys ? ["/", "/index.html", "/app.js", "/workbench.html", "/workbench.js", "/styles.css"] : ["/", "/workbench.html", "/workbench.js", "/styles.css"];
      if (runtime?.hosted && !assets.includes(url.pathname) && !v1Route) return send(res, 404, { error: "Not found." });
      const queued = url.pathname.match(/^\/api\/v1\/jobs\/([a-f0-9-]{36})$/);
      if (req.method === "GET" && queued && runtime?.v1Jobs) {
        const principal = controlledLive ? await v2Services.proposalService?.authenticate(req.headers.authorization) : undefined;
        if (controlledLive && !principal) throw new ProposalBudgetError(401, "Reviewer access is unavailable.");
        return send(res, 200, await runtime.v1Jobs.read(queued[1]!, principal?.key));
      }
      if (req.method === "GET" && url.pathname === "/api/config") {
        const livePlanner = v2Services.proposalService?.publicMetadata;
        const controlledPlanner = livePlanner?.provider === "meta-model-api" ? { mode: "meta" as const, provider: "meta-model-api" as const, model: livePlanner.model as "muse-spark-1.3" } : planner.provenance;
        return send(res, 200, { planner: controlledPlanner, plannerLabel: plannerLabel(controlledPlanner), controlledMeta: controlledLive, controlledLive, authenticationRequired: Boolean(controlledLive && v2Services.proposalService?.requiresAuthentication), v1Planning: { enabled: Boolean(controlledLive && v2Services.proposalService?.proposeV1) } });
      }
      if (req.method === "POST" && url.pathname === "/api/plans") {
        if (controlledLive) {
          const service = v2Services.proposalService;
          if (!service?.proposeV1) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
          await service.authenticate(req.headers.authorization);
        }
        mutation(req, origin);
        const input = await readJson(req);
        if (!isRecord(input) || typeof input.requirement !== "string" || input.requirement.trim().length === 0 || input.requirement.length > 2000) throw new Error("A requirement of up to 2,000 characters is required.");
        const scenario = getScenario(input.scenarioId, input.revision);
        if (controlledLive) {
          const service = v2Services.proposalService;
          if (!service?.proposeV1) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
          const principal = await service.authorize(req.headers.authorization);
          if (!await inspectionGate.acquire()) throw new ProposalBudgetError(503, "Another proposal or target inspection is already in progress.");
          let result;
          try { result = await service.proposeV1(input.requirement.trim(), scenario, principal); }
          finally { await inspectionGate.release(); }
          const livePlanner = service.publicMetadata;
          const provenance = { mode: "meta" as const, provider: "meta-model-api" as const, model: (livePlanner?.model ?? "muse-spark-1.3") as "muse-spark-1.3" };
          const label = plannerLabel(provenance);
          if (result.response.kind === "clarification") return send(res, 200, { kind: "clarification", question: result.response.question, plannerLabel: label });
          return send(res, 201, { kind: "plan", ...await store.create(input.requirement.trim(), scenario, result.response.plan!, provenance, principal.key), plannerLabel: label });
        }
        const response = validatePlannerResponse(await planner.propose(input.requirement.trim(), scenario));
        const label = plannerLabel(planner.provenance);
        if (response.kind === "clarification") return send(res, 200, { kind: "clarification", question: response.question, plannerLabel: label });
        return send(res, 201, { kind: "plan", ...await store.create(input.requirement.trim(), scenario, response.plan!, planner.provenance), plannerLabel: label });
      }
      const approve = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/approve$/);
      if (req.method === "POST" && approve) {
        mutation(req, origin);
        emptyBody(await readJson(req));
        const principal = controlledLive ? await v2Services.proposalService?.authenticate(req.headers.authorization) : undefined;
        if (controlledLive && !principal) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
        return send(res, 200, await store.approve(approve[1], principal?.key));
      }
      const run = url.pathname.match(/^\/api\/plans\/([a-f0-9-]+)\/run$/);
      if (req.method === "POST" && run) {
        mutation(req, origin);
        emptyBody(await readJson(req));
        const principal = controlledLive ? await v2Services.proposalService?.authenticate(req.headers.authorization) : undefined;
        if (controlledLive && !principal) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
        if (runtime?.v1Jobs) return send(res, 202, await runtime.v1Jobs.start(run[1]!, principal?.key));
        if (!gate.acquire()) throw new Error("Another approved run is already in progress.");
        try {
          const plan = await store.consume(run[1], principal?.key);
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
        if (controlledLive) {
          const principal = await v2Services.proposalService?.authenticate(req.headers.authorization);
          if (!principal) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
        }
        if (runtime?.v1Jobs) {
          const principal = controlledLive ? await v2Services.proposalService?.authenticate(req.headers.authorization) : undefined;
          return send(res, 200, await runtime.v1Jobs.read(manifest[1]!, principal?.key));
        }
        const contents = await readFile(manifestPath(manifest[1]), "utf8");
        const saved = JSON.parse(contents);
        if (saved.runId !== manifest[1]) return send(res, 404, { error: "Not found." });
        return send(res, 200, contents, "application/json; charset=utf-8");
      }
      const evidence = url.pathname.match(/^\/evidence\/([a-f0-9-]{36})\/([a-z0-9-]+\.png)$/);
      if (req.method === "GET" && evidence) {
        if (controlledLive) {
          const principal = await v2Services.proposalService?.authenticate(req.headers.authorization);
          if (!principal) throw new ProposalBudgetError(503, "V1 live planning is unavailable.");
        }
        if (runtime?.v1Jobs) {
          const principal = controlledLive ? await v2Services.proposalService?.authenticate(req.headers.authorization) : undefined;
          return send(res, 200, await runtime.v1Jobs.evidence(evidence[1]!, evidence[2]!, principal?.key), "image/png");
        }
        const saved = JSON.parse(await readFile(manifestPath(evidence[1]), "utf8"));
        if (saved.runId !== evidence[1] || !saved.assertions.some((item: { screenshot?: string }) => item.screenshot === evidence[2])) return send(res, 404, { error: "Not found." });
        return send(res, 200, await readFile(evidencePath(evidence[1], evidence[2])), "image/png");
      }
      if (req.method === "GET") return serveFile(res, runtime?.hosted && !runtime.bothJourneys && url.pathname === "/" ? "/workbench.html" : url.pathname);
      return send(res, 405, { error: "Method not allowed." });
    } catch (error) { return send(res, error instanceof ProposalBudgetError ? error.status : 400, { error: error instanceof Error ? error.message : "Request failed." }); }
  });
  return {
    server, origin, fixtureOrigin, gate, ready,
    stopAdmissions() { accepting = false; v2Runtime.stopAdmissions(); },
    async drain(timeoutMs = 30_000) {
      const started = Date.now();
      const execution = await v2Runtime.drain(timeoutMs);
      if (!execution) return false;
      return await localInspectionGate.drain(Math.max(0, timeoutMs - (Date.now() - started)));
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
    if (process.env.PROOFPATH_RUNTIME === "gcp") {
      await (await import("./gcp/runtime.js")).startGcpRuntime(process.env);
      return;
    }
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
