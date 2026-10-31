import { createHash } from "node:crypto";
import { buildV2ProposalPrompt, validateSuiteProposal, validateV2ProposalSchema } from "./v2-planner.js";
import type { ProposalResult, V2Context } from "./v2-contracts.js";
import { ProposalBudgetError, type ReviewerCodeRegistry, type ReviewerPrincipal } from "./v2-proposal-budget.js";

export const BASETEN_LIVE_PROFILE = Object.freeze({
  provider: "baseten", protocol: "responses", model: "meta-models/muse-spark-open-1026",
  endpoint: "https://inference.baseten.co/v1/responses", maxOutputTokens: 4096,
  maxResponseBytes: 65_536, timeoutMs: 30_000, maxAttempts: 1
} as const);
export const BASETEN_INPUT_COUNT_ENDPOINT = "https://inference.baseten.co/v1/responses/input_tokens" as const;
export const BASETEN_MODEL_METADATA_ENDPOINT = `https://api.baseten.co/v1/model_apis/${encodeURIComponent(BASETEN_LIVE_PROFILE.model)}` as const;

const MAX_RESERVATION_MICROUSD = 50_000;
const knownResponseFields = new Set(["id", "object", "created_at", "status", "model", "output", "usage", "incomplete_details", "error", "instructions", "max_output_tokens", "parallel_tool_calls", "temperature", "top_p", "tool_choice", "tools", "truncation", "service_tier", "text", "reasoning"]);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const iso = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
const fail = () => new BasetenLiveError();
const freeze = <T>(value: T): T => { if (value && typeof value === "object") { for (const child of Object.values(value as object)) freeze(child); Object.freeze(value); } return value; };

export class BasetenLiveError extends ProposalBudgetError {
  constructor() { super(503, "Baseten live proposal is unavailable."); }
}
export type BasetenUsage = Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens: number; cachedInputTokens: number }>;
export type BasetenAdmission = Readonly<{
  method: "baseten-responses-input-count"; model: typeof BASETEN_LIVE_PROFILE.model;
  effectiveContextLength: number; maxAdmittedInputTokens: number; inputNanousdPerToken: number; outputNanousdPerToken: number;
  maxOutputTokens: typeof BASETEN_LIVE_PROFILE.maxOutputTokens; reservationMicrousd: number;
  metadataDigest: `sha256:${string}`; assessedAt: string;
}>;
const admissions = new WeakSet<object>();
export interface BasetenLiveLedger {
  preflight(principal: ReviewerPrincipal): Promise<void>;
  reserve(principal: ReviewerPrincipal, requestDigest: string, inputTokens: number): Promise<string>;
  beforeAttempt(reservationId: string, attempt: 1): Promise<void>;
  usage(reservationId: string, usage: BasetenUsage): Promise<void>;
  finish(reservationId: string, status: "proposal" | "clarification" | "failed-or-uncertain"): Promise<void>;
  block(reason: "usage-missing" | "usage-breach" | "transport-uncertain" | "persistence-failure"): Promise<void>;
}

