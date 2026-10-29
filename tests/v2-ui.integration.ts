import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { createV2Planner } from "../src/v2-planner.js";
import { validateSuiteProposal } from "../src/v2-planner.js";

async function port() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

test("workbench completes fixture review, run, saved reuse, downloads, and responsive raw/readable report", { timeout: 90_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-"));
  const priorData = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const selectedPort = await port();
  let proposals = 0;
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }), { propose: async (context) => { proposals += 1; return createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context); } });
  const screenshots = join(process.cwd(), "test-results", "task4");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let desktop: import("playwright").Page | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desktop.goto(`${instance.origin}/workbench.html`);
    await desktop.getByText("Version 2 workbench · Fixture mode · Live model disabled").waitFor();
    await desktop.getByRole("textbox", { name: "Source requirement" }).press("Control+Enter");
    await desktop.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor();
    await desktop.getByText("Original source and interpreted criteria").waitFor();
    for (const check of await desktop.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await desktop.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await desktop.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await desktop.locator("#v2-status").waitFor({ state: "visible" });
    await desktop.getByRole("heading", { name: "3. Final one-use approval" }).waitFor();
    await desktop.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    await desktop.getByRole("button", { name: "Run approved pair" }).click();
    await desktop.getByRole("heading", { name: "4. Candidate, coverage and comparison report" }).waitFor({ timeout: 60_000 });
    await desktop.getByText(/Suite FAIL; candidate FAIL/).waitFor();
    assert.equal(proposals, 1);
    assert.equal(await desktop.getByRole("link", { name: "Download bug packet" }).count(), 1);
    assert.equal(await desktop.getByRole("link", { name: "Download Playwright export" }).count(), 1);
    assert.match((await desktop.locator("#v2-report-output").textContent()) ?? "", /approvalDigest/);
    await mkdir(screenshots, { recursive: true });
    await desktop.screenshot({ path: join(screenshots, "workbench-desktop-report.png"), fullPage: true });
    await desktop.getByRole("button", { name: "Save immutable reviewed regression" }).click();
    await desktop.getByText(/Saved immutable regression/).waitFor();
    await desktop.selectOption("#v2-candidate", "r3");
    await desktop.getByRole("combobox", { name: "Saved definition" }).selectOption({ index: 1 });
    await desktop.getByRole("button", { name: "Prepare selected saved definition" }).click();
    await desktop.getByText("Saved immutable definition rebound to the selected pair").waitFor();
    await desktop.getByText(/Saved reuse made zero planner calls/).waitFor();
    assert.equal(await desktop.getByRole("button", { name: "Run approved pair" }).isDisabled(), true);
    assert.equal(proposals, 1);
    await desktop.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    await desktop.getByRole("button", { name: "Run approved pair" }).click();
    await desktop.getByText(/Suite INCONCLUSIVE; candidate PASS/).waitFor({ timeout: 60_000 });
    assert.match((await desktop.locator("#v2-report-output").textContent()) ?? "", /approvalDigest/);
    const packetHref = await desktop.getByRole("link", { name: "Download bug packet" }).getAttribute("href");
    const exportHref = await desktop.getByRole("link", { name: "Download Playwright export" }).getAttribute("href");
    assert.match(await (await fetch(`${instance.origin}${packetHref}`)).text(), /# ProofPath bug packet/);
    assert.match(await (await fetch(`${instance.origin}${exportHref}`)).text(), /node:assert\/strict/);
    assert.equal((await fetch(`${instance.origin}/api/v2/runs/not-a-run-id/bug-packet`)).status, 404);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`${instance.origin}/workbench.html`);
    await mobile.getByText("Fixture-only workbench ready").waitFor();
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await mobile.screenshot({ path: join(screenshots, "workbench-mobile-readable.png"), fullPage: true });
    await mobile.close();
    await desktop.close();
    desktop = undefined;
  } catch (error) {
    const detail = desktop ? (await desktop.locator("#v2-status").textContent().catch(() => "")) : "";
    throw new Error(`Workbench flow failed: ${detail || "no UI status recorded"}`, { cause: error });
  } finally {
    if (desktop) {
      await mkdir(screenshots, { recursive: true });
      await desktop.screenshot({ path: join(screenshots, "workbench-ui-failure.png"), fullPage: true }).catch(() => {});
    }
    await browser?.close();
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    if (priorData === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = priorData;
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench submits accepted source-linked numeric review decisions and renders compiled expectations", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-numeric-")); const prior = process.env.DATA_DIR; process.env.DATA_DIR = root; const selectedPort = await port(); let submitted: unknown;
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }), { propose: async (context) => validateSuiteProposal({ kind: "proposal", requirement: { version: "2", originalText: context.requirement.originalText, criteria: context.requirement.criteria, numericRuleChanges: [{ criterionId: "coupon", field: "couponBasisPoints", value: 2000, sourceQuote: context.requirement.criteria.find((item) => item.id === "coupon")!.sourceQuote }], expectationScope: [{ criterionId: "coupon", scope: "new-or-changed" }], coverageGaps: [] }, cases: [{ id: "twenty", criterionIds: ["coupon"], category: "interaction", rationale: "Checks the accepted 20% coupon rate.", actions: [{ id: "open", kind: "open-app", target: "checkout", value: null }, { id: "lamp", kind: "add-product", target: "desk-lamp", value: null }, { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" }, { id: "apply", kind: "apply-coupon", target: "coupon", value: null }], assertions: [{ id: "total", predicate: "total-minor" }] }], gaps: [] }, context) });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try { await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve)); browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(`${instance.origin}/workbench.html`); await page.getByRole("textbox", { name: "Source requirement" }).fill("SAVE10 discounts by 20%."); await page.getByRole("button", { name: "Inspect registered pair and propose" }).click(); await page.locator("[data-accept='coupon']").check(); await page.locator("[data-scope='coupon']").selectOption("new-or-changed"); await page.locator("[data-numeric='coupon']").check(); await page.getByRole("button", { name: "Compile reviewed snapshot" }).click(); await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor(); const readable = (await page.locator("#v2-approval-output").textContent()) ?? ""; assert.match(readable, /couponBasisPoints: 2000/); assert.match(readable, /totalMinor: 3700/); assert.match(readable, /coupon=new-or-changed/); await page.close(); } finally { await browser?.close(); instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve())); if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior; await rm(root, { recursive: true, force: true }); }
});
