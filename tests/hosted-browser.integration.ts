import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { startHostedRuntime } from "../src/server.js";
import { V2Store } from "../src/v2-store.js";
import { initializeLiveOperator, openLiveOperator } from "../src/v2-operator.js";
import { LiveMetaProposalService } from "../src/v2-live-proposal.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner, V2_META_INPUT_TOKENS_ENDPOINT } from "../src/v2-planner.js";

async function port() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

test("hosted loopback fixture permits its own scripts and performs real checkout interactions", { timeout: 30_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "proofpath-hosted-browser-"));
  const publicPort = await port(); const fixturePort = await port();
  const runtime = await startHostedRuntime({
    PROOFPATH_RUNTIME: "hosted", V2_PLANNER_MODE: "fixture", PUBLIC_ORIGIN: "https://review.proofpath.test",
    PORT: String(publicPort), FIXTURE_PORT: String(fixturePort), DATA_DIR: dataDir, V2_OPERATOR_DIR: join(dataDir, "operator")
  });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${fixturePort}/v2-target/r1/index.html`);
    await page.locator('[data-sku="desk-lamp"]').click();
    await page.waitForFunction(() => document.querySelector("#subtotal-minor")?.textContent === "4000");
    await page.locator("#coupon").fill("SAVE10");
    await page.locator("#apply-coupon").click();
    await page.waitForFunction(() => document.querySelector("#discount-minor")?.textContent === "400");
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await runtime.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test("protected hosted workflow keeps execution internal and preserves quota and reports after restart", { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-hosted-protected-"));
  const publicPort = await port(); const fixturePort = await port();
  const publicOrigin = "https://review.proofpath.test";
  const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
  const operatorDir = join(root, "operator");
  await new V2Store(root).recoverInterruptedJobs();
  const initialized = await initializeLiveOperator(operatorDir);
  const code = initialized.reviewerCode;
  await initialized.ledger.close();
  let generationRequests = 0;
  let importedReservations = 0;
  const env = { PROOFPATH_RUNTIME: "hosted", V2_PLANNER_MODE: "meta", PUBLIC_ORIGIN: publicOrigin,
    PORT: String(publicPort), FIXTURE_PORT: String(fixturePort), DATA_DIR: root, V2_OPERATOR_DIR: operatorDir };
  const factory = async () => {
    const operator = await openLiveOperator(operatorDir);
    importedReservations = (await operator.ledger.snapshot()).reservations.length;
    const service = new LiveMetaProposalService(operator.ledger, operator.registry, "synthetic-hosted-test-key", async (url, init) => {
      if (url === V2_META_INPUT_TOKENS_ENDPOINT) return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 }));
      generationRequests += 1;
      const body = JSON.parse(init!.body as string);
      const source = JSON.parse(body.input[1].content[0].text).source.originalText;
      const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(withSourceRequirement(createV2Context(fixtureOrigin), source));
      return new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [
        { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }
      ], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } }));
    });
    return { service, operatorVersion: "2" as const, close: () => operator.close() };
  };
  const send = (path: string, body?: unknown, authenticated = true) => new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = request({ hostname: "127.0.0.1", port: publicPort, path, method: body === undefined ? "GET" : "POST", headers: {
      Host: new URL(publicOrigin).host, Origin: publicOrigin, "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${code}` } : {})
    } }, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => text += chunk);
      res.on("end", () => { let value; try { value = JSON.parse(text); } catch { value = text; } resolve({ status: res.statusCode!, body: value }); });
    });
    req.on("error", reject); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  let runtime;
  try {
    runtime = await startHostedRuntime(env, { createLiveServices: factory });
    assert.equal((await send("/api/v2/groundings", undefined, false)).status, 401);
    assert.equal(generationRequests, 0);
    const requirement = "Cart total must match unit prices. An invalid coupon must display an error. SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted subtotal S$75.00 or more. Contact fields are required before synthetic confirmation.";
    const proposed = await send("/api/v2/proposals", { requirement, releases: ["r1", "r2"] });
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    assert.equal(proposed.body.context.app.origin, fixtureOrigin);
    const proposal = proposed.body.proposal;
    const review = { decisions: proposal.requirement.criteria.map((criterion: any) => ({
      criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged",
      adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposal.gaps, acceptedNumericRuleChanges: []
    })) };
    const suite = await send(`/api/v2/proposals/${proposed.body.id}/review`, { review });
    assert.equal(suite.status, 201, JSON.stringify(suite.body));
    const approval = await send(`/api/v2/suites/${suite.body.id}/approve`, {});
    assert.equal(approval.status, 200);
    const started = await send(`/api/v2/approvals/${approval.body.id}/runs`, {});
    assert.equal(started.status, 202);
    let run = await send(`/api/v2/runs/${started.body.runId}`);
    for (let n = 0; n < 500 && run.body.status !== "completed"; n += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      run = await send(`/api/v2/runs/${started.body.runId}`);
    }
    assert.equal(run.body.status, "completed");
    assert.equal(run.body.candidateVerdict, "FAIL");
    assert.ok(JSON.stringify(run.body).includes(fixtureOrigin));
    assert.equal(generationRequests, 1);
    await runtime.close(); runtime = undefined;
    runtime = await startHostedRuntime(env, { createLiveServices: factory });
    assert.equal(importedReservations, 1);
    assert.equal((await send(`/api/v2/runs/${started.body.runId}`, undefined, false)).status, 401);
    const reopened = await send(`/api/v2/runs/${started.body.runId}`);
    assert.equal(reopened.body.approvalDigest, run.body.approvalDigest);
    assert.equal(reopened.body.candidateVerdict, "FAIL");
    assert.match((await send(`/api/v2/runs/${started.body.runId}/bug-packet`)).body, /ProofPath bug packet/);
    assert.equal(generationRequests, 1);
  } finally { await runtime?.close(); await rm(root, { recursive: true, force: true }); }
});
