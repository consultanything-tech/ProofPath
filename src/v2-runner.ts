import { createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { digestV2 } from "./v2-checkout.js";
import type { CaseAssertion, CaseDefinition, CaseReleaseRecord, ExpectedCase, ReleaseRef, SuiteApproval, SuiteRun, V2ActionResult, V2AssertionResult } from "./v2-contracts.js";
import { V2Store } from "./v2-store.js";

const CASE_TIMEOUT_MS = 30_000;
const SUITE_TIMEOUT_MS = 180_000;
const publicRoot = resolve(process.cwd(), "public");

export type ComparisonOutcome = { readonly verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly fingerprint: string; readonly observed: boolean };
export type ComparisonClass = "regression" | "resolved-failure" | "persistent-failure" | "stable-observation" | "expectation-met" | "expectation-not-met" | "inconclusive" | "non-comparable";
export type V2Execution = { readonly records: readonly CaseReleaseRecord[]; readonly coverage: readonly string[] };
export type V2RunnerOptions = { readonly execute?: (approval: SuiteApproval, run: SuiteRun) => Promise<V2Execution | void>; readonly limits?: { readonly caseMs?: number; readonly suiteMs?: number }; readonly gate?: { acquire(): boolean; release(): void } };

export function classifyComparison(previous: ComparisonOutcome | null | undefined, proposed: ComparisonOutcome | null | undefined, scope: "unchanged" | "new-or-changed"): ComparisonClass {
  if (!previous || !proposed || !previous.observed || !proposed.observed || previous.verdict === "INCONCLUSIVE" || proposed.verdict === "INCONCLUSIVE") return "inconclusive";
  if (previous.fingerprint !== proposed.fingerprint) return "non-comparable";
  if (scope === "new-or-changed") return proposed.verdict === "PASS" ? "expectation-met" : "expectation-not-met";
  if (previous.verdict === "PASS" && proposed.verdict === "FAIL") return "regression";
  if (previous.verdict === "FAIL" && proposed.verdict === "PASS") return "resolved-failure";
  if (previous.verdict === "FAIL" && proposed.verdict === "FAIL") return "persistent-failure";
  return "stable-observation";
}

export function createV2Runtime(store: V2Store, origin: string, options: V2RunnerOptions = {}) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("V2 runtime requires a local loopback origin.");
  let active = false;
  const execute = options.execute ?? ((approval: SuiteApproval, run: SuiteRun) => executePaired(approval, run, store, origin, options.limits));
  return {
    async start(approvalId: string): Promise<{ runId: string }> {
      // This is intentionally before the first await: a rejected request cannot consume an approval.
      if (active || (options.gate && !options.gate.acquire())) throw new Error("Another approved run is already in progress.");
      active = true;
      try {
        const approval = await store.consumeApproval(approvalId);
        const accepted = await store.createJob(approval);
        const running = await store.markRunning(accepted.id);
        void (async () => {
          try {
            const result = await execute(approval, running);
            await store.completeJob(running.id, result?.records ?? [], result?.coverage ?? ["Runner returned without complete paired observations."]);
          } catch {
            try { await store.completeJob(running.id, [], ["Runner failed before complete paired observations were captured."]); } catch { /* Durable progress remains recoverable; never replace it with an empty run. */ }
          } finally { active = false; options.gate?.release(); }
        })();
        return { runId: accepted.id };
      } catch (error) {
        active = false;
        options.gate?.release();
        throw error;
      }
    },
    read(runId: string): Promise<SuiteRun> { return store.readJob(runId); }
  };
}

async function executePaired(approval: SuiteApproval, run: SuiteRun, store: V2Store, origin: string, limits: V2RunnerOptions["limits"]): Promise<V2Execution> {
  const suiteMs = limits?.suiteMs ?? SUITE_TIMEOUT_MS;
  const caseMs = limits?.caseMs ?? CASE_TIMEOUT_MS;
  if (limits && (suiteMs > SUITE_TIMEOUT_MS || caseMs > CASE_TIMEOUT_MS)) throw new Error("Runtime limits cannot exceed the reviewed production bounds.");
  await Promise.all(approval.definition.releases.map((release) => verifyRelease(release)));
  if (digestV2(approval.definition.releases.map((release) => release.fingerprint)) !== approval.grounding.pairFingerprint) throw new Error("Approved release pair fingerprint changed.");
  const records: CaseReleaseRecord[] = [];
  const coverage = [...approval.definition.requirement.coverageGaps];
  const started = Date.now();
  for (const item of approval.definition.cases) {
    for (const release of approval.definition.releases) {
      if (Date.now() - started >= suiteMs) return { records, coverage: [...coverage, "Suite deadline reached before all reviewed cases completed."] };
      const expectation = approval.expectations[approval.definition.cases.indexOf(item)]!;
      const record = await executeCase(item, expectation, release, run.id, store, origin, Math.min(caseMs, suiteMs - (Date.now() - started)));
      records.push(record);
      await store.appendRecord(run.id, record);
    }
  }
  return { records, coverage };
}