/** The profile is fixed; metadata bootstrap is responsible for producing this trusted admission. */
export function createBasetenAdmission(profile: BasetenModelProfile): BasetenAdmission {
  if (!profiles.has(profile as object)) throw fail();
  const maximum = Math.floor((MAX_RESERVATION_MICROUSD * 1_000 - BASETEN_LIVE_PROFILE.maxOutputTokens * profile.outputNanousdPerToken) / profile.inputNanousdPerToken);
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw fail();
  // Conservatively reserve room for output even when the catalog's context limit
  // describes the combined prompt and completion window.
  const maxAdmittedInputTokens = Math.min(26_073, profile.effectiveContextLength - BASETEN_LIVE_PROFILE.maxOutputTokens, maximum);
  if (!Number.isSafeInteger(maxAdmittedInputTokens) || maxAdmittedInputTokens < 1) throw fail();
  const reservationMicrousd = Math.ceil((maxAdmittedInputTokens * profile.inputNanousdPerToken + BASETEN_LIVE_PROFILE.maxOutputTokens * profile.outputNanousdPerToken) / 1_000);
  const value = freeze({ method: "baseten-responses-input-count" as const, model: BASETEN_LIVE_PROFILE.model, effectiveContextLength: profile.effectiveContextLength, maxAdmittedInputTokens, inputNanousdPerToken: profile.inputNanousdPerToken, outputNanousdPerToken: profile.outputNanousdPerToken, maxOutputTokens: BASETEN_LIVE_PROFILE.maxOutputTokens, reservationMicrousd, metadataDigest: profile.metadataDigest, assessedAt: new Date().toISOString() });
  admissions.add(value); return value;
}
export function validateBasetenAdmission(value: unknown): BasetenAdmission {
  if (!record(value) || !admissions.has(value) || value.method !== "baseten-responses-input-count" || value.model !== BASETEN_LIVE_PROFILE.model || !safeCount(value.effectiveContextLength) || !safeCount(value.maxAdmittedInputTokens) || value.maxAdmittedInputTokens > value.effectiveContextLength || !safeCount(value.inputNanousdPerToken) || !safeCount(value.outputNanousdPerToken) || value.maxOutputTokens !== BASETEN_LIVE_PROFILE.maxOutputTokens || !safeCount(value.reservationMicrousd) || typeof value.metadataDigest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.metadataDigest) || !iso(value.assessedAt)) throw fail();
  const worst = Math.ceil((value.maxAdmittedInputTokens * value.inputNanousdPerToken + BASETEN_LIVE_PROFILE.maxOutputTokens * value.outputNanousdPerToken) / 1_000);
  if (!Number.isSafeInteger(worst) || value.reservationMicrousd !== worst || worst > MAX_RESERVATION_MICROUSD) throw fail();
  return value as BasetenAdmission;
}

export type BasetenModelProfile = Readonly<{ model: typeof BASETEN_LIVE_PROFILE.model; effectiveContextLength: number; inputNanousdPerToken: number; outputNanousdPerToken: number; metadataDigest: `sha256:${string}` }>;
const profiles = new WeakSet<object>();

/** Read-only bootstrap helper; it never generates, redeems, or persists anything. */
export async function readBasetenModelProfile(apiKey: string, fetcher: typeof fetch): Promise<BasetenModelProfile> {
  if (!apiKey || apiKey.length > 4096) throw fail();
  let response: Response;
  try { response = await fetcher(BASETEN_MODEL_METADATA_ENDPOINT, { method: "GET", redirect: "error", headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(BASETEN_LIVE_PROFILE.timeoutMs) }); }
  catch { throw fail(); }
  try {
    if (!response.ok) throw fail(); const value = await boundedJson(response, AbortSignal.timeout(BASETEN_LIVE_PROFILE.timeoutMs));
    if (!record(value) || value.name !== BASETEN_LIVE_PROFILE.model || !safeCount(value.context_length) || value.context_length < 1) throw fail();
    const input = costNanousd(value.cost_per_million_input_tokens); const output = costNanousd(value.cost_per_million_output_tokens);
    if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0 || input > 1250 || output > 4250) throw fail();
    const profile = Object.freeze({ model: BASETEN_LIVE_PROFILE.model, effectiveContextLength: value.context_length, inputNanousdPerToken: input, outputNanousdPerToken: output, metadataDigest: digest(JSON.stringify(value)) }); profiles.add(profile); return profile;
  } finally { await response.body?.cancel().catch(() => {}); }
}

/** Converts documented decimal USD-per-million rates to integer nano-USD/token, rounding up. */
function costNanousd(value: unknown): number {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(?:\.\d{1,9})?$/.test(text)) throw fail();
  const [whole, fraction = ""] = text.split("."); const scale = 10 ** fraction.length; const numerator = Number(whole) * scale + Number(fraction || "0");
  if (!Number.isSafeInteger(numerator)) throw fail(); return Math.ceil(numerator * 1_000 / scale);
}

/** Fixed, stateless, tool-free request.  It deliberately has no endpoint/key information. */
export function buildBasetenLiveRequest(context: V2Context): Readonly<object> {
  const prompt = buildV2ProposalPrompt(context);
  const developer = `${prompt.developer} Baseten accepts JSON-schema guidance but does not enforce it. Return exactly one JSON object that conforms to this schema; ProofPath applies local schema and semantic validation: ${JSON.stringify(prompt.schema)}`;
  return freeze({ model: BASETEN_LIVE_PROFILE.model,
    input: [{ role: "developer", content: [{ type: "input_text", text: developer }] }, { role: "user", content: [{ type: "input_text", text: JSON.stringify(prompt.user) }] }],
    text: { format: { type: "json_schema", name: "proofpath_v2_suite", strict: true, schema: prompt.schema } },
    reasoning: { effort: "low" }, max_output_tokens: BASETEN_LIVE_PROFILE.maxOutputTokens,
    tools: [], stream: false, truncation: "disabled" });
}

