import assert from "node:assert/strict";
import test from "node:test";
import { preflightBaseten } from "../src/v2-baseten-preflight.js";
import { BASETEN_HACKATHON_MODEL, BASETEN_INFERENCE_MODELS_ENDPOINT, readBasetenInferenceCatalog } from "../src/v2-baseten-catalog.js";
import { validateBasetenAdmission } from "../src/v2-baseten-live.js";

const catalog = (rows: unknown[] = [{ id: BASETEN_HACKATHON_MODEL, context_length: 1_048_576, pricing: { prompt: "0.00000125", completion: "0.00000425", input_cache_read: "0.00000015", request: "0" } }]) => new Response(JSON.stringify({ object: "list", data: rows }));

test("Baseten catalog preflight makes one GET and remains non-ready without generation", async () => {
  const seen: Array<{ url: unknown; init: RequestInit | undefined }> = [];
  const result = await preflightBaseten("synthetic-key-never-print", async (url, init) => {
    seen.push({ url, init });
    if (url === BASETEN_INFERENCE_MODELS_ENDPOINT) return catalog();
    throw new Error("Only the catalog endpoint is permitted");
  });
  assert.equal(result.ready, false); assert.equal(result.reason, "exact-input-count-unavailable");
  assert.equal(result.catalogProfileVerified, true); assert.equal(result.exactInputAdmissionVerified, false);
  assert.equal(result.generationRequests, 0); assert.equal(result.modelGenerationVerified, false);
  assert.ok(!JSON.stringify(result).includes("synthetic-key-never-print"));
  assert.equal(result.model, BASETEN_HACKATHON_MODEL); assert.equal(result.candidateProtocol, "chat-completions");
  assert.equal(seen.length, 1); assert.equal(seen[0]!.url, BASETEN_INFERENCE_MODELS_ENDPOINT);
  assert.equal(seen[0]!.init?.method, "GET"); assert.equal((seen[0]!.init?.headers as Record<string, string>).Authorization, "Bearer synthetic-key-never-print");
});

test("catalog failures are sanitized non-generating readiness failures", async () => {
  const unavailable = await preflightBaseten("synthetic", async () => new Response("do not expose private diagnostics", { status: 401 }));
  assert.deepEqual(unavailable, { ready: false, reason: "inference-catalog-unverified", catalogProfileVerified: false, exactInputAdmissionVerified: false, generationRequests: 0, modelGenerationVerified: false });
});

test("catalog validation rejects alias ambiguity and unsafe pricing without issuing another request", async () => {
  const exact = { id: BASETEN_HACKATHON_MODEL, context_length: 1_048_576, pricing: { prompt: "0.00000125", completion: "0.00000425", input_cache_read: "0", request: "0" } };
  const cases = [
    [{ ...exact, id: "meta-models/muse-spark-open" }],
    [exact, exact],
    [{ ...exact, context_length: 0 }],
    [{ ...exact, pricing: { completion: "0.00000425", input_cache_read: "0", request: "0" } }],
    [{ ...exact, pricing: { ...exact.pricing, prompt: "not-a-rate" } }],
    [{ ...exact, pricing: { ...exact.pricing, prompt: "0.000001251" } }],
    [{ ...exact, pricing: { ...exact.pricing, completion: "0.000004251" } }],
    [{ ...exact, pricing: { ...exact.pricing, request: "0.000000001" } }],
    [{ ...exact, pricing: { ...exact.pricing, input_cache_read: "0.00000126" } }]
  ];
  for (const rows of cases) {
    const result = await preflightBaseten("synthetic", async () => catalog(rows));
    assert.equal(result.reason, "inference-catalog-unverified");
    assert.equal(result.generationRequests, 0);
  }
});

test("catalog rejects malformed bodies and oversize declarations", async () => {
  const malformed = await preflightBaseten("synthetic", async () => new Response("{not-json"));
  assert.equal(malformed.reason, "inference-catalog-unverified");
  const oversized = await preflightBaseten("synthetic", async () => new Response("{}", { headers: { "content-length": "65537" } }));
  assert.equal(oversized.reason, "inference-catalog-unverified");
});

test("plain catalog evidence cannot be used as a branded live admission", async () => {
  const profile = await readBasetenInferenceCatalog("synthetic", async () => catalog());
  assert.throws(() => validateBasetenAdmission(profile));
});
