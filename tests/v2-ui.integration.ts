import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { createV2Planner } from "../src/v2-planner.js";
import { validateSuiteProposal } from "../src/v2-planner.js";

const runFile = promisify(execFile);

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
  let exportDirectory: string | undefined;
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
    await desktop.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 60_000 });
    assert.equal(proposals, 1);
    assert.equal(await desktop.getByRole("link", { name: "Download bug packet" }).count(), 1);
    assert.equal(await desktop.getByRole("link", { name: "Download Playwright export" }).count(), 1);
    assert.match((await desktop.locator("#v2-report-output").textContent()) ?? "", /approvalDigest/);
    const seededRun = JSON.parse((await desktop.locator("#v2-report-output details pre").textContent()) ?? "{}") as any;
    await mkdir(screenshots, { recursive: true });
    await desktop.screenshot({ path: join(screenshots, "workbench-desktop-report.png"), fullPage: true });
    const seededExportHref = await desktop.getByRole("link", { name: "Download Playwright export" }).getAttribute("href");
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
    await desktop.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 60_000 });
    assert.match((await desktop.locator("#v2-report-output").textContent()) ?? "", /approvalDigest/);
    const fixedRun = JSON.parse((await desktop.locator("#v2-report-output details pre").textContent()) ?? "{}") as any;
    const packetHref = await desktop.getByRole("link", { name: "Download bug packet" }).getAttribute("href");
    const exportHref = await desktop.getByRole("link", { name: "Download Playwright export" }).getAttribute("href");
    const packet = await (await fetch(`${instance.origin}${packetHref}`)).text();
    const exportedTest = await (await fetch(`${instance.origin}${exportHref}`)).text();
    const seededExport = await (await fetch(`${instance.origin}${seededExportHref}`)).text();
    assert.match(packet, /# ProofPath bug packet/);
    assert.match(exportedTest, /node:assert\/strict/);
    exportDirectory = await mkdtemp(join(process.cwd(), "tests/.task4-export-"));
    const seededExportPath = join(exportDirectory, "seeded.test.mjs");
    const fixedExportPath = join(exportDirectory, "fixed.test.mjs");
    await writeFile(seededExportPath, seededExport);
    await writeFile(fixedExportPath, exportedTest);
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: instance.origin, NODE_OPTIONS: "" };
    delete childEnv.NODE_TEST_CONTEXT;
    await assert.rejects(runFile(process.execPath, ["--test", seededExportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r2" } }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(`${error.stdout}\n${error.stderr}`, /7200|7700/);
      return true;
    });
    const fixedExportResult = await runFile(process.execPath, ["--test", fixedExportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r3" } });
    assert.match(fixedExportResult.stdout, /pass 1/);
    await writeFile(join(screenshots, "readiness-summary.json"), `${JSON.stringify({
      mode: "fixture",
      seeded: { id: seededRun.id, approvalDigest: seededRun.approvalDigest, verdict: seededRun.verdict, candidateVerdict: seededRun.candidateVerdict, coverage: seededRun.coverage, comparisons: seededRun.comparisons },
      fixed: { id: fixedRun.id, approvalDigest: fixedRun.approvalDigest, verdict: fixedRun.verdict, candidateVerdict: fixedRun.candidateVerdict, coverage: fixedRun.coverage, comparisons: fixedRun.comparisons },
      exportSha256: `sha256:${createHash("sha256").update(exportedTest).digest("hex")}`
    }, null, 2)}\n`);
    assert.equal((await fetch(`${instance.origin}/api/v2/runs/not-a-run-id/bug-packet`)).status, 404);
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobile.goto(`${instance.origin}/workbench.html?run=${fixedRun.id}`);
    await mobile.getByText("Loaded persisted read-only run report.").waitFor();
    await mobile.getByRole("heading", { name: "4. Candidate, coverage and comparison report" }).waitFor();
    await mobile.getByText("Baseline r1; candidate r3.", { exact: true }).waitFor();
    await mobile.getByText(`Approval digest: ${fixedRun.approvalDigest}`, { exact: true }).waitFor();
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
    if (exportDirectory) await rm(exportDirectory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench submits accepted source-linked numeric review decisions and renders compiled expectations", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-numeric-")); const prior = process.env.DATA_DIR; process.env.DATA_DIR = root; const selectedPort = await port(); let submitted: unknown;
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }), { propose: async (context) => validateSuiteProposal({ kind: "proposal", requirement: { version: "2", originalText: context.requirement.originalText, criteria: context.requirement.criteria, numericRuleChanges: [{ criterionId: "coupon", field: "couponBasisPoints", value: 2000, sourceQuote: context.requirement.criteria.find((item) => item.id === "coupon")!.sourceQuote }], expectationScope: [{ criterionId: "coupon", scope: "new-or-changed" }], coverageGaps: [] }, cases: [{ id: "twenty", criterionIds: ["coupon"], category: "interaction", rationale: "Checks the accepted 20% coupon rate.", actions: [{ id: "open", kind: "open-app", target: "checkout", value: null }, { id: "lamp", kind: "add-product", target: "desk-lamp", value: null }, { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" }, { id: "apply", kind: "apply-coupon", target: "coupon", value: null }], assertions: [{ id: "total", predicate: "total-minor" }] }], gaps: [] }, context) });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try { await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve)); browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); page.setDefaultTimeout(5000); await page.goto(`${instance.origin}/workbench.html`); await page.getByRole("textbox", { name: "Source requirement" }).fill("SAVE10 discounts by 20%."); await page.getByRole("button", { name: "Inspect registered pair and propose" }).click(); await page.locator("[data-accept='coupon']").check(); await page.locator("[data-scope='coupon']").selectOption("new-or-changed"); await page.locator("[data-numeric='coupon']").check(); await page.getByRole("button", { name: "Compile reviewed snapshot" }).click(); await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor(); const readable = (await page.locator("#v2-approval-output").textContent()) ?? ""; assert.match(readable, /couponBasisPoints: 2000/); assert.match(readable, /totalMinor: 3700/); assert.match(readable, /coupon=new-or-changed/); await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click(); await page.getByRole("button", { name: "Run approved pair" }).click(); await page.getByText("twenty: expectation-not-met", { exact: true }).waitFor({ timeout: 30000 }); await page.close(); } finally { await browser?.close(); instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve())); if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior; await rm(root, { recursive: true, force: true }); }
});

test("workbench never runs an unused A approval after delayed saved B preparation", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-receipt-"));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const selectedPort = await port();
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }));
  const screenshots = join(process.cwd(), "test-results", "task4");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: import("playwright").Page | undefined;
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${instance.origin}${path}`, { method: "POST", headers: { Origin: instance.origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    assert.ok(response.ok, `${path}: ${JSON.stringify(data)}`);
    return data as any;
  };
  try {
    await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve));
    const savedProposal = await post("/api/v2/proposals", { requirement: "An invalid coupon must display an error.", releases: ["r1", "r2"] });
    const savedSuite = await post(`/api/v2/proposals/${savedProposal.id}/review`, { review: { decisions: savedProposal.proposal.requirement.criteria.map((criterion: any) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged", adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: [], acceptedNumericRuleChanges: [] })) } });
    const savedReceipt = await post(`/api/v2/suites/${savedSuite.id}/approve`, {});
    const savedStart = await post(`/api/v2/approvals/${savedReceipt.id}/runs`, {});
    let savedRun: any;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await fetch(`${instance.origin}/api/v2/runs/${savedStart.runId}`);
      assert.ok(response.ok);
      savedRun = await response.json();
      if (savedRun.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(savedRun.status, "completed");
    const savedB = await post(`/api/v2/runs/${savedRun.id}/regressions`, {});
    assert.equal(savedB.definition.requirement.originalText, "An invalid coupon must display an error.");
    assert.deepEqual(savedB.definition.cases.map((item: any) => item.id), ["coupon-error"]);

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5_000);
    const runApprovalIds: string[] = [];
    page.on("request", (request) => {
      const match = new URL(request.url()).pathname.match(/^\/api\/v2\/approvals\/([a-f0-9-]{36})\/runs$/);
      if (request.method() === "POST" && match) runApprovalIds.push(match[1]!);
    });
    await page.goto(`${instance.origin}/workbench.html`);
    await page.getByText("Fixture-only workbench ready; live model use is disabled").waitFor();
    await page.selectOption("#v2-baseline", "r1");
    await page.selectOption("#v2-candidate", "r2");
    await page.getByRole("textbox", { name: "Source requirement" }).fill("Cart total must match unit prices.");
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor({ timeout: 30_000 });
    const aDigest = /Digest: (sha256:[a-f0-9]{64})/.exec((await page.locator("#v2-approval-output").textContent()) ?? "")?.[1];
    assert.ok(aDigest);
    const aApprovalResponse = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/v2\/suites\/[a-f0-9-]{36}\/approve$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    const aReceipt = await (await aApprovalResponse).json() as { id: string; digest: string };
    assert.equal(aReceipt.digest, aDigest);
    assert.equal(await page.getByRole("button", { name: "Run approved pair" }).isEnabled(), true);

    let releasePrepare!: () => void;
    const heldPrepare = new Promise<void>((resolve) => { releasePrepare = resolve; });
    let prepared!: () => void;
    const preparing = new Promise<void>((resolve) => { prepared = resolve; });
    await page.route(`**/api/v2/regressions/${savedB.id}/prepare`, async (route) => { prepared(); await heldPrepare; await route.continue(); });
    await page.getByRole("combobox", { name: "Saved definition" }).selectOption(savedB.id);
    await page.getByRole("button", { name: "Prepare selected saved definition" }).click();
    await preparing;
    assert.equal(await page.getByRole("button", { name: "Run approved pair" }).isDisabled(), true);
    assert.equal(runApprovalIds.length, 0);
    releasePrepare();
    await page.getByText("Saved immutable definition rebound to the selected pair").waitFor({ timeout: 30_000 });
    const bApprovalText = (await page.locator("#v2-approval-output").textContent()) ?? "";
    const bDigest = /Digest: (sha256:[a-f0-9]{64})/.exec(bApprovalText)?.[1];
    assert.match(bApprovalText, /An invalid coupon must display an error/);
    assert.match(bApprovalText, /coupon-error/);
    assert.notEqual(bDigest, aDigest);
    assert.equal(await page.getByRole("button", { name: "Run approved pair" }).isDisabled(), true);
    assert.equal(runApprovalIds.length, 0);

    const bApprovalResponse = page.waitForResponse((response) => response.request().method() === "POST" && /\/api\/v2\/suites\/[a-f0-9-]{36}\/approve$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    const bReceipt = await (await bApprovalResponse).json() as { id: string; digest: string };
    assert.equal(bReceipt.digest, bDigest);
    assert.notEqual(bReceipt.id, aReceipt.id);
    const bStartResponse = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === `/api/v2/approvals/${bReceipt.id}/runs`);
    await page.getByRole("button", { name: "Run approved pair" }).click();
    const bStart = await (await bStartResponse).json() as { runId: string };
    await page.getByRole("heading", { name: "4. Candidate, coverage and comparison report" }).waitFor({ timeout: 30_000 });
    await page.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 60_000 });
    const completed = await (await fetch(`${instance.origin}/api/v2/runs/${bStart.runId}`)).json() as any;
    assert.equal(completed.status, "completed");
    assert.equal(completed.approvalDigest, bDigest);
    assert.deepEqual(completed.artifact.definition.cases.map((item: any) => item.id), ["coupon-error"]);
    assert.equal(completed.artifact.definition.requirement.originalText, "An invalid coupon must display an error.");
    assert.ok(!completed.artifact.definition.cases.some((item: any) => item.id === "cart-total"));
    assert.ok(!runApprovalIds.includes(aReceipt.id));
    assert.deepEqual(runApprovalIds, [bReceipt.id]);
  } catch (error) {
    if (page) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, "receipt-binding-failure.png"), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close();
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench retains delayed runs and reopens readable persisted evidence", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-persisted-"));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const selectedPort = await port();
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }));
  const screenshots = join(process.cwd(), "test-results", "task4");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let page: import("playwright").Page | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(5_000);
    await page.goto(`${instance.origin}/workbench.html`);
    await page.getByText("Fixture-only workbench ready; live model use is disabled").waitFor();
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    let runningResponses = 0;
    const delayedResponses = 101;
    const delayedRun = async (route: import("playwright").Route) => {
      const response = await route.fetch();
      const body = await response.json() as any;
      if (runningResponses < delayedResponses) {
        runningResponses += 1;
        await route.fulfill({ response, json: { ...body, status: "running", endedAt: null } });
        return;
      }
      await route.fulfill({ response });
    };
    await page.route("**/api/v2/runs/*", delayedRun);
    await page.getByRole("button", { name: "Run approved pair" }).click();
    await page.getByRole("heading", { name: "4. Candidate, coverage and comparison report" }).waitFor({ timeout: 30_000 });
    await page.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 60_000 });
    assert.equal(runningResponses, delayedResponses);
    await page.unroute("**/api/v2/runs/*", delayedRun);
    const reportLink = await page.getByRole("link", { name: "Open this report" }).getAttribute("href");
    assert.match(reportLink ?? "", /^\/workbench\.html\?run=[a-f0-9-]{36}$/);
    const runId = new URL(reportLink!, instance.origin).searchParams.get("run")!;
    const rawResponse = await fetch(`${instance.origin}/api/v2/runs/${runId}`);
    assert.ok(rawResponse.ok);
    const raw = await rawResponse.json() as any;
    assert.equal(raw.status, "completed");
    const contact = raw.records.flatMap((record: any) => record.assertions).find((assertion: any) => assertion.id === "contact-errors");
    assert.deepEqual(contact.expected, { email: "required", postalCode: "required" });
    assert.deepEqual(contact.observed, { email: "required", postalCode: "required" });
    const readablePanels = (await page.locator("#v2-report-output .workbench-panel").allTextContents()).join(" ");
    assert.match(readablePanels, /contact-errors PASS; expected email: required, postalCode: required; observed email: required, postalCode: required/);
    assert.doesNotMatch(readablePanels, /\[object Object\]/);
    const evidence = raw.records.flatMap((record: any) => record.assertions).find((assertion: any) => assertion.screenshotSha256 && assertion.screenshot !== "not-captured.png");
    const evidencePath = `/api/v2/runs/${runId}/evidence/${evidence.screenshot}`;
    const evidenceLink = page.locator(`a[href="${evidencePath}"]`);
    assert.equal(await evidenceLink.count(), 1);
    const [evidenceResponse] = await Promise.all([page.waitForResponse((response) => new URL(response.url()).pathname === evidencePath), evidenceLink.click()]);
    assert.equal(evidenceResponse.headers()["content-type"], "image/png");
    assert.equal(`sha256:${createHash("sha256").update(await evidenceResponse.body()).digest("hex")}`, evidence.screenshotSha256);
    assert.notEqual((await fetch(`${instance.origin}/api/v2/runs/${runId}/evidence/not-a-run-id.png`)).status, 200);

    const reopened = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    reopened.setDefaultTimeout(5_000);
    const readonlyRequests: Array<{ method: string; path: string }> = [];
    reopened.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === instance.origin && url.pathname.startsWith("/api/v2/")) readonlyRequests.push({ method: request.method(), path: url.pathname });
    });
    await reopened.goto(`${instance.origin}${reportLink}`);
    await reopened.getByText("Loaded persisted read-only run report.").waitFor({ timeout: 30_000 });
    assert.equal(await reopened.locator("#v2-run").isDisabled(), true);
    const refreshResponse = reopened.waitForResponse((response) => new URL(response.url()).pathname === `/api/v2/runs/${runId}` && response.request().method() === "GET");
    await reopened.getByRole("button", { name: "Refresh report" }).click();
    await refreshResponse;
    await reopened.getByText("Refreshed persisted read-only run report.").waitFor();
    assert.ok(readonlyRequests.filter((request) => request.path === `/api/v2/runs/${runId}` && request.method === "GET").length >= 2);
    assert.equal(readonlyRequests.filter((request) => request.method === "POST" || /\/(proposals|approve|runs)$/.test(request.path)).length, 0);

    const displayFixture = structuredClone(raw);
    const fixtureAssertions = displayFixture.records.flatMap((record: any) => record.assertions);
    const unavailable = fixtureAssertions.find((assertion: any) => assertion.id === "contact-errors");
    const recordedNone = fixtureAssertions.find((assertion: any) => assertion.id !== "contact-errors");
    unavailable.observed = null;
    unavailable.verdict = "INCONCLUSIVE";
    recordedNone.expected = null;
    recordedNone.observed = null;
    recordedNone.verdict = "PASS";
    const fixturePage = await browser.newPage();
    await fixturePage.route(`**/api/v2/runs/${runId}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(displayFixture) }));
    await fixturePage.goto(`${instance.origin}${reportLink}`);
    await fixturePage.getByText("Loaded persisted read-only run report.").waitFor({ timeout: 30_000 });
    const fixturePanels = (await fixturePage.locator("#v2-report-output .workbench-panel").allTextContents()).join(" ");
    assert.match(fixturePanels, /expected Recorded none; observed Recorded none/);
    assert.match(fixturePanels, /contact-errors INCONCLUSIVE; expected email: required, postalCode: required; observed Unavailable observation/);
    assert.doesNotMatch(fixturePanels, /\[object Object\]/);
    assert.match((await fixturePage.locator("#v2-report-output details pre").textContent()) ?? "", /"observed": null/);
    await fixturePage.close();
    await reopened.close();
  } catch (error) {
    if (page) {
      await mkdir(screenshots, { recursive: true });
      await page.screenshot({ path: join(screenshots, "persisted-report-failure.png"), fullPage: true }).catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close();
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench discards stale proposal, review, approval, and report responses", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-stale-"));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const selectedPort = await port();
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    let proposalPosts = 0;
    page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/v2/proposals") proposalPosts += 1; });
    const gate = () => {
      let release!: () => void;
      let seen!: () => void;
      return { wait: new Promise<void>((resolve) => { release = resolve; }), seen: new Promise<void>((resolve) => { seen = resolve; }), release, mark: () => seen() };
    };
    const invalidateRequirement = (value: string) => page.locator("#v2-requirement").evaluate((node, next) => {
      const field = node as HTMLTextAreaElement;
      field.value = next;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const invalidateCandidate = (value: string) => page.locator("#v2-candidate").evaluate((node, next) => {
      const select = node as HTMLSelectElement;
      select.value = next;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    const waitForPendingClear = () => page.waitForFunction(() => !(document.querySelector("#v2-propose") as HTMLButtonElement).disabled);
    await page.goto(`${instance.origin}/workbench.html`);
    await page.getByText("Fixture-only workbench ready; live model use is disabled").waitFor();

    const proposalGate = gate();
    const delayedProposal = async (route: import("playwright").Route) => { proposalGate.mark(); await proposalGate.wait; await route.continue(); };
    await page.route("**/api/v2/proposals", delayedProposal);
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await proposalGate.seen;
    await invalidateRequirement("Cart total must match unit prices.");
    proposalGate.release();
    await waitForPendingClear();
    assert.equal(await page.locator("#v2-review").isHidden(), true);
    assert.equal(await page.locator("#v2-approval").isHidden(), true);
    assert.equal(await page.locator("#v2-run").isDisabled(), true);
    await page.unroute("**/api/v2/proposals", delayedProposal);

    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    const reviewGate = gate();
    const delayedReview = async (route: import("playwright").Route) => { reviewGate.mark(); await reviewGate.wait; await route.continue(); };
    await page.route("**/api/v2/proposals/*/review", delayedReview);
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await reviewGate.seen;
    await invalidateCandidate("r3");
    reviewGate.release();
    await waitForPendingClear();
    assert.equal(await page.locator("#v2-approval").isHidden(), true);
    assert.equal(await page.locator("#v2-run").isDisabled(), true);
    await page.unroute("**/api/v2/proposals/*/review", delayedReview);

    await page.selectOption("#v2-candidate", "r2");
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor({ timeout: 30_000 });
    const approvalGate = gate();
    const delayedApproval = async (route: import("playwright").Route) => { approvalGate.mark(); await approvalGate.wait; await route.continue(); };
    await page.route("**/api/v2/suites/*/approve", delayedApproval);
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    await approvalGate.seen;
    await invalidateRequirement("An invalid coupon must display an error.");
    approvalGate.release();
    await waitForPendingClear();
    assert.equal(await page.locator("#v2-approval").isHidden(), true);
    assert.equal(await page.locator("#v2-run").isDisabled(), true);
    await page.unroute("**/api/v2/suites/*/approve", delayedApproval);

    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    await page.getByRole("button", { name: "Run approved pair" }).waitFor({ state: "visible" });
    const reportGate = gate();
    const delayedReport = async (route: import("playwright").Route) => { reportGate.mark(); await reportGate.wait; await route.continue(); };
    await page.route("**/api/v2/runs/*", delayedReport);
    const started = page.waitForResponse((response) => response.request().method() === "POST" && /^\/api\/v2\/approvals\/[a-f0-9-]{36}\/runs$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: "Run approved pair" }).click();
    const startedRun = await (await started).json() as { runId: string };
    await reportGate.seen;
    await invalidateRequirement("Cart total must match unit prices.");
    reportGate.release();
    await waitForPendingClear();
    assert.equal(await page.locator("#v2-report").isHidden(), true);
    assert.equal(await page.locator("#v2-run").isDisabled(), true);
    assert.equal(proposalPosts, 4);
    let completed = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const response = await fetch(`${instance.origin}/api/v2/runs/${startedRun.runId}`);
      assert.ok(response.ok);
      if ((await response.json() as { status: string }).status === "completed") { completed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(completed, true);
    await page.unroute("**/api/v2/runs/*", delayedReport);
    await page.close();
  } finally {
    await browser?.close();
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("workbench sends one client request for each duplicate action", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-ui-duplicates-"));
  const prior = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const selectedPort = await port();
  const instance = createProofPathServer(selectedPort, createPlanner({ PLANNER_MODE: "fixture" }));
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(selectedPort, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5_000);
    const requests: string[] = [];
    let savedReads = 0;
    let runReads = 0;
    page.on("request", (request) => { const path = new URL(request.url()).pathname; if (request.method() === "POST") requests.push(path); if (request.method() === "GET" && /^\/api\/v2\/runs\/[a-f0-9-]{36}$/.test(path)) runReads += 1; if (request.method() === "GET" && path === "/api/v2/regressions") savedReads += 1; });
    const twice = (selector: string) => page.locator(selector).evaluate((button) => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await page.goto(`${instance.origin}/workbench.html`);
    await page.getByText("Fixture-only workbench ready; live model use is disabled").waitFor();
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor({ timeout: 30_000 });
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await twice("#v2-review-submit");
    await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor({ timeout: 30_000 });
    await twice("#v2-approve");
    await page.getByRole("button", { name: "Run approved pair" }).waitFor({ state: "visible" });
    await twice("#v2-run");
    await page.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 30_000 });
    await twice("#v2-save");
    await page.getByText(/Saved immutable regression/).waitFor({ timeout: 30_000 });
    const beforeSavedRefresh = savedReads;
    await twice("#v2-refresh-saved");
    await page.getByText("Saved definitions refreshed without invoking the planner.").waitFor({ timeout: 30_000 });
    assert.equal(savedReads, beforeSavedRefresh + 1);
    const beforeRefresh = runReads;
    await twice("#v2-report-refresh");
    await page.getByText("Refreshed persisted read-only run report.").waitFor({ timeout: 30_000 });
    assert.equal(runReads, beforeRefresh + 1);
    assert.equal(requests.filter((path) => /\/review$/.test(path)).length, 1);
    assert.equal(requests.filter((path) => /\/approve$/.test(path)).length, 1);
    assert.equal(requests.filter((path) => /\/runs$/.test(path)).length, 1);
    assert.equal(requests.filter((path) => /\/regressions$/.test(path)).length, 1);
    await page.selectOption("#v2-candidate", "r3");
    await page.getByRole("combobox", { name: "Saved definition" }).selectOption({ index: 1 });
    await twice("#v2-prepare");
    await page.getByText("Saved immutable definition rebound to the selected pair").waitFor({ timeout: 30_000 });
    assert.equal(requests.filter((path) => /\/prepare$/.test(path)).length, 1);
    await page.close();
  } finally {
    await browser?.close();
    instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    if (prior === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = prior;
    await rm(root, { recursive: true, force: true });
  }
});
