import type { IncomingMessage, ServerResponse } from "node:http";
import { createV2Context, resolveRelease, withSourceRequirement } from "./v2-checkout.js";
import { renderBugPacket, renderHistoricalPlaywrightExport } from "./v2-artifacts.js";
import { createV2Planner, inspectRegisteredTarget } from "./v2-planner.js";
import type { GroundingBundle, ReviewDecision, SuiteRun, V2Context } from "./v2-contracts.js";
import { V2Store } from "./v2-store.js";
import { ProposalBudgetError, type ReviewerPrincipal } from "./v2-proposal-budget.js";

export type V2LiveMetadata = Readonly<{
  provider: "meta-model-api" | "baseten";
  model: string;
  protocol: "responses";
  schemaEnforcement: "provider-and-local" | "local";
}>;
export type V2ProposalService = { readonly publicMetadata?: V2LiveMetadata; readonly requiresAuthentication?: boolean; authenticate(header: string | undefined): Promise<ReviewerPrincipal>; authorize(header: string | undefined): Promise<ReviewerPrincipal>; propose(context: V2Context, principal: ReviewerPrincipal): Promise<{ proposal: import("./v2-contracts.js").ProposalResult; reservationId: string; provenance: readonly string[] }> };
export type V2HttpContext = { readonly origin: string; readonly fixtureOrigin?: string; readonly store: V2Store; readonly runtime: { start(approvalId: string): Promise<{ runId: string }>; read(runId: string): Promise<SuiteRun> }; readonly v2: V2Context; readonly inspect?: (context: V2Context) => Promise<GroundingBundle>; readonly propose?: (context: V2Context) => Promise<import("./v2-contracts.js").ProposalResult>; readonly proposalService?: V2ProposalService; readonly proposalProvenance?: readonly string[]; readonly inspectionGate?: { acquire(): boolean; release(): void } };
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);

