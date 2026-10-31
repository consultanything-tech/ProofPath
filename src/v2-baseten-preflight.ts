import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createV2Context, withSourceRequirement } from "./v2-checkout.js";
import { BASETEN_LIVE_PROFILE, buildBasetenLiveRequest, createBasetenAdmission, probeBasetenInputCount, readBasetenModelProfile } from "./v2-baseten-live.js";

/** No ledger migration or generation: only fixed model metadata and input-count reads. */
export async function preflightBaseten(apiKey: string, fetcher: typeof fetch = fetch) {
  let profile;
  try { profile = await readBasetenModelProfile(apiKey, fetcher); }
  catch { return { ready: false as const, reason: "model-metadata-unverified", generationRequests: 0 }; }
  let admission;
  try { admission = createBasetenAdmission(profile); }
  catch { return { ready: false as const, reason: "profile-outside-approved-bound", generationRequests: 0 }; }
  const context = withSourceRequirement(createV2Context(), "SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted subtotal S$75.00 or more. Verify delivery when applying the coupon changes a cart's free-delivery eligibility.");
  const body = JSON.stringify(buildBasetenLiveRequest(context));
  let inputTokens;
  try { inputTokens = await probeBasetenInputCount(apiKey, body, admission, fetcher); }
  catch { return { ready: false as const, reason: "exact-input-count-unverified", generationRequests: 0 }; }
  return {
    ready: true as const, model: BASETEN_LIVE_PROFILE.model, protocol: "responses",
    requestDigest: `sha256:${createHash("sha256").update(body).digest("hex")}`,
    metadataDigest: profile.metadataDigest, contextLength: profile.effectiveContextLength,
    admittedInputTokens: inputTokens, maxInputTokens: admission.maxAdmittedInputTokens,
    maxOutputTokens: BASETEN_LIVE_PROFILE.maxOutputTokens,
    inputNanousdPerToken: profile.inputNanousdPerToken, outputNanousdPerToken: profile.outputNanousdPerToken,
    worstCaseMicrousd: Math.ceil((inputTokens * profile.inputNanousdPerToken + BASETEN_LIVE_PROFILE.maxOutputTokens * profile.outputNanousdPerToken) / 1000),
    reservedMicrousd: 50_000, generationRequests: 0, modelGenerationVerified: false
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void (async () => {
    const key = process.env.BASETEN_API_KEY;
    const result = key ? await preflightBaseten(key) : { ready: false, reason: "missing-BASETEN_API_KEY", generationRequests: 0 };
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!result.ready) process.exitCode = 2;
  })().catch(() => { process.stderr.write("Baseten preflight unavailable.\n"); process.exitCode = 2; });
}
