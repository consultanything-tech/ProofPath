import type { SuiteApproval, SuiteRun } from "./v2-contracts.js";

type ArtifactApproval = Pick<SuiteApproval, "definition" | "expectations" | "provenance" | "digest">;

const literal = (value: unknown) => JSON.stringify(value, null, 2)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function snapshot(run: SuiteRun): ArtifactApproval {
  return { ...run.artifact, digest: run.approvalDigest };
}

export function renderBugPacket(run: SuiteRun): string {
  const approval = snapshot(run);
  return [
    "# ProofPath bug packet", "", "Fixture-only synthetic checkout evidence. This packet records observed behavior; it does not assert a root cause.", "",
    "```json", literal({
      version: "2", run: { id: run.id, approvalDigest: run.approvalDigest, status: run.status, verdict: run.verdict, candidateVerdict: run.candidateVerdict, startedAt: run.startedAt, endedAt: run.endedAt },
      reviewed: { app: { id: approval.definition.app.appId, adapterVersion: approval.definition.app.adapterVersion }, referenceId: approval.definition.referenceId, source: approval.definition.requirement.originalText, criteria: approval.definition.requirement.criteria, rules: approval.definition.rules, coverageGaps: approval.definition.requirement.coverageGaps, releases: approval.definition.releases.map(({ id, documentPath, fingerprint }) => ({ id, documentPath, fingerprint })), cases: approval.definition.cases, provenance: approval.provenance },
      expectations: approval.expectations,
      observations: run.records.map((record) => ({ caseId: record.caseId, releaseId: record.releaseId, verdict: record.verdict, actions: record.actions, assertions: record.assertions.map(({ id, expected, observed, verdict, screenshot, screenshotSha256, timestamp, url }) => ({ id, expected, observed, verdict, screenshot, screenshotSha256: screenshotSha256 ?? null, timestamp, url })) })),
      comparisons: run.comparisons,
      coverage: run.coverage
    }), "```", ""
  ].join("\n");
}

export function renderPlaywrightExport(approval: SuiteApproval): string {
  return renderExport(approval);
}

export function renderHistoricalPlaywrightExport(run: SuiteRun): string {
  return renderExport(snapshot(run));
}

function renderExport(approval: ArtifactApproval): string {
  const payload = literal({ definition: approval.definition, expectations: approval.expectations, digest: approval.digest });
  return `import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { chromium } from "playwright";

const approval = ${payload};
const origin = process.env.PROOFPATH_ORIGIN;
const selectedRelease = process.env.PROOFPATH_RELEASE;
if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(origin ?? "")) throw new Error("Set PROOFPATH_ORIGIN to the local ProofPath origin.");
const releases = selectedRelease ? approval.definition.releases.filter((release) => release.id === selectedRelease) : approval.definition.releases;
if (!releases.length || (selectedRelease && releases.length !== 1)) throw new Error("PROOFPATH_RELEASE must name one approved release.");
const verify = async (release) => { const hash = createHash("sha256"); const bodies = new Map(); for (const path of release.resources) { const url = new URL(path, origin); const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) }); if (!response.ok || response.url !== url.toString()) throw new Error("Approved resource could not be fetched without redirect."); const body = Buffer.from(await response.arrayBuffer()); if (body.length > 1048576) throw new Error("Approved resource exceeds export limit."); bodies.set(path, body); hash.update(body); } if ('sha256:' + hash.digest("hex") !== release.fingerprint) throw new Error("Approved release bytes changed."); return bodies; };
const expectedFor = (assertion, expected) => assertion.predicate === "total-minor" ? expected.totalMinor : assertion.predicate === "coupon-error" ? expected.couponError : assertion.predicate === "contact-errors" ? expected.contactErrors : expected.syntheticConfirmation;
const action = async (page, entry, url) => {
  if (entry.kind === "open-app") return page.goto(url, { waitUntil: "networkidle" });
  if (entry.kind === "add-product") return page.locator('[data-sku="' + entry.target + '"]').click();
  if (entry.kind === "remove-product") return page.locator('#remove-' + entry.target).click();
  if (entry.kind === "set-quantity") { const input = page.locator('#quantity-' + entry.target); await input.fill(String(entry.value)); return input.press("Tab"); }
  if (entry.kind === "fill-coupon") return page.locator("#coupon").fill(entry.value);
  if (entry.kind === "apply-coupon") return page.locator("#apply-coupon").click();
  if (entry.kind === "open-contact") return page.locator("#checkout").click();
  if (entry.kind === "fill-contact") return page.locator('#' + entry.target).fill(entry.value);
  return page.locator("#confirm").click();
};
const only = async (page, selector, visible = false) => { const locator = page.locator(selector); if (await locator.count() !== 1 || (visible && !await locator.isVisible())) throw new Error("Reviewed control is missing, duplicate, or hidden."); return locator; };
const observe = async (page, assertion, definition) => {
  if (assertion.predicate === "total-minor") { const locator = await only(page, "#total-minor", true); const value = (await locator.textContent()).trim(); if (!/^\\d+$/.test(value)) throw new Error("Total observation is invalid."); return Number(value); }
  if (assertion.predicate === "coupon-error") { const locator = await only(page, "#coupon-error"); return await locator.isVisible() ? "invalid-coupon" : null; }
  if (assertion.predicate === "contact-errors") { const email = await only(page, "#email-error"); const postal = await only(page, "#postal-code-error"); return { email: await email.isVisible() ? "required" : null, postalCode: await postal.isVisible() ? "required" : null }; }
  const locator = await only(page, "#confirmation"); return await locator.isVisible() ? "confirmed" : definition.actions.some((item) => item.kind === "confirm-synthetic-order") ? "blocked" : "not-requested";
};
for (const release of releases) {
  const bodies = await verify(release);
  test('reviewed checkout assertions on ' + release.id, { timeout: 180000 }, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, permissions: [] }); let boundary = false; const deadline = Date.now() + 180000;
    try {
      const permitted = new Set(release.resources);
      await context.route("**/*", async (route) => {
        const request = route.request(); const target = new URL(request.url());
        if (request.method() !== "GET" || target.origin !== origin || !permitted.has(target.pathname) || target.search || target.hash) { boundary = true; return route.abort(); }
        await route.fulfill({ body: bodies.get(target.pathname), contentType: target.pathname.endsWith(".js") ? "text/javascript" : "text/html" });
      });
      await context.routeWebSocket("**/*", async (socket) => { boundary = true; await socket.close(); });
      for (const [index, definition] of approval.definition.cases.entries()) {
        if (Date.now() >= deadline) throw new Error("Suite deadline reached.");
        const page = await context.newPage(); const url = new URL(release.documentPath, origin).toString();
        page.on("popup", (popup) => { boundary = true; void popup.close(); }); page.on("download", (download) => { boundary = true; void download.cancel(); });
        for (const entry of definition.actions) await action(page, entry, url);
        for (const assertion of definition.assertions) assert.deepEqual(await observe(page, assertion, definition), expectedFor(assertion, approval.expectations[index]));
        assert.equal(boundary, false, "Browser crossed the reviewed resource boundary.");
        await page.close();
      }
    } finally { await context.close(); await browser.close(); }
  });
}
`;
}
