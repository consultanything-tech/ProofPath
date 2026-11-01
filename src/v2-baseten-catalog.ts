import { createHash } from "node:crypto";

export const BASETEN_HACKATHON_MODEL = "meta-models/muse-spark-open-1026" as const;
export const BASETEN_INFERENCE_MODELS_ENDPOINT = "https://inference.baseten.co/v1/models" as const;

const MAX_RESPONSE_BYTES = 65_536;
const TIMEOUT_MS = 30_000;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safePositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
const fail = () => new BasetenCatalogError();

export class BasetenCatalogError extends Error {
  constructor() { super("Baseten inference catalog is unavailable."); }
}

export type BasetenInferenceCatalogProfile = Readonly<{
  readonly model: typeof BASETEN_HACKATHON_MODEL;
  readonly contextLength: number;
  readonly promptNanousdPerToken: number;
  readonly completionNanousdPerToken: number;
  readonly cacheReadNanousdPerToken: number;
  readonly requestNanousd: number;
  readonly catalogDigest: `sha256:${string}`;
}>;

/**
 * This intentionally returns plain read-only catalog evidence, never an admission
 * certificate. A catalog row does not prove the hosted endpoint's exact input
 * accounting or authorize a generation request.
 */
export async function readBasetenInferenceCatalog(apiKey: string, fetcher: typeof fetch = fetch): Promise<BasetenInferenceCatalogProfile> {
  if (!apiKey || apiKey.length > 4096) throw fail();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher(BASETEN_INFERENCE_MODELS_ENDPOINT, {
      method: "GET",
      redirect: "error",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw fail(); }
    const raw = await boundedText(response, controller.signal);
    const value = parseJson(raw);
    if (!record(value) || !Array.isArray(value.data)) throw fail();
    const matches = value.data.filter((item): item is Record<string, unknown> => record(item) && item.id === BASETEN_HACKATHON_MODEL);
    if (matches.length !== 1) throw fail();
    const match = matches[0]!;
    if (!safePositiveInteger(match.context_length) || !record(match.pricing)) throw fail();
    const promptNanousdPerToken = decimalUsdToNanousd(match.pricing.prompt);
    const completionNanousdPerToken = decimalUsdToNanousd(match.pricing.completion);
    const cacheReadNanousdPerToken = decimalUsdToNanousd(match.pricing.input_cache_read);
    const requestNanousd = decimalUsdToNanousd(match.pricing.request);
    if (promptNanousdPerToken < 1 || promptNanousdPerToken > 1_250 ||
        completionNanousdPerToken < 1 || completionNanousdPerToken > 4_250 ||
        cacheReadNanousdPerToken < 0 || cacheReadNanousdPerToken > promptNanousdPerToken ||
        requestNanousd !== 0) throw fail();
    return freeze({
      model: BASETEN_HACKATHON_MODEL,
      contextLength: match.context_length,
      promptNanousdPerToken,
      completionNanousdPerToken,
      cacheReadNanousdPerToken,
      requestNanousd,
      catalogDigest: digest(raw)
    });
  } catch (error) {
    if (error instanceof BasetenCatalogError) throw error;
    throw fail();
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw fail(); }
}

function decimalUsdToNanousd(value: unknown): number {
  const text = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text)) throw fail();
  const [whole, fraction = ""] = text.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const units = BigInt(whole) * scale + BigInt(fraction || "0");
  const numerator = units * 1_000_000_000n;
  const rounded = (numerator + scale - 1n) / scale;
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw fail();
  return Number(rounded);
}

async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw fail();
  const reader = response.body?.getReader();
  if (!reader) throw fail();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(fail()), { once: true }));
  try {
    while (true) {
      if (signal.aborted) throw fail();
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw fail();
      parts.push(next.value);
    }
    return Buffer.concat(parts).toString("utf8");
  } catch {
    throw fail();
  } finally {
    void reader.cancel().catch(() => {});
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as object)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
