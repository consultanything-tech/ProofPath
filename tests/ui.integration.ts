import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner, fixturePlanFor } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { manifestPath } from "../src/evidence.js";
import { getScenario } from "../src/scenarios.js";

async function availablePort() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

async function app() {
  const port = await availablePort();
  const instance = createProofPathServer(port, createPlanner({ PLANNER_MODE: "fixture" }));
  await new Promise<void>((resolve) => instance.server.listen(port, "127.0.0.1", resolve));
  return { ...instance, close: async () => { instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve())); } };
}

function staleProposal() {
  const scenario = getScenario("add-to-cart", "baseline");
  return { kind: "plan", id: randomUUID(), digest: "sha256:stale", envelope: { originalRequirement: "<img src=x onerror=alert(1)>", scenario, contractVersion: "1", targetRegistryVersion: "2", planner: { mode: "fixture", provider: null, model: null }, plan: fixturePlanFor(scenario).plan }, plannerLabel: "Fixture planner — Meta not used" };
}

function legacyManifest(runId: string) {
  const scenario = getScenario("add-to-cart", "baseline");
  return {
    runId,
    verdict: "PASS",
    executionStatus: "completed",
    planner: { mode: "fixture", provider: null, model: null },
    scenario: { id: "add-to-cart", revision: "baseline" },
    startedAt: "2026-10-28T00:00:00.000Z",
    endedAt: "2026-10-28T00:00:01.000Z",
    replay: ["Open synthetic shop"],
    approvalEnvelope: {
      originalRequirement: "Add one lamp",
      scenario,
      contractVersion: "1",
      targetRegistryVersion: "2",
      planner: { mode: "fixture", provider: null, model: null },
      plan: {
        actions: fixturePlanFor(scenario).plan!.actions,
        assertions: [{ id: "<img src=x>", predicate: "cart-total-minor-equals", expected: "7800" }]
      }
    },
    assertions: [{ id: "<img src=x>", expected: "7800", observed: "7800", verdict: "PASS", screenshot: "not-captured.png", timestamp: "2026-10-28T00:00:01.000Z", url: "http://127.0.0.1:1/" }]
  };
}

async function content(locator: { textContent(): Promise<string | null> }) { return (await locator.textContent()) ?? ""; }
const waitForPlanEnabled = (page: import("playwright").Page) => page.waitForFunction(() => {
  const button = document.querySelector("#plan");
  return button instanceof HTMLButtonElement && !button.disabled;
});

function gate() {
  let open!: () => void;
  let arrived!: () => void;
  const released = new Promise<void>((resolve) => { open = resolve; });
  const started = new Promise<void>((resolve) => { arrived = resolve; });
  return { release: open, wait: started, hold: released, arrive: arrived };
}

async function loadedImages(page: import("playwright").Page) {
  const results = await page.locator(".assertion-card img").evaluateAll(async (images) => Promise.all(images.map(async (image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    if (!image.complete) await new Promise<void>((resolve) => { image.addEventListener("load", () => resolve(), { once: true }); image.addEventListener("error", () => resolve(), { once: true }); });
    return image.complete && image.naturalWidth > 0;
  })));
  assert.ok(results.length > 0);
  assert.ok(results.every(Boolean));
}