async function verifyRelease(release: ReleaseRef): Promise<void> {
  const hash = createHash("sha256");
  for (const resource of release.resources) {
    if (!/^\/v2-target\/[a-z0-9./-]+$/.test(resource) || resource.includes("..")) throw new Error("Release includes an invalid resource.");
    const file = resolve(publicRoot, `.${resource}`);
    if (!file.startsWith(publicRoot)) throw new Error("Release resource escapes the trusted public root.");
    hash.update(await readFile(file));
  }
  if (`sha256:${hash.digest("hex")}` !== release.fingerprint) throw new Error("Registered release fingerprint changed.");
}

async function executeCase(definition: CaseDefinition, expected: ExpectedCase, release: ReleaseRef, runId: string, store: V2Store, origin: string, timeoutMs: number): Promise<CaseReleaseRecord> {
  const startedAt = new Date().toISOString();
  const actions: V2ActionResult[] = [];
  const assertions: V2AssertionResult[] = [];
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(1, deadline - Date.now());
  let context: BrowserContext | undefined;
  let browser: import("playwright").Browser | undefined;
  let page: Page | undefined;
  const url = new URL(release.documentPath, origin).toString();
  let blocked = false;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void context?.close().catch(() => {}); void browser?.close().catch(() => {}); }, timeoutMs);
  try {
    browser = await chromium.launch({ headless: true, timeout: remaining() });
    try {
      context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, permissions: [] });
      context.setDefaultTimeout(remaining());
      context.setDefaultNavigationTimeout(remaining());
      const permitted = new Set(release.resources);
      await context.route("**/*", async (route) => {
        const request = route.request();
        const requestUrl = new URL(request.url());
        if (request.method() !== "GET" || requestUrl.origin !== origin || !permitted.has(requestUrl.pathname) || requestUrl.search || requestUrl.hash) { blocked = true; await route.abort(); return; }
        try {
          const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: remaining() });
          if (!response.ok() || response.status() >= 300) { blocked = true; await route.abort(); return; }
          await route.fulfill({ response });
        } catch { blocked = true; await route.abort().catch(() => {}); }
      });
      await context.routeWebSocket("**/*", async (socket) => { blocked = true; await socket.close(); });
      page = await context.newPage();
      page.on("popup", (popup) => { blocked = true; void popup.close().catch(() => {}); });
      page.on("download", (download) => { blocked = true; void download.cancel().catch(() => {}); });
      for (const action of definition.actions) {
        const started = new Date().toISOString();
        try {
          if (timedOut || Date.now() >= deadline) throw new Error("Case deadline reached.");
          if (blocked) throw new Error("Browser request was blocked.");
          await perform(action, page, url, remaining());
          if (blocked || page.url() !== url) throw new Error("Browser left the approved release.");
          actions.push({ id: action.id, status: "completed", startedAt: started, endedAt: new Date().toISOString(), url: page.url() });
        } catch {
          actions.push({ id: action.id, status: blocked ? "blocked" : "failed", startedAt: started, endedAt: new Date().toISOString(), url: page.url(), error: "Approved action could not be completed." });
          throw new Error("Approved action could not be completed.");
        }
      }
      for (const assertion of definition.assertions) {
        if (timedOut || Date.now() >= deadline) throw new Error("Case deadline reached.");
        assertions.push(await observe(assertion, expected, definition, release, runId, store, page, remaining()));
      }
    } finally { await context?.close().catch(() => {}); await browser?.close().catch(() => {}); }
  } catch {
    for (const action of definition.actions) if (!actions.some((result) => result.id === action.id)) actions.push({ id: action.id, status: "not-run", startedAt: null, endedAt: null, url: null });
    for (const assertion of definition.assertions) if (!assertions.some((result) => result.id === assertion.id)) assertions.push({ id: assertion.id, expected: expectedFor(assertion, expected), observed: null, verdict: "INCONCLUSIVE", screenshot: "not-captured.png", timestamp: new Date().toISOString(), url });
  } finally { clearTimeout(timer); }
  const verdict = assertions.some((result) => result.verdict === "FAIL") ? "FAIL" : assertions.some((result) => result.verdict === "INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
  return { caseId: definition.id, releaseId: release.id, actions, assertions, verdict, startedAt, endedAt: new Date().toISOString() };
}

