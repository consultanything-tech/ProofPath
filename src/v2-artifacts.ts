import type { SuiteApproval, SuiteRun } from "./v2-contracts.js";

type ArtifactApproval = Pick<SuiteApproval, "definition" | "expectations" | "grounding" | "provenance" | "digest">;

const literal = (value: unknown) => JSON.stringify(value, null, 2)
  .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function snapshot(run: SuiteRun): ArtifactApproval {
  return { ...run.artifact, grounding: { releases: run.artifact.definition.releases, observedTargets: [], declaredTargets: run.artifact.definition.app.semanticTargets.map((target) => target.id), pairFingerprint: "historical-run" }, digest: run.approvalDigest };
}

export function renderBugPacket(run: SuiteRun): string {
  const approval = snapshot(run);
  return [
    "# ProofPath bug packet", "", "Fixture-only synthetic checkout evidence. This packet records observed behavior; it does not assert a root cause.", "",
    "```json", literal({
      version: "2", run: { id: run.id, approvalDigest: run.approvalDigest, status: run.status, verdict: run.verdict, candidateVerdict: run.candidateVerdict, startedAt: run.startedAt, endedAt: run.endedAt },
      reviewed: { source: approval.definition.requirement.originalText, criteria: approval.definition.requirement.criteria, rules: approval.definition.rules, coverageGaps: approval.definition.requirement.coverageGaps, releases: approval.definition.releases.map(({ id, documentPath, fingerprint }) => ({ id, documentPath, fingerprint })), provenance: approval.provenance },
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
import test from "node:test";
import { chromium } from "playwright";

const approval = ${payload};
const origin = process.env.PROOFPATH_ORIGIN;
const selectedRelease = process.env.PROOFPATH_RELEASE;
if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(origin ?? "")) throw new Error("Set PROOFPATH_ORIGIN to the local ProofPath origin.");
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
const observe = async (page, assertion, definition) => {
  if (assertion.predicate === "total-minor") return Number((await page.locator("#total-minor").textContent()).trim());
  if (assertion.predicate === "coupon-error") return await page.locator("#coupon-error").isVisible() ? "invalid-coupon" : null;
  if (assertion.predicate === "contact-errors") return { email: await page.locator("#email-error").isVisible() ? "required" : null, postalCode: await page.locator("#postal-code-error").isVisible() ? "required" : null };
  return await page.locator("#confirmation").isVisible() ? "confirmed" : definition.actions.some((item) => item.kind === "confirm-synthetic-order") ? "blocked" : "not-requested";
};
for (const release of approval.definition.releases) {
  if (selectedRelease && selectedRelease !== release.id) continue;
  test('reviewed checkout assertions on ' + release.id, async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false, permissions: [] });
    try {
      const permitted = new Set(release.resources);
      await context.route("**/*", async (route) => {
        const request = route.request(); const target = new URL(request.url());
        if (request.method() !== "GET" || target.origin !== origin || !permitted.has(target.pathname) || target.search || target.hash) return route.abort();
        const response = await route.fetch({ maxRedirects: 0 });
        if (!response.ok() || response.status() >= 300) return route.abort();
        await route.fulfill({ response });
      });
      for (const [index, definition] of approval.definition.cases.entries()) {
        const page = await context.newPage(); const url = new URL(release.documentPath, origin).toString();
        for (const entry of definition.actions) await action(page, entry, url);
        for (const assertion of definition.assertions) assert.deepEqual(await observe(page, assertion, definition), expectedFor(assertion, approval.expectations[index]));
        await page.close();
      }
    } finally { await context.close(); await browser.close(); }
  });
}
`;
}
