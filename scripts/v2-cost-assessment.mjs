// Offline only: imports request construction, never credentials or a transport.
// Run after pnpm build: node scripts/v2-cost-assessment.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildMetaSuiteRequest } from "../dist/src/v2-planner.js";
import { createV2Context, withSourceRequirement } from "../dist/src/v2-checkout.js";

const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
const base = createV2Context();
const clause = "cart coupon delivery email " + "\u0000".repeat(971) + ".";
const boundarySource = Array(4).fill(clause).join(" ");
assert.equal(clause.length, 999);
assert.equal(boundarySource.length, 3999);
const boundary = withSourceRequirement(base, boundarySource);
assert.equal(boundary.requirement.criteria.length, 6);
const example = withSourceRequirement(base, "SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted subtotal S$75.00 or more.");

// This independently maximizes serialized source fields. It deliberately
// overcounts their correlation in withSourceRequirement; it is an upper
// envelope for HTTP JSON bytes, not a reachable maximum or a token count.
const upperEnvelope = {
  ...base,
  requirement: {
    ...base.requirement,
    originalText: "\u0000".repeat(4000),
    criteria: Array.from({ length: 6 }, (_, index) => ({
      id: `delivery-${index + 1}`,
      sourceQuote: "\u0000".repeat(1000),
      normalizedRule: "Not transmitted."
    }))
  }
};
const request = buildMetaSuiteRequest(base);
const outputCap = request.max_completion_tokens;
assert.equal(outputCap, 4096);
const rate = { inputUsdPerMillion: 1.25, outputUsdPerMillion: 4.25 };
const reserveUsd = 0.05;
const outputUsd = outputCap * rate.outputUsdPerMillion / 1e6;
const maxPromptTokens = (attempts) => Math.floor((reserveUsd / attempts - outputUsd) * 1e6 / rate.inputUsdPerMillion);
const size = (context) => {
  const request = buildMetaSuiteRequest(context);
  return {
    httpJsonBytes: bytes(request),
    messageContentUtf8Bytes: request.messages.reduce((sum, message) => sum + Buffer.byteLength(message.content), 0),
    schemaJsonBytes: bytes(request.response_format.json_schema.schema)
  };
};
const sourceHash = createHash("sha256").update(await readFile(new URL("../src/v2-planner.ts", import.meta.url))).digest("hex");
console.log(JSON.stringify({
  status: "BLOCKED: no verified billable-input token bound or durable proposal budget accounting",
  model: request.model,
  plannerSourceSha256: sourceHash,
  pricesCheckedSgtDate: "2026-10-30",
  pricingSource: "https://dev.meta.ai/docs/pricing-rate-limits",
  tokenAccountingSource: "https://dev.meta.ai/docs/token-counting",
  rate,
  selectedTargets: { reserveUsd, globalProposals: 50, totalUsd: 2.5, perCodeProposals: 3 },
  completionTokenCapPerAttempt: outputCap,
  maximumAttempts: 2,
  outputOnlyUsd: { oneAttempt: outputUsd, twoAttempts: 2 * outputUsd },
  largestEqualBillablePromptTokensPerAttemptWithinReserve: { oneAttempt: maxPromptTokens(1), twoAttempts: maxPromptTokens(2) },
  requestSizes: { ordinaryExample: size(example), acceptedEscapedBoundary: size(boundary), independentFieldUpperEnvelope: size(upperEnvelope) },
  notes: [
    "Bytes are measured offline; bytes/4 or bytes/token is not a verified Meta tokenizer or billing bound.",
    "The upper envelope concerns current registered HTTP request construction only; remeasure after any schema/registry change.",
    "No cache discount assumed. Reasoning tokens are a subset of completion tokens, not an extra output allowance.",
    "Two attempts conservatively reserve for both full calls, including an ambiguous network failure.",
    "The provider count endpoint measures rendered Responses context; it is not Chat Completions billable usage.",
    "No provider request, key read, billing inspection, or live-mode activation performed."
  ]
}, null, 2));
