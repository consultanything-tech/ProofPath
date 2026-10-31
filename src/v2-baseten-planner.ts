import { createHash } from "node:crypto";
import { buildV2ProposalPrompt, validateSuiteProposal, validateV2ProposalSchema } from "./v2-planner.js";
import type { ProposalResult, V2Context } from "./v2-contracts.js";

export const BASETEN_QUALIFICATION_MODEL = "meta-models/muse-spark-open-1026" as const;
export const BASETEN_QUALIFICATION_MAX_OUTPUT_TOKENS = 4096;
export const BASETEN_QUALIFICATION_MAX_RESPONSE_BYTES = 65_536;
export class BasetenQualificationError extends Error {}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as object)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const invalid = (part: string) => new BasetenQualificationError(`Baseten qualification returned invalid ${part}.`);

/** Provisional protocol contract only: no endpoint, credential or dispatch. */
export function buildBasetenQualificationRequest(context: V2Context): Readonly<object> {
  const prompt = structuredClone(buildV2ProposalPrompt(context));
  return freeze({
    model: BASETEN_QUALIFICATION_MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: `${prompt.developer} Return only one complete JSON object matching this schema: ${JSON.stringify(prompt.schema)}` }] },
      { role: "user", content: [{ type: "input_text", text: JSON.stringify(prompt.user) }] }
    ],
    text: { format: { type: "json_schema", name: "proofpath_v2_suite", strict: true, schema: prompt.schema } },
    reasoning: { effort: "low" },
    max_output_tokens: BASETEN_QUALIFICATION_MAX_OUTPUT_TOKENS,
    tools: [], stream: false, truncation: "disabled"
  });
}

export const basetenQualificationDigest = (request: object) => `sha256:${createHash("sha256").update(JSON.stringify(request)).digest("hex")}`;
export type BasetenQualificationUsage = Readonly<{ inputTokens: number; outputTokens: number; totalTokens: number; reasoningTokens: number }>;

/** Independent of model/content acceptance so known usage can be journaled first. */
export function readBasetenQualificationUsage(value: unknown): BasetenQualificationUsage {
  if (!record(value) || !record(value.usage)) throw invalid("usage");
  const usage = value.usage;
  if (!exact(usage, ["input_tokens", "output_tokens", "total_tokens", "output_tokens_details"]) ||
      !count(usage.input_tokens) || !count(usage.output_tokens) || !count(usage.total_tokens) ||
      usage.total_tokens !== usage.input_tokens + usage.output_tokens ||
      !record(usage.output_tokens_details) || !exact(usage.output_tokens_details, ["reasoning_tokens"]) ||
      !count(usage.output_tokens_details.reasoning_tokens) ||
      usage.output_tokens > BASETEN_QUALIFICATION_MAX_OUTPUT_TOKENS || usage.output_tokens_details.reasoning_tokens > usage.output_tokens) throw invalid("usage");
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens, reasoningTokens: usage.output_tokens_details.reasoning_tokens };
}

/** Strict provisional envelope. Unsupported real-provider extras require review. */
export function parseBasetenQualificationEnvelope(value: unknown, context: V2Context): { proposal: ProposalResult; usage: BasetenQualificationUsage; returnedModel: string } {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(value); } catch { throw invalid("envelope"); }
  if (encoded === undefined || Buffer.byteLength(encoded) > BASETEN_QUALIFICATION_MAX_RESPONSE_BYTES) throw invalid("envelope");
  const usage = readBasetenQualificationUsage(value);
  if (!record(value) || !exact(value, ["id", "object", "created_at", "status", "model", "output", "usage"]) ||
      typeof value.id !== "string" || !value.id || value.id.length > 256 || !count(value.created_at) ||
      value.object !== "response" || value.status !== "completed" || value.model !== BASETEN_QUALIFICATION_MODEL || !Array.isArray(value.output)) throw invalid("envelope");
  // Reasoning is intentionally neither returned nor persisted. Only its token total is used.
  if (value.output.length > 2 || !value.output.every((item) => record(item) &&
      ((item.type === "reasoning" && Object.keys(item).every((key) => ["type", "id", "summary", "content"].includes(key))) ||
       (item.type === "message" && item.role === "assistant")))) throw invalid("unsupported output");
  const messages = value.output.filter((item): item is Record<string, unknown> => record(item) && item.type === "message");
  if (messages.length !== 1 || !exact(messages[0]!, ["type", "id", "role", "status", "content"]) ||
      typeof messages[0]!.id !== "string" || !messages[0]!.id || (messages[0]!.id as string).length > 256 ||
      messages[0]!.status !== "completed" || !Array.isArray(messages[0]!.content) || messages[0]!.content.length !== 1) throw invalid("incomplete output");
  const content: unknown = messages[0]!.content[0];
  if (!record(content) || !exact(content, ["type", "text"]) || content.type !== "output_text" || typeof content.text !== "string" || !content.text.trim()) throw invalid("incomplete output");
  try {
    const parsed: unknown = JSON.parse(content.text);
    validateV2ProposalSchema(parsed);
    return { proposal: validateSuiteProposal(parsed, context), usage, returnedModel: value.model };
  } catch { throw invalid("suite"); }
}