/** Usage is parsed independently so it can be durably journaled before content acceptance. */
export function parseBasetenLiveUsage(value: unknown, admission: BasetenAdmission): BasetenUsage {
  if (!record(value) || !record(value.usage)) throw fail();
  const usage = value.usage; const input = usage.input_tokens; const output = usage.output_tokens; const total = usage.total_tokens;
  if (!safeCount(input) || !safeCount(output) || !safeCount(total) || total !== input + output || input > admission.maxAdmittedInputTokens || output > BASETEN_LIVE_PROFILE.maxOutputTokens) throw fail();
  let reasoning = 0; let cached = 0;
  if (usage.output_tokens_details !== undefined) { if (!record(usage.output_tokens_details) || (usage.output_tokens_details.reasoning_tokens !== undefined && !safeCount(usage.output_tokens_details.reasoning_tokens))) throw fail(); reasoning = (usage.output_tokens_details.reasoning_tokens as number | undefined) ?? 0; }
  if (usage.input_tokens_details !== undefined) { if (!record(usage.input_tokens_details) || (usage.input_tokens_details.cached_tokens !== undefined && !safeCount(usage.input_tokens_details.cached_tokens))) throw fail(); cached = (usage.input_tokens_details.cached_tokens as number | undefined) ?? 0; }
  if (reasoning > output || cached > input) throw fail();
  return Object.freeze({ inputTokens: input, outputTokens: output, totalTokens: total, reasoningTokens: reasoning, cachedInputTokens: cached });
}

export function parseBasetenLiveEnvelope(value: unknown, context: V2Context, admission: BasetenAdmission, knownUsage = parseBasetenLiveUsage(value, admission)): { proposal: ProposalResult; usage: BasetenUsage } {
  if (!record(value) || Object.keys(value).some((key) => !knownResponseFields.has(key)) || typeof value.id !== "string" || !value.id || value.object !== "response" || !safeCount(value.created_at) || value.status !== "completed" || value.model !== BASETEN_LIVE_PROFILE.model || (value.error !== undefined && value.error !== null) || (value.incomplete_details !== undefined && value.incomplete_details !== null) || !Array.isArray(value.output)) throw fail();
  if ((value.tools !== undefined && (!Array.isArray(value.tools) || value.tools.length !== 0)) ||
      (value.max_output_tokens !== undefined && (!safeCount(value.max_output_tokens) || value.max_output_tokens > BASETEN_LIVE_PROFILE.maxOutputTokens)) ||
      (value.parallel_tool_calls !== undefined && value.parallel_tool_calls !== false) ||
      (value.truncation !== undefined && value.truncation !== "disabled")) throw fail();
  const messages: Record<string, unknown>[] = [];
  for (const item of value.output) {
    if (!record(item)) throw fail();
    if (item.type === "reasoning") continue;
    if (item.type !== "message" || item.role !== "assistant" || item.status !== "completed" || !Array.isArray(item.content)) throw fail();
    messages.push(item);
  }
  const message = messages[0];
  if (messages.length !== 1 || !message || !Array.isArray(message.content) || message.content.length !== 1) throw fail();
  const content = message.content[0];
  if (!record(content) || content.type !== "output_text" || typeof content.text !== "string" || !content.text.trim()) throw fail();
  try { const parsed = JSON.parse(content.text); validateV2ProposalSchema(parsed); return { proposal: validateSuiteProposal(parsed, context), usage: knownUsage }; }
  catch { throw fail(); }
}

async function boundedJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > BASETEN_LIVE_PROFILE.maxResponseBytes)) throw fail();
  const reader = response.body?.getReader(); if (!reader) throw fail();
  const parts: Uint8Array[] = []; let bytes = 0;
  const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(fail()), { once: true }));
  try { while (true) { if (signal.aborted) throw fail(); const next = await Promise.race([reader.read(), aborted]); if (next.done) break; bytes += next.value.byteLength; if (bytes > BASETEN_LIVE_PROFILE.maxResponseBytes) throw fail(); parts.push(next.value); } return JSON.parse(Buffer.concat(parts).toString("utf8")); }
  catch { throw fail(); }
  finally { void reader.cancel().catch(() => {}); }
}

