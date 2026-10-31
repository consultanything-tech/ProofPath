import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test from "node:test";
import { BASETEN_INPUT_COUNT_ENDPOINT, BASETEN_LIVE_PROFILE, BasetenLiveProposalService, buildBasetenLiveRequest, createBasetenAdmission, parseBasetenLiveEnvelope, parseBasetenLiveUsage, readBasetenModelProfile, type BasetenAdmission, type BasetenLiveLedger } from "../src/v2-baseten-live.js";
import { createV2Context } from "../src/v2-checkout.js";
import { createV2Planner } from "../src/v2-planner.js";
import { ReviewerCodeRegistry, type ReviewerPrincipal } from "../src/v2-proposal-budget.js";

async function admission(): Promise<BasetenAdmission> { return createBasetenAdmission(await readBasetenModelProfile("private-key", async () => response({ name: BASETEN_LIVE_PROFILE.model, context_length: 32_000, cost_per_million_input_tokens: "1.25", cost_per_million_output_tokens: "4.25" }))); }
async function envelope(context = createV2Context()) { const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context); return { id: "resp-live", object: "response", created_at: 1, status: "completed", model: BASETEN_LIVE_PROFILE.model, output: [{ type: "reasoning", summary: [] }, { type: "message", id: "msg", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }], usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18, input_tokens_details: { cached_tokens: 2 }, output_tokens_details: { reasoning_tokens: 2 } }, service_tier: "default", truncation: "disabled" }; }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }

class Ledger implements BasetenLiveLedger {
  readonly events: string[] = []; input = -1; digest = "";
  async preflight(_: ReviewerPrincipal) { this.events.push("preflight"); }
  async reserve(_: ReviewerPrincipal, digest: string, input: number) { this.events.push("reserve"); this.digest = digest; this.input = input; return "reservation-1"; }
  async beforeAttempt(_: string, attempt: 1) { this.events.push(`attempt:${attempt}`); }
  async usage(_: string, usage: { inputTokens: number }) { this.events.push(`usage:${usage.inputTokens}`); }
  async finish(_: string, status: "proposal" | "clarification" | "failed-or-uncertain") { this.events.push(`finish:${status}`); }
  async block(reason: "usage-missing" | "usage-breach" | "transport-uncertain" | "persistence-failure") { this.events.push(`block:${reason}`); }
}
function auth() { const pepper = randomBytes(32); const code = "a".repeat(24); const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, code)]); return { registry, principal: registry.authenticate(`Bearer ${code}`) }; }

test("fixed Baseten request is immutable and carries the schema plus local-enforcement instruction", () => {
  const request = buildBasetenLiveRequest(createV2Context()) as { model: string; tools: unknown[]; input: { content: { text: string }[] }[] };
  assert.equal(request.model, BASETEN_LIVE_PROFILE.model); assert.deepEqual(request.tools, []); assert.ok(Object.isFrozen(request));
  assert.match(request.input[0]!.content[0]!.text, /does not enforce|does not enforce/i); assert.match(request.input[0]!.content[0]!.text, /local schema/i);
  assert.throws(() => { request.model = "caller-selected"; }, TypeError);
});

test("admission derives the safe count cap from documented model metadata", async () => {
  const value = await admission(); assert.equal(value.maxAdmittedInputTokens, 26_073); assert.equal(value.reservationMicrousd, 50_000);
  await assert.rejects(readBasetenModelProfile("private-key", async () => response({ name: BASETEN_LIVE_PROFILE.model, context_length: 32_000, cost_per_million_input_tokens: "1.251", cost_per_million_output_tokens: "4.25" })), /unavailable/i);
});

test("usage is bounded independently from envelope identity and optional documented metadata is tolerated", async () => {
  const context = createV2Context(); const value = await envelope(context);
  const admitted = await admission(); assert.deepEqual(parseBasetenLiveUsage(value, admitted), { inputTokens: 10, outputTokens: 8, totalTokens: 18, reasoningTokens: 2, cachedInputTokens: 2 });
  assert.equal(parseBasetenLiveEnvelope(value, context, admitted).proposal.kind, "proposal");
  const wrong: Record<string, unknown> = structuredClone(value); wrong.model = "unverified-alias";
  assert.equal(parseBasetenLiveUsage(wrong, admitted).totalTokens, 18);
  assert.throws(() => parseBasetenLiveEnvelope(wrong, context, admitted), /unavailable/i);
  for (const usage of [{ input_tokens: -1 }, { output_tokens: 4097 }, { total_tokens: 17 }, { input_tokens_details: { cached_tokens: 11 } }]) {
    const changed = structuredClone(value); Object.assign(changed.usage, usage); assert.throws(() => parseBasetenLiveUsage(changed, admitted), /unavailable/i);
  }
});

