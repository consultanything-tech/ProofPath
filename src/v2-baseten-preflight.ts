import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BASETEN_HACKATHON_MODEL, readBasetenInferenceCatalog } from "./v2-baseten-catalog.js";

/** One documented catalog GET only: it never counts, generates, reserves, or migrates. */
export async function preflightBaseten(apiKey: string, fetcher: typeof fetch = fetch) {
  let catalog;
  try { catalog = await readBasetenInferenceCatalog(apiKey, fetcher); }
  catch { return { ready: false as const, reason: "inference-catalog-unverified", catalogProfileVerified: false, exactInputAdmissionVerified: false, generationRequests: 0, modelGenerationVerified: false }; }
  return {
    ready: false as const, reason: "exact-input-count-unavailable", catalogProfileVerified: true,
    exactInputAdmissionVerified: false, model: BASETEN_HACKATHON_MODEL, candidateProtocol: "chat-completions",
    catalogDigest: catalog.catalogDigest, contextLength: catalog.contextLength,
    promptNanousdPerToken: catalog.promptNanousdPerToken,
    completionNanousdPerToken: catalog.completionNanousdPerToken,
    cacheReadNanousdPerToken: catalog.cacheReadNanousdPerToken,
    requestNanousd: catalog.requestNanousd, generationRequests: 0, modelGenerationVerified: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (async () => {
    const key = process.env.BASETEN_API_KEY;
    const result = key ? await preflightBaseten(key) : { ready: false, reason: "missing-BASETEN_API_KEY", catalogProfileVerified: false, exactInputAdmissionVerified: false, generationRequests: 0, modelGenerationVerified: false };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ready) process.exitCode = 2;
  })().catch(() => { process.stderr.write("Baseten preflight unavailable.\n"); process.exitCode = 2; });
}
