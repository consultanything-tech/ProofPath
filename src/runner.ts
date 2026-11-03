import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { evidencePath, type ActionResult, type ExecutionStatus } from "./evidence.js";
import { fixturePath } from "./scenarios.js";
import type { ApprovalEnvelope } from "./plan-store.js";
import type { AssertionResult } from "./verdict.js";

const DEFAULT_LIMITS: RunnerLimits = { actionTimeoutMs: 10_000, totalTimeoutMs: 90_000 };

export type RunnerLimits = { actionTimeoutMs: number; totalTimeoutMs: number };

export type RequestFacts = {
  url: string;
  method: string;
  resourceType: string;
  mainFrame: boolean;
};

export type RunnerResult = { assertions: AssertionResult[]; actionResults: ActionResult[] };

export class RunnerExecutionError extends Error {
  constructor(message: string, readonly status: ExecutionStatus, readonly assertions: AssertionResult[], readonly actionResults: ActionResult[]) {
    super(message);
    this.name = "RunnerExecutionError";
  }
}

export function parseVisibleNonNegativeInteger(value: string | null): string | null {
  const text = value?.trim();
  if (!text || !/^(0|[1-9]\d*)$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? String(parsed) : null;
}

export function parseVisibleSgdMinor(value: string | null): string | null {
  const match = value?.trim().match(/^S\$(0|[1-9]\d*)\.(\d{2})$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const cents = Number(match[2]);
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(cents) || whole > Math.floor((Number.MAX_SAFE_INTEGER - cents) / 100)) return null;
  return String(whole * 100 + cents);
}

export function allowFixtureRequest(facts: RequestFacts, origin: string, fixtureUrl: string): boolean {
  let target: URL;
  try { target = new URL(facts.url); } catch { return false; }
  if (facts.method !== "GET" || !facts.mainFrame || target.origin !== origin) return false;
  if (facts.resourceType === "document") return facts.mainFrame && target.toString() === fixtureUrl;
  if (facts.resourceType === "stylesheet") return target.toString() === `${origin}/styles.css`;
  if (facts.resourceType === "script") return target.toString() === `${origin}/shop.js`;
  return false;
}

export type MarkerState = { count: number; visible: boolean };
export type CheckoutMarkers = { firstError: MarkerState; secondError: MarkerState; active: MarkerState; confirmation: MarkerState };

export function observeRequiredErrors({ firstError, secondError }: CheckoutMarkers): string | null {
  if (firstError.count !== 1 || secondError.count !== 1) return null;
  return firstError.visible && secondError.visible ? "true" : "false";
}

export function observeCheckoutStayed({ active, confirmation }: CheckoutMarkers): string | null {
  if (active.count !== 1 || confirmation.count > 1 || (confirmation.count === 1 && !confirmation.visible)) return null;
  if (!active.visible || confirmation.count === 1) return "false";
  return "true";
}

function inconclusive(assertion: ApprovalEnvelope["plan"]["assertions"][number], url: string, timestamp = new Date().toISOString()): AssertionResult {
  return { id: assertion.id, expected: assertion.expected, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp, url };
}

export function padUnobserved(results: AssertionResult[], envelope: ApprovalEnvelope, url: string) {
  const found = new Set(results.map((result) => result.id));
  const timestamp = new Date().toISOString();
  for (const assertion of envelope.plan.assertions) {
    if (!found.has(assertion.id)) results.push(inconclusive(assertion, url, timestamp));
  }
}

async function singleVisibleText(locator: Locator): Promise<string | null> {
  if (await locator.count() !== 1 || !await locator.isVisible()) return null;
  return locator.textContent();
}

async function markerState(page: Page, selector: string): Promise<MarkerState> {
  const locator = page.locator(selector);
  const count = await locator.count();
  return { count, visible: count === 1 && await locator.isVisible() };
}

function runnerMessage(status: ExecutionStatus): string {
  if (status === "blocked") return "Runner blocked a browser request.";
  if (status === "timed-out") return "Runner timed out.";
  return "Runner failed.";
}

function completeActionResults(envelope: ApprovalEnvelope, results: ActionResult[]): ActionResult[] {
  const byId = new Map(results.map((result) => [result.id, result]));
  return envelope.plan.actions.map((action) => byId.get(action.id) ?? { id: action.id, status: "not-run", startedAt: null, endedAt: null, url: null });
}

export async function runApprovedPlan(envelope: ApprovalEnvelope, origin: string, runId: string, limits: RunnerLimits = DEFAULT_LIMITS, capture?: (filename: string, bytes: Buffer) => Promise<void>): Promise<RunnerResult> {
  const plan = envelope.plan;
  const expectedOrigin = new URL(origin).origin;
  const expectedUrl = new URL(fixturePath(envelope.scenario), origin).toString();
  const startedAt = Date.now();
  const results: AssertionResult[] = [];
  const actionResults: ActionResult[] = [];
  let activeAction: ActionResult | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let status: ExecutionStatus = "completed";
  let timer: NodeJS.Timeout | undefined;
  const remainingMs = () => Math.max(1, limits.totalTimeoutMs - (Date.now() - startedAt));
  const setStatus = (next: Exclude<ExecutionStatus, "completed">) => { if (status === "completed") status = next; };
  const ensureRunning = () => {
    if (status !== "completed") throw new RunnerExecutionError(runnerMessage(status), status, results, completeActionResults(envelope, actionResults));
  };
  const ensureOwnedPage = () => {
    ensureRunning();
    if (!page || page.url() !== expectedUrl) {
      setStatus("blocked");
      ensureRunning();
    }
  };

  try {
    timer = setTimeout(() => {
      if (status === "completed") status = "timed-out";
      void context?.close().catch(() => {});
      void browser?.close().catch(() => {});
    }, limits.totalTimeoutMs);
    browser = await chromium.launch({ headless: true, timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
    ensureRunning();
    context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, permissions: [] });
    context.setDefaultTimeout(limits.actionTimeoutMs);
    context.setDefaultNavigationTimeout(limits.actionTimeoutMs);
    await context.route("**/*", async (route) => {
      if (status !== "completed") {
        await route.abort().catch(() => {});
        return;
      }
      const request = route.request();
      let mainFrame = false;
      try { mainFrame = page !== undefined && request.frame() === page.mainFrame(); } catch {
        setStatus("blocked");
        await route.abort().catch(() => {});
        return;
      }
      const facts: RequestFacts = { url: request.url(), method: request.method(), resourceType: request.resourceType(), mainFrame };
      if (!allowFixtureRequest(facts, expectedOrigin, expectedUrl)) {
        setStatus("blocked");
        await route.abort();
        return;
      }
      try {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
        if (response.status() >= 300 && response.status() < 400) {
          setStatus("blocked");
          await route.abort();
          return;
        }
        await route.fulfill({ response });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") setStatus("timed-out");
        else setStatus("failed");
        await route.abort().catch(() => {});
      }
    });
    await context.routeWebSocket("**/*", async (websocket) => {
      setStatus("blocked");
      await websocket.close();
    });
    page = await context.newPage();
    let fixtureLoaded = false;
    page.on("framenavigated", (frame) => {
      if (fixtureLoaded && frame === page?.mainFrame() && page.url() !== expectedUrl) setStatus("blocked");
    });
    page.on("popup", (popup) => { setStatus("blocked"); void popup.close().catch(() => {}); });
    page.on("download", (download) => { setStatus("blocked"); void download.cancel().catch(() => {}); });
    for (const action of plan.actions) {
      ensureRunning();
      activeAction = { id: action.id, status: "not-run", startedAt: new Date().toISOString(), endedAt: null, url: page?.url() ?? null };
      actionResults.push(activeAction);
      if (action.kind === "navigate") {
        await page.goto(expectedUrl, { waitUntil: "networkidle", timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
        ensureRunning();
        if (page.url() !== expectedUrl) { setStatus("blocked"); ensureRunning(); }
        fixtureLoaded = true;
      }
      if (action.kind === "click" && action.target === "add-desk-lamp") await page.getByRole("button", { name: "Add Desk Lamp" }).click({ timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
      if (action.kind === "fill" && action.target === "quantity") await page.getByLabel("Quantity").fill(action.value ?? "", { timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
      if (action.kind === "click" && action.target === "checkout") await page.getByRole("button", { name: "Checkout", exact: true }).click({ timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
      if (action.kind === "click" && action.target === "continue-checkout") await page.getByRole("button", { name: "Continue", exact: true }).click({ timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
      ensureOwnedPage();
      activeAction.status = "completed";
      activeAction.endedAt = new Date().toISOString();
      activeAction.url = page.url();
      activeAction = undefined;
    }
    for (const assertion of plan.assertions) {
      ensureOwnedPage();
      const filename = `${assertion.id}.png`;
      try {
        ensureOwnedPage();
        if (capture) {
          await capture(filename, await page.screenshot({ fullPage: true, timeout: Math.min(limits.actionTimeoutMs, remainingMs()) }));
        } else {
          const output = evidencePath(runId, filename);
          await mkdir(dirname(output), { recursive: true });
          await page.screenshot({ path: output, fullPage: true, timeout: Math.min(limits.actionTimeoutMs, remainingMs()) });
        }
        ensureOwnedPage();
        let observed: string | null = null;
        if (assertion.predicate === "cart-quantity-equals") observed = parseVisibleNonNegativeInteger(await singleVisibleText(page.locator("#cart-quantity")));
        if (assertion.predicate === "cart-total-minor-equals") observed = parseVisibleSgdMinor(await singleVisibleText(page.locator("#cart-total")));
        if (assertion.predicate === "required-errors-visible" || assertion.predicate === "checkout-stayed") {
          const markers = { firstError: await markerState(page, "#email-error"), secondError: await markerState(page, "#postal-code-error"), active: await markerState(page, "#checkout-active"), confirmation: await markerState(page, "#checkout-confirmation") };
          observed = assertion.predicate === "required-errors-visible" ? observeRequiredErrors(markers) : observeCheckoutStayed(markers);
        }
        ensureOwnedPage();
        results.push({ id: assertion.id, expected: assertion.expected, observed, verdict: observed === null ? "INCONCLUSIVE" : observed === assertion.expected ? "PASS" : "FAIL", screenshot: filename, timestamp: new Date().toISOString(), url: page.url() });
      } catch (error) {
        if (error instanceof Error && error.name === "TimeoutError") setStatus("timed-out");
        results.push(inconclusive(assertion, expectedUrl));
        throw new Error("Evidence capture failed.");
      }
      ensureOwnedPage();
    }
    ensureOwnedPage();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") setStatus("timed-out");
    else setStatus("failed");
    if (activeAction) {
      activeAction.status = status;
      activeAction.endedAt = new Date().toISOString();
      activeAction.url = page?.url() ?? null;
      activeAction.error = runnerMessage(status);
      activeAction = undefined;
    }
    padUnobserved(results, envelope, expectedUrl);
  } finally {
    if (timer) clearTimeout(timer);
    try { await context?.close(); } catch { if (status === "completed") status = "failed"; }
    try { await browser?.close(); } catch { if (status === "completed") status = "failed"; }
  }
  if (status !== "completed") {
    padUnobserved(results, envelope, expectedUrl);
    throw new RunnerExecutionError(runnerMessage(status), status, results, completeActionResults(envelope, actionResults));
  }
  return { assertions: results, actionResults: completeActionResults(envelope, actionResults) };
}
