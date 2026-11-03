import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createProofPathServer } from "../src/server.js";
import { createPlanner } from "../src/planner.js";
import { initializeLiveOperator, openLiveOperator } from "../src/v2-operator.js";
import { LiveMetaProposalService } from "../src/v2-live-proposal.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner, V2_META_INPUT_TOKENS_ENDPOINT } from "../src/v2-planner.js";

test("controlled workbench keeps codes private and reopens/downloads after proposal exhaustion", { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-controlled-ui-"));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = root;
  const initialized = await initializeLiveOperator(join(root, "operator"));
  const code = initialized.reviewerCode; await initialized.ledger.close();
  const operator = await openLiveOperator(join(root, "operator"));
  const probe = createServer(); await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  let counts = 0; let generations = 0;
  let inspectionUnavailable = false;
  const service = new LiveMetaProposalService(operator.ledger, operator.registry, "synthetic-key", async (url, init) => {
    if (url === V2_META_INPUT_TOKENS_ENDPOINT) { counts += 1; return new Response(JSON.stringify({ object: "response.input_tokens", input_tokens: 100 })); }
    generations += 1;
    const body = JSON.parse(init!.body as string);
    const source = JSON.parse(body.input[1].content[0].text).source.originalText;
    const proposal = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(withSourceRequirement(createV2Context(), source));
    return new Response(JSON.stringify({ model: "muse-spark-1.3", status: "completed", output: [
      { type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }
    ], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } }));
  });
  const instance = createProofPathServer(address.port, createPlanner({ PLANNER_MODE: "fixture" }), {
    controlledMeta: true, proposalService: service, inspect: async (context) => {
      if (inspectionUnavailable) throw new Error("private-browser-diagnostic");
      return context.grounding;
    }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(address.port, "127.0.0.1", resolve));
    inspectionUnavailable = true;
    const unavailable = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers: {
      "Content-Type": "application/json", Origin: instance.origin, Authorization: "Bearer " + code
    }, body: JSON.stringify({ requirement: "An invalid coupon must display an error.", releases: ["r1", "r2"] }) });
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "Registered target inspection is unavailable." });
    assert.equal(counts, 0); assert.equal(generations, 0);
    inspectionUnavailable = false;
    assert.equal((await fetch(instance.origin + "/api/plans", { method: "POST" })).status, 401);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(10_000);
    await page.goto(instance.origin + "/workbench.html");
    await page.locator("#v2-reviewer-code").waitFor({ state: "visible" });
    assert.equal(await page.locator("#v2-reviewer-code").getAttribute("type"), "password");
    await page.locator("#v2-reviewer-code").fill(code);
    await page.getByRole("button", { name: "Unlock Meta testing" }).click();
    await page.getByText(/Meta testing is unlocked/).waitFor();
    const requirement = await page.locator("#v2-requirement").inputValue();
    const proposed = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v2/proposals");
    await page.getByRole("button", { name: "Generate test plan with Meta" }).click();
    const response = await proposed;
    assert.ok(response.request().headers().authorization === "Bearer " + code);
    assert.ok(!response.request().postData()!.includes(code));
    await page.getByRole("heading", { name: "2. Review the test plan" }).waitFor();
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Continue to approval" }).click();
    await page.getByRole("heading", { name: "3. Approve and run" }).waitFor();
    await page.getByRole("button", { name: "Approve this test plan" }).click();
    await page.getByRole("button", { name: "Run approved test" }).click();
    await page.getByText("Run completed. Review the result, then save or download the evidence if useful.").waitFor({ timeout: 45_000 });
    const reportLink = await page.getByRole("link", { name: "Open this report" }).getAttribute("href");
    const reportId = new URL(reportLink!, instance.origin).searchParams.get("run")!;
    assert.equal((await fetch(instance.origin + "/api/v2/runs/" + reportId)).status, 401);
    for (let extra = 0; extra < 2; extra += 1) {
      const result = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers: {
        "Content-Type": "application/json", Origin: instance.origin, Authorization: "Bearer " + code
      }, body: JSON.stringify({ requirement, releases: ["r1", "r2"] }) });
      assert.equal(result.status, 201);
    }
    const exhausted = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers: {
      "Content-Type": "application/json", Origin: instance.origin, Authorization: "Bearer " + code
    }, body: JSON.stringify({ requirement, releases: ["r1", "r2"] }) });
    assert.equal(exhausted.status, 429); assert.equal(counts, 3); assert.equal(generations, 3);
    await page.goto(instance.origin + reportLink);
    await page.locator("#v2-reviewer-code").waitFor({ state: "visible" });
    assert.equal(await page.locator("#v2-reviewer-code").inputValue(), "");
    await page.locator("#v2-reviewer-code").fill(code);
    await page.getByRole("button", { name: "Unlock Meta testing" }).click();
    await page.getByText("Loaded persisted read-only run report.").waitFor();
    for (const [name, expected] of [["Download bug packet", "# ProofPath bug packet"], ["Download Playwright export", "node:assert/strict"]] as const) {
      const download = page.waitForEvent("download");
      await page.getByRole("link", { name }).click();
      const file = await download; const path = await file.path(); assert.ok(path);
      const text = await readFile(path, "utf8");
      assert.ok(text.includes(expected)); assert.ok(!text.includes(code)); assert.ok(!text.includes("synthetic-key"));
    }
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: "Open verified screenshot" }).first().click();
    const screenshot = await downloaded; const path = await screenshot.path(); assert.ok(path);
    assert.equal((await readFile(path)).subarray(1, 4).toString(), "PNG");
    assert.equal(counts, 3); assert.equal(generations, 3);
    assert.ok(!page.url().includes(code));
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
    assert.ok(!(await page.locator("body").innerText()).includes(code));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await browser?.close(); instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    await operator.close();
    previous === undefined ? delete process.env.DATA_DIR : process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
