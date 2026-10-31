import assert from "node:assert/strict";
import test from "node:test";
import { preflightBaseten } from "../src/v2-baseten-preflight.js";
import { BASETEN_INPUT_COUNT_ENDPOINT, BASETEN_LIVE_PROFILE, BASETEN_MODEL_METADATA_ENDPOINT } from "../src/v2-baseten-live.js";

const metadata = () => new Response(JSON.stringify({ name: BASETEN_LIVE_PROFILE.model, context_length: 1_048_576,
  cost_per_million_input_tokens: "1.25", cost_per_million_output_tokens: "4.25" }));

test("Baseten preflight reports only safe admission evidence and never generates or migrates", async () => {
  const seen: unknown[] = [];
  const result = await preflightBaseten("synthetic-key-never-print", async (url) => {
    seen.push(url);
    if (url === BASETEN_MODEL_METADATA_ENDPOINT) return metadata();
    if (url === BASETEN_INPUT_COUNT_ENDPOINT) return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 2100 }));
    throw new Error("No generation endpoint is permitted");
  });
  assert.equal(result.ready, true); assert.equal(result.generationRequests, 0);
  assert.ok(!JSON.stringify(result).includes("synthetic-key-never-print"));
  if (result.ready) { assert.equal(result.modelGenerationVerified, false); assert.ok(result.worstCaseMicrousd <= 50_000); assert.match(result.requestDigest, /^sha256:/); }
  assert.deepEqual(seen, [BASETEN_MODEL_METADATA_ENDPOINT, BASETEN_INPUT_COUNT_ENDPOINT]);
});

test("missing metadata or unsupported counting is a non-generating readiness failure", async () => {
  const unavailable = await preflightBaseten("synthetic", async () => new Response("do not expose private diagnostics", { status: 401 }));
  assert.deepEqual(unavailable, { ready: false, reason: "model-metadata-unverified", generationRequests: 0 });
  const noCount = await preflightBaseten("synthetic", async (url) => url === BASETEN_MODEL_METADATA_ENDPOINT ? metadata() : new Response("unsupported", { status: 404 }));
  assert.deepEqual(noCount, { ready: false, reason: "exact-input-count-unverified", generationRequests: 0 });
});