/** Read-only compatibility probe. It never dispatches to the generation endpoint. */
export async function probeBasetenInputCount(apiKey: string, body: string, admission: BasetenAdmission, fetcher: typeof fetch = fetch): Promise<number> {
  validateBasetenAdmission(admission);
  if (!apiKey || apiKey.length > 4096) throw fail();
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), BASETEN_LIVE_PROFILE.timeoutMs);
    try {
      const response = await fetcher(BASETEN_INPUT_COUNT_ENDPOINT, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body, signal: controller.signal });
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw fail(); }
      const value = await boundedJson(response, controller.signal);
      if (!record(value) || value.object !== "response.input_tokens" || !safeCount(value.input_tokens) || value.input_tokens === 0 || value.input_tokens > admission.maxAdmittedInputTokens) throw fail();
      return value.input_tokens;
    } catch { throw fail(); }
    finally { clearTimeout(timeout); controller.abort(); }
}

/** Live transport receives all authority from private constructor arguments, never caller input. */
export class BasetenLiveProposalService {
  readonly requiresAuthentication = true;
  readonly publicMetadata = Object.freeze({ provider: "baseten" as const, model: BASETEN_LIVE_PROFILE.model, protocol: "responses" as const, schemaEnforcement: "local" as const });
  private readonly admission: BasetenAdmission;
  constructor(private readonly ledger: BasetenLiveLedger, private readonly registry: ReviewerCodeRegistry, private readonly apiKey: string, admission: BasetenAdmission, private readonly fetcher: typeof fetch = fetch) {
    if (!apiKey || apiKey.length > 4096) throw fail(); this.admission = validateBasetenAdmission(admission);
  }
  async authenticate(header: string | undefined) { return this.registry.authenticate(header); }
  async authorize(header: string | undefined) { const principal = this.registry.authenticate(header); await this.ledger.preflight(principal); return principal; }

  async propose(context: V2Context, principal: ReviewerPrincipal): Promise<{ proposal: ProposalResult; reservationId: string; provenance: readonly string[] }> {
    if (!this.registry.owns(principal)) throw fail(); await this.ledger.preflight(principal);
    const snapshot = structuredClone(context); const request = buildBasetenLiveRequest(snapshot); const body = JSON.stringify(request); const requestDigest = digest(body);
    const inputTokens = await probeBasetenInputCount(this.apiKey, body, this.admission, this.fetcher);
    const reservationId = await this.ledger.reserve(principal, requestDigest, inputTokens);
    try {
      await this.ledger.beforeAttempt(reservationId, 1);
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), BASETEN_LIVE_PROFILE.timeoutMs);
      let envelope: unknown;
      try {
        const response = await this.fetcher(BASETEN_LIVE_PROFILE.endpoint, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` }, body, signal: controller.signal });
        if (!response.ok) { await response.body?.cancel().catch(() => {}); throw fail(); }
        envelope = await boundedJson(response, controller.signal);
      } catch { await this.ledger.block("transport-uncertain").catch(() => {}); throw fail(); }
      finally { clearTimeout(timeout); controller.abort(); }
      let usage: BasetenUsage;
      try { usage = parseBasetenLiveUsage(envelope, this.admission); }
      catch { await this.ledger.block("usage-missing").catch(() => {}); throw fail(); }
      try { await this.ledger.usage(reservationId, usage); }
      catch { await this.ledger.block("persistence-failure").catch(() => {}); throw fail(); }
      let parsed: { proposal: ProposalResult; usage: BasetenUsage };
      try { parsed = parseBasetenLiveEnvelope(envelope, snapshot, this.admission, usage); }
      catch { await this.ledger.block("usage-breach").catch(() => {}); throw fail(); }
      await this.ledger.finish(reservationId, parsed.proposal.kind);
      return { proposal: parsed.proposal, reservationId, provenance: ["baseten-responses-v1", "schema-locally-enforced", `model:${BASETEN_LIVE_PROFILE.model}`, `reservation:${reservationId}`] };
    } catch (error) { await this.ledger.finish(reservationId, "failed-or-uncertain").catch(() => {}); throw error instanceof BasetenLiveError ? error : fail(); }
  }
}