test("readable review and reports preserve evidence while guarding stale and legacy data", async () => {
  const server = await app();
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const screenshots = join(process.cwd(), "runs", `ui-verification-${randomUUID()}`);
  await mkdir(screenshots, { recursive: true });
  try {
    const postCounts = { approve: 0, run: 0 };
    desktop.on("request", (request) => {
      if (request.method() !== "POST") return;
      if (request.url().includes("/approve")) postCounts.approve += 1;
      if (request.url().includes("/run")) postCounts.run += 1;
    });
    await desktop.goto(server.origin);
    await waitForPlanEnabled(desktop);
    await desktop.selectOption("#scenario", "quantity-update");
    await desktop.selectOption("#revision", "fixed");
    await desktop.locator("#plan").focus();
    await desktop.keyboard.press("Enter");
    await desktop.locator("#review:not([hidden])").waitFor();
    assert.equal(await desktop.evaluate(() => document.activeElement?.id), "review-heading");
    assert.match(await content(desktop.locator("#review-output")), /Set quantity to 2\./);
    assert.match(await content(desktop.locator("#review-output")), /Cart total is S\$78\.00\./);
    await desktop.getByText("Open exact approval envelope and digest").click();
    const reviewSnapshot = JSON.parse(await content(desktop.locator("#review-output pre")));
    assert.equal(reviewSnapshot.approvalEnvelope.plan.assertions[1].expected, "7800");
    await desktop.screenshot({ path: join(screenshots, "desktop-review.png"), fullPage: true });
    const firstApproval = gate();
    await desktop.route("**/approve", async (route) => { firstApproval.arrive(); await firstApproval.hold; await route.continue(); });
    await desktop.locator("#approve").focus();
    await desktop.keyboard.press("Enter");
    await firstApproval.wait;
    assert.equal(await desktop.locator("#requirement").isDisabled(), true);
    firstApproval.release();
    await desktop.locator("#run:not([hidden])").waitFor();
    assert.equal(postCounts.approve, 1);
    assert.equal(await desktop.locator("#requirement").isDisabled(), false);
    await desktop.locator("#requirement").fill("Abandon the approved plan");
    assert.equal(await desktop.locator("#review").isHidden(), true);
    await desktop.selectOption("#scenario", "quantity-update");
    await desktop.selectOption("#revision", "fixed");
    await desktop.locator("#plan").click();
    await desktop.locator("#review:not([hidden])").waitFor();
    const secondApproval = gate();
    await desktop.route("**/approve", async (route) => { secondApproval.arrive(); await secondApproval.hold; await route.continue(); });
    await desktop.locator("#approve").dblclick();
    await secondApproval.wait;
    assert.equal(await desktop.locator("#approve").isDisabled(), true);
    secondApproval.release();
    await desktop.locator("#run:not([hidden])").waitFor();
    assert.equal(postCounts.approve, 2);
    const execute = gate();
    await desktop.route("**/run", async (route) => { execute.arrive(); await execute.hold; await route.continue(); });
    await desktop.locator("#execute").focus();
    await desktop.keyboard.press("Enter");
    await execute.wait;
    assert.equal(await desktop.locator("#requirement").isDisabled(), true);
    await desktop.locator("#execute").dblclick({ force: true });
    execute.release();
    await desktop.locator("#report:not([hidden])").waitFor();
    assert.equal(postCounts.run, 1);
    assert.equal(await desktop.evaluate(() => document.activeElement?.id), "report-heading");
    assert.match(await content(desktop.locator("#report-output")), /PASS — execution completed/);
    assert.match(await content(desktop.locator("#report-output")), /Cart total is S\$78\.00\./);
    assert.match(await content(desktop.locator("#report-output")), /COMPLETED — Open the synthetic shop\./);
    const reportHref = await desktop.getByRole("link", { name: "Open this readable report" }).getAttribute("href");
    assert.ok(reportHref);
    const runId = new URL(reportHref, server.origin).searchParams.get("run")!;
    assert.match(runId, /^[a-f0-9-]{36}$/);
    const rawHref = `/runs/${runId}/manifest.json`;
    const rawResponse = await desktop.request.get(`${server.origin}${rawHref}`);
    assert.equal(rawResponse.ok(), true);
    const rawManifest = await rawResponse.json();
    assert.deepEqual(rawManifest.approvalEnvelope, reviewSnapshot.approvalEnvelope);
    assert.equal(rawManifest.approvalDigest, reviewSnapshot.approvalDigest);
    const manifestBytes = await readFile(manifestPath(runId));
    const manifestHash = (await readFile(manifestPath(runId).replace("manifest.json", "manifest.sha256"), "utf8")).trim();
    assert.equal(manifestHash, createHash("sha256").update(manifestBytes).digest("hex"));
    await desktop.getByText("Open raw manifest data").click();
    assert.match(await content(desktop.locator("#report-output pre").last()), /"actionResults"/);
    await loadedImages(desktop);
    await desktop.locator("#report-output > section").first().screenshot({ path: join(screenshots, "result-summary.png") });
    await desktop.screenshot({ path: join(screenshots, "desktop-report.png"), fullPage: true });
    await desktop.setViewportSize({ width: 390, height: 844 });
    assert.equal(await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await desktop.screenshot({ path: join(screenshots, "mobile-report.png"), fullPage: true });
    await desktop.goto(`${server.origin}/?run=${runId}`);
    await desktop.locator("#report:not([hidden])").waitFor();
    assert.match(await content(desktop.locator("#report-output")), /Cart total is S\$78\.00\./);

    const stale = await browser.newPage();
    const staleGate = gate();
    await stale.route("**/api/plans", async (route) => {
      staleGate.arrive();
      await staleGate.hold;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(staleProposal()) });
    });
    await stale.goto(server.origin);
    await waitForPlanEnabled(stale);
    await stale.locator("#plan").click();
    await staleGate.wait;
    await stale.locator("#requirement").fill("Changed while planning");
    staleGate.release();
    await waitForPlanEnabled(stale);
    assert.equal(await stale.locator("#review").isHidden(), true);
    assert.equal(await stale.locator("#approve").isDisabled(), true);
    await stale.close();

    const delayedReportId = "00000000-0000-4000-8000-000000000098";
    const delayedReport = await browser.newPage();
    const reportGate = gate();
    await delayedReport.route(`**/runs/${delayedReportId}/manifest.json`, async (route) => {
      reportGate.arrive();
      await reportGate.hold;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(legacyManifest(delayedReportId)) });
    });
    await delayedReport.goto(`${server.origin}/?run=${delayedReportId}`);
    await reportGate.wait;
    await delayedReport.locator("#requirement").fill("Changed while loading a report");
    const lateResponse = delayedReport.waitForResponse((response) => response.url().endsWith(`/runs/${delayedReportId}/manifest.json`));
    reportGate.release();
    await (await lateResponse).finished();
    await delayedReport.waitForLoadState("networkidle");
    assert.equal(await delayedReport.locator("#report").isHidden(), true);
    await delayedReport.close();

    const legacyId = "00000000-0000-4000-8000-000000000099";
    const legacy = await browser.newPage();
    await legacy.route(`**/runs/${legacyId}/manifest.json`, async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(legacyManifest(legacyId)) }));
    await legacy.goto(`${server.origin}/?run=${legacyId}`);
    await legacy.locator("#report:not([hidden])").waitFor();
    assert.match(await content(legacy.locator("#report-output")), /Action execution details were not recorded/);
    assert.match(await content(legacy.locator("#report-output")), /<img src=x>/);
    assert.equal(await legacy.locator("img[src='x']").count(), 0);
    assert.equal(await legacy.locator(".assertion-card img").count(), 0);
    await legacy.close();

    const invalid = await browser.newPage();
    let manifestRequests = 0;
    invalid.on("request", (request) => { if (request.url().includes("/runs/")) manifestRequests += 1; });
    await invalid.goto(`${server.origin}/?run=not-a-run-id`);
    await invalid.getByText("The report link has an invalid run ID.").waitFor();
    assert.equal(manifestRequests, 0);
    await invalid.close();

    const unavailable = await browser.newPage();
    await unavailable.goto(`${server.origin}/?run=00000000-0000-4000-8000-000000000097`);
    await unavailable.getByText("Saved report is unavailable.").waitFor();
    assert.equal(await unavailable.locator("#report").isHidden(), true);
    await unavailable.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