export async function handleV2Request(req: IncomingMessage, res: ServerResponse, context: V2HttpContext): Promise<boolean> {
  const url = new URL(req.url ?? "/", context.origin);
  if (!url.pathname.startsWith("/api/v2/")) return false;
  try {
    if (context.proposalService && context.propose) throw new HttpError(500, "V2 proposal service configuration is unavailable.");
    if (req.headers.host !== new URL(context.origin).host) throw new HttpError(400, "Exact configured Host header required.");
    if (url.origin !== context.origin) throw new HttpError(400, "Configured request URL required.");
    if (context.proposalService?.requiresAuthentication && url.pathname !== "/api/v2/config") await context.proposalService.authenticate(req.headers.authorization);
    if (req.method === "GET" && url.pathname === "/api/v2/config") {
      const protectedAccess = Boolean(context.proposalService?.requiresAuthentication);
      const planner = protectedAccess ? context.proposalService?.publicMetadata ?? {
        provider: "meta-model-api", model: "muse-spark-1.3", protocol: "responses", schemaEnforcement: "provider-and-local"
      } : null;
      return reply(res, 200, { mode: protectedAccess ? "controlled-live" : "fixture", authenticationRequired: protectedAccess,
        planner, proposalLimit: protectedAccess ? { perCode: 3, total: 50, reservationUsd: "0.05", totalUsd: "2.50" } : null });
    }
    if (req.method === "GET" && url.pathname === "/api/v2/groundings") return reply(res, 200, (await withinInspectionGate(context, () => grounded(context, context.v2))).grounding);
    if (req.method === "POST" && url.pathname === "/api/v2/proposals") {
      const body = await mutation(req, context.origin);
      if (!isRecord(body) || !exact(body, ["requirement", "releases"]) || typeof body.requirement !== "string" || body.requirement.trim().length === 0 || body.requirement.length > 4_000 || !Array.isArray(body.releases) || body.releases.length !== 2 || !body.releases.every((id) => typeof id === "string")) throw new HttpError(400, "A requirement and exactly two registered releases are required.");
      let base: V2Context;
      try { base = createV2Context(context.fixtureOrigin ?? context.origin, [body.releases[0] as string, body.releases[1] as string]); resolveRelease(body.releases[0] as string); resolveRelease(body.releases[1] as string); }
      catch { throw new HttpError(400, "Unknown or duplicate registered releases."); }
      const principal = context.proposalService ? await context.proposalService.authorize(req.headers.authorization) : undefined;
      let source: V2Context;
      try { source = withSourceRequirement(base, body.requirement.trim()); }
      catch (error) { return reply(res, 200, { kind: "clarification", gaps: [error instanceof Error ? error.message : "Source requires clarification."] }); }
      const { inspected, dispatched } = await withinInspectionGate(context, async () => {
        const inspected = await grounded(context, source);
        const dispatched = context.proposalService ? await context.proposalService.propose(inspected, principal!) : undefined;
        return { inspected, dispatched };
      });
      if (context.proposalService && (!dispatched || !dispatched.proposal || !["proposal", "clarification"].includes(dispatched.proposal.kind)))
        throw new HttpError(503, "Budgeted proposal was unavailable.");
      const proposal = context.proposalService ? dispatched!.proposal : await (context.propose ?? createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose)(inspected);
      if (proposal.kind === "clarification") return reply(res, 200, { kind: "clarification", gaps: proposal.gaps });
      return reply(res, 201, await context.store.createProposal(proposal, inspected, dispatched?.provenance ?? context.proposalProvenance ?? ["fixture-v2"]));
    }
    const review = url.pathname.match(/^\/api\/v2\/proposals\/([a-f0-9-]{36})\/review$/);
    if (req.method === "POST" && review) {
      const body = await mutation(req, context.origin);
      if (!isRecord(body) || !exact(body, ["review"])) throw new HttpError(400, "A strict review body is required.");
      return reply(res, 201, await context.store.reviewProposal(review[1]!, body.review as ReviewDecision));
    }
    const approve = url.pathname.match(/^\/api\/v2\/suites\/([a-f0-9-]{36})\/approve$/);
    if (req.method === "POST" && approve) {
      await emptyMutation(req, context.origin);
      return reply(res, 200, await context.store.approveSuite(approve[1]!));
    }
    const start = url.pathname.match(/^\/api\/v2\/approvals\/([a-f0-9-]{36})\/runs$/);
    if (req.method === "POST" && start) {
      await emptyMutation(req, context.origin);
      try { return reply(res, 202, await context.runtime.start(start[1]!)); }
      catch (error) { if (error instanceof Error && /already in progress/i.test(error.message)) throw new HttpError(409, error.message); throw error; }
    }
    const run = url.pathname.match(/^\/api\/v2\/runs\/([a-f0-9-]{36})$/);
    if (req.method === "GET" && run) return reply(res, 200, await context.runtime.read(run[1]!));
    const evidence = url.pathname.match(/^\/api\/v2\/runs\/([a-f0-9-]{36})\/evidence\/([a-z0-9-]+\.png)$/);
    if (req.method === "GET" && evidence) return binary(res, await context.store.readEvidence(evidence[1]!, evidence[2]!));
    const save = url.pathname.match(/^\/api\/v2\/runs\/([a-f0-9-]{36})\/regressions$/);
    if (req.method === "POST" && save) {
      await emptyMutation(req, context.origin);
      return reply(res, 201, await context.store.saveRegression(save[1]!));
    }
    const packet = url.pathname.match(/^\/api\/v2\/runs\/([a-f0-9-]{36})\/bug-packet$/);
    if (req.method === "GET" && packet) return download(res, `proofpath-${packet[1]}.md`, "text/markdown; charset=utf-8", renderBugPacket(await context.runtime.read(packet[1]!)));
    const exportFile = url.pathname.match(/^\/api\/v2\/runs\/([a-f0-9-]{36})\/playwright\.test\.mjs$/);
    if (req.method === "GET" && exportFile) return download(res, `proofpath-${exportFile[1]}.test.mjs`, "text/javascript; charset=utf-8", renderHistoricalPlaywrightExport(await context.runtime.read(exportFile[1]!)));
    if (req.method === "GET" && url.pathname === "/api/v2/regressions") return reply(res, 200, await context.store.listRegressions());
    const regression = url.pathname.match(/^\/api\/v2\/regressions\/([a-f0-9-]{36})$/);
    if (req.method === "GET" && regression) return reply(res, 200, await context.store.readRegression(regression[1]!));
    const prepare = url.pathname.match(/^\/api\/v2\/regressions\/([a-f0-9-]{36})\/prepare$/);
    if (req.method === "POST" && prepare) {
      const body = await mutation(req, context.origin);
      if (!isRecord(body) || !exact(body, ["releases"]) || !Array.isArray(body.releases) || body.releases.length !== 2 || !body.releases.every((id) => typeof id === "string")) throw new HttpError(400, "Exactly two registered releases are required.");
      let base: V2Context;
      try { base = createV2Context(context.fixtureOrigin ?? context.origin, [body.releases[0] as string, body.releases[1] as string]); resolveRelease(body.releases[0] as string); resolveRelease(body.releases[1] as string); }
      catch { throw new HttpError(400, "Unknown or duplicate registered releases."); }
      const saved = await context.store.readRegression(prepare[1]!);
      let preparedContext: V2Context;
      try { preparedContext = withSourceRequirement(base, saved.definition.requirement.originalText); }
      catch { throw new HttpError(400, "Saved regression source is no longer compatible with the registered fixture."); }
      return reply(res, 201, await context.store.prepareRegression(prepare[1]!, preparedContext));
    }
    if (!["GET", "POST"].includes(req.method ?? "")) throw new HttpError(405, "Method not allowed.");
    throw new HttpError(404, "Not found.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed.";
    const status = error instanceof HttpError || error instanceof ProposalBudgetError ? error.status : 400;
    return reply(res, status, { error: message });
  }
}

async function mutation(req: IncomingMessage, origin: string): Promise<unknown> {
  if (req.headers.origin !== origin || req.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new HttpError(400, "Local same-origin JSON request required.");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 10_000) throw new HttpError(400, "Request body is too large."); chunks.push(bytes); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(400, "Invalid JSON request body."); }
}
async function grounded(request: V2HttpContext, context: V2Context): Promise<V2Context> {
  try {
    const grounding = await (request.inspect ?? inspectRegisteredTarget)(context);
    return { ...context, grounding };
  } catch (error) {
    if (request.proposalService?.requiresAuthentication) throw new HttpError(503, "Registered target inspection is unavailable.");
    throw error;
  }
}
async function withinInspectionGate<T>(context: V2HttpContext, operation: () => Promise<T>): Promise<T> {
  if (context.inspectionGate && !context.inspectionGate.acquire()) throw new HttpError(409, "Another proposal or target inspection is already in progress.");
  try { return await operation(); } finally { context.inspectionGate?.release(); }
}
async function emptyMutation(req: IncomingMessage, origin: string) { const value = await mutation(req, origin); if (!isRecord(value) || !exact(value, [])) throw new HttpError(400, "An empty JSON body is required."); }
function reply(res: ServerResponse, status: number, body: unknown): true { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }); res.end(JSON.stringify(body)); return true; }
function download(res: ServerResponse, filename: string, type: string, body: string): true { res.writeHead(200, { "Content-Type": type, "Content-Disposition": `attachment; filename=\"${filename}\"`, "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }); res.end(body); return true; }
function binary(res: ServerResponse, body: Buffer): true { res.writeHead(200, { "Content-Type": "image/png", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }); res.end(body); return true; }