async function perform(action: CaseDefinition["actions"][number], page: Page, url: string, timeoutMs: number): Promise<void> {
  if (action.kind === "open-app") { await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs }); return; }
  if (action.kind === "add-product") return visible(page, `[data-sku="${action.target}"]`, timeoutMs).click();
  if (action.kind === "remove-product") return visible(page, `#remove-${action.target}`, timeoutMs).click();
  if (action.kind === "set-quantity") { const input = visible(page, `#quantity-${action.target}`, timeoutMs); await input.fill(String(action.value)); await input.press("Tab"); return; }
  if (action.kind === "fill-coupon") return visible(page, "#coupon", timeoutMs).fill(action.value);
  if (action.kind === "apply-coupon") return visible(page, "#apply-coupon", timeoutMs).click();
  if (action.kind === "open-contact") return visible(page, "#checkout", timeoutMs).click();
  if (action.kind === "fill-contact") return visible(page, `#${action.target}`, timeoutMs).fill(action.value);
  return visible(page, "#confirm", timeoutMs).click();
}

function visible(page: Page, selector: string, timeout: number) {
  const locator = page.locator(selector);
  return {
    async click() { if (await locator.count() !== 1 || !await locator.isVisible()) throw new Error("Required control is missing, ambiguous, or hidden."); await locator.click({ timeout }); },
    async fill(value: string) { if (await locator.count() !== 1 || !await locator.isVisible()) throw new Error("Required control is missing, ambiguous, or hidden."); await locator.fill(value, { timeout }); },
    async press(key: string) { if (await locator.count() !== 1 || !await locator.isVisible()) throw new Error("Required control is missing, ambiguous, or hidden."); await locator.press(key, { timeout }); }
  };
}

async function observe(assertion: CaseAssertion, expected: ExpectedCase, definition: CaseDefinition, release: ReleaseRef, runId: string, store: V2Store, page: Page, timeoutMs: number): Promise<V2AssertionResult> {
  const screenshot = `${definition.id}-${release.id}-${assertion.id}.png`;
  const file = join(store.runDirectory(runId), screenshot);
  await mkdir(store.runDirectory(runId), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, timeout: timeoutMs });
  const expectedValue = expectedFor(assertion, expected);
  const observed = await observedFor(assertion, definition, page);
  return { id: assertion.id, expected: expectedValue, observed: observed === undefined ? null : observed, verdict: observed === undefined ? "INCONCLUSIVE" : digestV2(observed) === digestV2(expectedValue) ? "PASS" : "FAIL", screenshot, screenshotSha256: `sha256:${createHash("sha256").update(await readFile(file)).digest("hex")}`, timestamp: new Date().toISOString(), url: page.url() };
}
function expectedFor(assertion: CaseAssertion, expected: ExpectedCase): unknown {
  if (assertion.predicate === "total-minor") return expected.totalMinor;
  if (assertion.predicate === "coupon-error") return expected.couponError;
  if (assertion.predicate === "contact-errors") return expected.contactErrors;
  return expected.syntheticConfirmation;
}
async function observedFor(assertion: CaseAssertion, definition: CaseDefinition, page: Page): Promise<unknown | undefined> {
  if (assertion.predicate === "total-minor") return exactText(page, "#total-minor", /^\d+$/).then((value) => value === undefined ? undefined : Number(value));
  if (assertion.predicate === "coupon-error") return stateText(page, "#coupon-error", "invalid-coupon");
  if (assertion.predicate === "contact-errors") return Promise.all([stateText(page, "#email-error", "required"), stateText(page, "#postal-code-error", "required")]).then(([email, postalCode]) => email === undefined || postalCode === undefined ? undefined : { email, postalCode });
  return stateText(page, "#confirmation", "confirmed").then((state) => state === undefined ? undefined : state === "confirmed" ? state : definition.actions.some((action) => action.kind === "confirm-synthetic-order") ? "blocked" : "not-requested");
}
async function exactText(page: Page, selector: string, pattern: RegExp): Promise<string | undefined> { const locator = page.locator(selector); if (await locator.count() !== 1 || !await locator.isVisible()) return undefined; const text = (await locator.textContent())?.trim() ?? ""; return pattern.test(text) ? text : undefined; }
async function stateText(page: Page, selector: string, value: string): Promise<string | null | undefined> { const locator = page.locator(selector); if (await locator.count() !== 1) return undefined; return await locator.isVisible() ? value : null; }
