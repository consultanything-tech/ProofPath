import type { IncomingMessage, ServerResponse } from "node:http";
import { createV2Context, resolveRelease, withSourceRequirement } from "./v2-checkout.js";
import { createV2Planner, inspectRegisteredTarget } from "./v2-planner.js";
import type { GroundingBundle, ReviewDecision, V2Context } from "./v2-contracts.js";
import { V2Store } from "./v2-store.js";

export type V2HttpContext = { readonly origin: string; readonly store: V2Store; readonly runtime: { start(approvalId: string): Promise<{ runId: string }>; read(runId: string): Promise<unknown> }; readonly v2: V2Context; readonly inspect?: (context: V2Context) => Promise<GroundingBundle>; readonly propose?: (context: V2Context) => Promise<import("./v2-contracts.js").ProposalResult>; readonly proposalProvenance?: readonly string[] };
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => key in value);

export async function handleV2Request(req: IncomingMessage, res: ServerResponse, context: V2HttpContext): Promise<boolean> {
  const url = new URL(req.url ?? "/", context.origin);
  if (!url.pathname.startsWith("/api/v2/")) return false;
  try {
    if (req.headers.host !== new URL(context.origin).host) throw new HttpError(400, "Exact local Host header required.");
    if (url.origin !== context.origin) throw new HttpError(400, "Local request URL required.");
    if (req.method === "GET" && url.pathname === "/api/v2/groundings") return reply(res, 200, (await grounded(context, context.v2)).grounding);
    if (req.method === "POST" && url.pathname === "/api/v2/proposals") {
      const body = await mutation(req, context.origin);
      if (!isRecord(body) || !exact(body, ["requirement", "releases"]) || typeof body.requirement !== "string" || body.requirement.trim().length === 0 || body.requirement.length > 4_000 || !Array.isArray(body.releases) || body.releases.length !== 2 || !body.releases.every((id) => typeof id === "string")) throw new HttpError(400, "A requirement and exactly two registered releases are required.");
      let base: V2Context;
      try { base = createV2Context(context.origin, [body.releases[0] as string, body.releases[1] as string]); resolveRelease(body.releases[0] as string); resolveRelease(body.releases[1] as string); }
      catch { throw new HttpError(400, "Unknown or duplicate registered releases."); }
      let source: V2Context;
      try { source = withSourceRequirement(base, body.requirement.trim()); }
      catch (error) { return reply(res, 200, { kind: "clarification", gaps: [error instanceof Error ? error.message : "Source requires clarification."] }); }
      const inspected = await grounded(context, source);
      const proposal = await (context.propose ?? createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose)(inspected);
      if (proposal.kind === "clarification") return reply(res, 200, { kind: "clarification", gaps: proposal.gaps });
      return reply(res, 201, await context.store.createProposal(proposal, inspected, context.proposalProvenance ?? ["fixture-v2"]));
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
    if (!["GET", "POST"].includes(req.method ?? "")) throw new HttpError(405, "Method not allowed.");
    throw new HttpError(404, "Not found.");
  } catch (error) {
    return reply(res, error instanceof HttpError ? error.status : 400, { error: error instanceof Error ? error.message : "Request failed." });
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
  const grounding = await (request.inspect ?? inspectRegisteredTarget)(context);
  return { ...context, grounding };
}
async function emptyMutation(req: IncomingMessage, origin: string) { const value = await mutation(req, origin); if (!isRecord(value) || !exact(value, [])) throw new HttpError(400, "An empty JSON body is required."); }
function reply(res: ServerResponse, status: number, body: unknown): true { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Security-Policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }); res.end(JSON.stringify(body)); return true; }
