import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { evidencePath } from "./evidence.js";
import { fixturePath } from "./scenarios.js";
import type { ApprovalEnvelope } from "./plan-store.js";
import type { AssertionResult } from "./verdict.js";

export class RunnerExecutionError extends Error {
  constructor(message: string, readonly assertions: AssertionResult[]) {
    super(message);
    this.name = "RunnerExecutionError";
  }
}

export function parseVisibleSgdMinor(value: string | null): string | null {
  const match = value?.trim().match(/^S\$(\d+)\.(\d{2})$/);
  if (!match) return null;
  return String(Number(match[1]) * 100 + Number(match[2]));
}

export async function runApprovedPlan(envelope: ApprovalEnvelope, origin: string, runId: string): Promise<AssertionResult[]> {
  const plan = envelope.plan;
  const expectedOrigin = new URL(origin).origin;
  const expectedUrl = new URL(fixturePath(envelope.scenario), origin).toString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const page = await context.newPage();
  let blocked = false;
  await context.route("**/*", async (route) => {
    const target = new URL(route.request().url());
    if (target.origin !== expectedOrigin || (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame() && target.toString() !== expectedUrl)) { blocked = true; return route.abort(); }
    return route.continue();
  });
  page.on("popup", (popup) => { blocked = true; void popup.close(); });
  try {
    for (const action of plan.actions) {
      if (action.kind === "navigate") {
        await page.goto(expectedUrl, { waitUntil: "networkidle", timeout: 10_000 });
        if (page.url() !== expectedUrl) throw new Error("Fixture navigation left the approved route.");
      }
      if (action.kind === "click" && action.target === "add-desk-lamp") await page.getByRole("button", { name: "Add Desk Lamp" }).click({ timeout: 10_000 });
      if (action.kind === "fill" && action.target === "quantity") await page.getByLabel("Quantity").fill(action.value ?? "");
    }
    const results: AssertionResult[] = [];
    for (let index = 0; index < plan.assertions.length; index += 1) {
      const assertion = plan.assertions[index];
      const filename = `${assertion.id}.png`;
      try {
        const output = evidencePath(runId, filename);
        await mkdir(dirname(output), { recursive: true });
        await page.screenshot({ path: output, fullPage: true });
        let observed: string | null = null;
        if (!blocked && assertion.predicate === "cart-quantity-equals") observed = await page.locator("#cart-quantity").textContent();
        if (!blocked && assertion.predicate === "cart-total-minor-equals") {
          const total = page.locator("#cart-total");
          observed = await total.isVisible() ? parseVisibleSgdMinor(await total.textContent()) : null;
        }
        const value = observed?.trim() ?? null;
        results.push({ id: assertion.id, expected: assertion.expected, observed: value, verdict: value === null ? "INCONCLUSIVE" : value === assertion.expected ? "PASS" : "FAIL", screenshot: filename, timestamp: new Date().toISOString(), url: page.url() });
      } catch (error) {
        const timestamp = new Date().toISOString();
        results.push({ id: assertion.id, expected: assertion.expected, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp, url: page.url() });
        for (const missing of plan.assertions.slice(index + 1)) {
          results.push({ id: missing.id, expected: missing.expected, observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp, url: page.url() });
        }
        throw new RunnerExecutionError(error instanceof Error ? error.message : "Evidence capture failed.", results);
      }
    }
    return results;
  } finally {
    await context.close();
    await browser.close();
  }
}