test("service counts then reserves and dispatches exactly one fixed-body request", async () => {
  const context = createV2Context(); const calls: { url: string; init?: RequestInit }[] = []; const ledger = new Ledger(); const { registry, principal } = auth();
  const service = new BasetenLiveProposalService(ledger, registry, "private-key", await admission(), async (url, init) => { calls.push({ url: String(url), init }); return String(url) === BASETEN_INPUT_COUNT_ENDPOINT ? response({ object: "response.input_tokens", input_tokens: 99 }) : response(await envelope(context)); });
  const result = await service.propose(context, principal);
  assert.equal(result.proposal.kind, "proposal"); assert.equal(calls.length, 2); assert.equal(calls[0]!.url, BASETEN_INPUT_COUNT_ENDPOINT); assert.equal(calls[1]!.url, BASETEN_LIVE_PROFILE.endpoint);
  assert.equal(calls[0]!.init!.body, calls[1]!.init!.body); assert.equal(ledger.input, 99); assert.equal(ledger.digest, "sha256:" + createHash("sha256").update(calls[0]!.init!.body as string).digest("hex"));
  assert.deepEqual(ledger.events, ["preflight", "reserve", "attempt:1", "usage:10", "finish:proposal"]);
  assert.deepEqual(service.publicMetadata, { provider: "baseten", model: BASETEN_LIVE_PROFILE.model, protocol: "responses", schemaEnforcement: "local" });
});

test("unknown count endpoint or malformed usage prevents generation and latches the ledger", async () => {
  const { registry, principal } = auth(); const ledger = new Ledger(); let generation = 0;
  const noCount = new BasetenLiveProposalService(ledger, registry, "private-key", await admission(), async () => response({ error: "not supported" }, 404));
  await assert.rejects(noCount.propose(createV2Context(), principal), /unavailable/i); assert.equal(generation, 0); assert.deepEqual(ledger.events, ["preflight"]);
  const ledger2 = new Ledger(); const badUsage = await envelope(); badUsage.usage.total_tokens = 7;
  const malformed = new BasetenLiveProposalService(ledger2, registry, "private-key", await admission(), async (url) => { if (String(url) === BASETEN_INPUT_COUNT_ENDPOINT) return response({ object: "response.input_tokens", input_tokens: 10 }); generation += 1; return response(badUsage); });
  await assert.rejects(malformed.propose(createV2Context(), principal), /unavailable/i); assert.equal(generation, 1); assert.ok(ledger2.events.includes("block:usage-missing")); assert.ok(ledger2.events.includes("finish:failed-or-uncertain"));
});

test("context admission leaves room for all output and rejects forged or too-small profiles", async () => {
  const profile = await readBasetenModelProfile("synthetic-key", async () => response({ name: BASETEN_LIVE_PROFILE.model, context_length: 8192, cost_per_million_input_tokens: "1.25", cost_per_million_output_tokens: "4.25" }));
  const admitted = createBasetenAdmission(profile);
  assert.equal(admitted.maxAdmittedInputTokens + BASETEN_LIVE_PROFILE.maxOutputTokens, 8192);
  assert.throws(() => createBasetenAdmission(structuredClone(profile)), /unavailable/i);
  const tiny = await readBasetenModelProfile("synthetic-key", async () => response({ name: BASETEN_LIVE_PROFILE.model, context_length: 4096, cost_per_million_input_tokens: "1.25", cost_per_million_output_tokens: "4.25" }));
  assert.throws(() => createBasetenAdmission(tiny), /unavailable/i);
});

test("invalid model/content or echoed capabilities retain known usage and never retry", async () => {
  for (const fault of ["model", "schema", "tools"] as const) {
    const ledger = new Ledger(); const { registry, principal } = auth();
    const value: Record<string, unknown> = await envelope();
    if (fault === "model") value.model = "unexpected-model";
    if (fault === "tools") value.tools = [{ type: "function", name: "not-requested" }];
    if (fault === "schema") {
      const output = value.output as { content?: { text: string }[] }[];
      output[1]!.content![0]!.text = JSON.stringify({ privateMarker: "SYNTHETIC_PRIVATE_VALUE" });
    }
    let calls = 0;
    const service = new BasetenLiveProposalService(ledger, registry, "synthetic-key", await admission(), async (url) => {
      calls += 1;
      return String(url) === BASETEN_INPUT_COUNT_ENDPOINT ? response({ object: "response.input_tokens", input_tokens: 100 }) : response(value);
    });
    await assert.rejects(service.propose(createV2Context(), principal), (error: unknown) => {
      assert.equal((error as { status: number }).status, 503);
      assert.ok(!(error as Error).message.includes("SYNTHETIC_PRIVATE_VALUE")); return true;
    });
    assert.equal(calls, 2);
    assert.ok(ledger.events.indexOf("usage:10") < ledger.events.indexOf("block:usage-breach"));
    assert.equal(ledger.events.at(-1), "finish:failed-or-uncertain");
  }
});
