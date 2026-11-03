import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LIVE_LEDGER_V3_POLICY } from "../src/v2-live-ledger-v3.js";
import { createControlledLiveServices } from "../src/v2-live-bootstrap.js";
import { initializeLiveOperatorV3, openLiveOperatorV3 } from "../src/v2-operator-v3.js";
import { BASETEN_INPUT_COUNT_ENDPOINT, BASETEN_LIVE_PROFILE, BASETEN_MODEL_METADATA_ENDPOINT } from "../src/v2-baseten-live.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner, V2_META_INPUT_TOKENS_ENDPOINT, V2_META_RESPONSES_ENDPOINT } from "../src/v2-planner.js";

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "proofpath-live-bootstrap-"));
  const dir = join(root, "operator");
  const initialized = await initializeLiveOperatorV3(dir);
  await initialized.ledger.close();
  return { root, dir, code: initialized.reviewerCode };
}
const context = () => withSourceRequirement(createV2Context(), "An invalid coupon must display an error.");
async function response(model: string) {
  const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context());
  return new Response(JSON.stringify({ id: "resp_test", object: "response", created_at: 1,
    status: "completed", model,
    output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal), annotations: [] }] }],
    usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 2 } }
  }));
}
function modelMetadata() {
  return new Response(JSON.stringify({ name: BASETEN_LIVE_PROFILE.model, context_length: 1_048_576,
    cost_per_million_input_tokens: "1.25", cost_per_million_output_tokens: "4.25" }));
}
function environment(dir: string, mode: "meta" | "baseten"): NodeJS.ProcessEnv {
  return { V2_OPERATOR_DIR: dir, V2_PLANNER_MODE: mode, MODEL_API_KEY: "synthetic-meta-key", BASETEN_API_KEY: "synthetic-baseten-key" };
}

test("startup provider switches share one reviewer quota and preserve authenticated reads after exhaustion", async () => {
  const f = await setup(); let counts = 0; let generations = 0;
  const fetcher: typeof fetch = async (url) => {
    if (url === BASETEN_MODEL_METADATA_ENDPOINT) return modelMetadata();
    if (url === BASETEN_INPUT_COUNT_ENDPOINT || url === V2_META_INPUT_TOKENS_ENDPOINT) {
      counts += 1; return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 }));
    }
    assert.ok(url === BASETEN_LIVE_PROFILE.endpoint || url === V2_META_RESPONSES_ENDPOINT);
    generations += 1;
    return response(url === BASETEN_LIVE_PROFILE.endpoint ? BASETEN_LIVE_PROFILE.model : "muse-spark-1.3");
  };
  try {
    for (const mode of Array.from({ length: LIVE_LEDGER_V3_POLICY.reviewerLimit }, (_, index) => (["meta", "baseten", "meta"] as const)[index % 3]!)) {
      const live = await createControlledLiveServices(environment(f.dir, mode), fetcher);
      try {
        const principal = await live.service.authorize(`Bearer ${f.code}`);
        const proposed = await live.service.propose(context(), principal);
        assert.equal(proposed.proposal.kind, "proposal");
        assert.equal(live.operatorVersion, "3");
      } finally { await live.close(); }
    }
    const exhausted = await createControlledLiveServices(environment(f.dir, "baseten"), fetcher);
    try {
      await assert.rejects(exhausted.service.authorize(`Bearer ${f.code}`), (error: unknown) => {
        assert.equal((error as { status: number }).status, 429); return true;
      });
      await exhausted.service.authenticate(`Bearer ${f.code}`);
    } finally { await exhausted.close(); }
    assert.equal(counts, LIVE_LEDGER_V3_POLICY.reviewerLimit); assert.equal(generations, LIVE_LEDGER_V3_POLICY.reviewerLimit);
    const operator = await openLiveOperatorV3(f.dir);
    try {
      const saved = await operator.ledger.snapshot();
      assert.deepEqual(saved.reservations.slice(0, 3).map((item) => item.provider), ["meta", "baseten", "meta"]);
      assert.equal(saved.reservations.length * saved.policy.reservationMicrousd, LIVE_LEDGER_V3_POLICY.reviewerLimit * LIVE_LEDGER_V3_POLICY.reservationMicrousd);
      assert.deepEqual(saved.reservations[1]!.attempts[0]!.usage, { inputTokens: 100, outputTokens: 10, totalTokens: 110 });
    } finally { await operator.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("an unsupported Baseten count endpoint prevents generation and reservation without provider fallback", async () => {
  const f = await setup(); const seen: unknown[] = [];
  const fetcher: typeof fetch = async (url) => {
    seen.push(url);
    if (url === BASETEN_MODEL_METADATA_ENDPOINT) return modelMetadata();
    if (url === BASETEN_INPUT_COUNT_ENDPOINT) return new Response("private diagnostic must not escape", { status: 404 });
    throw new Error("Generation or fallback must not occur");
  };
  try {
    const live = await createControlledLiveServices(environment(f.dir, "baseten"), fetcher);
    try {
      await assert.rejects(live.service.propose(context(), await live.service.authorize(`Bearer ${f.code}`)), (error: unknown) => {
        assert.ok(error instanceof Error); assert.ok(!error.message.includes("private diagnostic")); return true;
      });
    } finally { await live.close(); }
    assert.deepEqual(seen, [BASETEN_MODEL_METADATA_ENDPOINT, BASETEN_INPUT_COUNT_ENDPOINT]);
    const operator = await openLiveOperatorV3(f.dir);
    try { assert.equal((await operator.ledger.snapshot()).reservations.length, 0); }
    finally { await operator.close(); }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
