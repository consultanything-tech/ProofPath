import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { LiveProposalBudgetLedgerV3 } from "../../dist/src/v2-live-ledger-v3.js";
assert.ok(process.env.PROOFPATH_GCP_ACCOUNT, "Set PROOFPATH_GCP_ACCOUNT to your deployer account.");
const deployment = JSON.parse(await readFile("outputs/gcp/live-deployment.json", "utf8"));
const migration = JSON.parse(await readFile("runs/gcp-migration/live-release-20261103/migration-config.json", "utf8"));
const origin = deployment.web;
assert.equal(new URL(origin).protocol, "https:");
const code = (await readFile("runs/v2-live/operator/v3/reviewer-code.txt", "utf8")).trim();
const hash = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const get = (path, authenticated = true) => fetch(origin + path, { headers: authenticated ? { Authorization: "Bearer " + code } : {}, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) });
const json = async (path, authenticated = true) => { const response = await get(path, authenticated); assert.equal(response.status, 200, path); return response.json(); };
const config = await json("/api/v2/config", false); assert.equal(config.mode, "controlled-live"); assert.equal(config.planner.provider, "meta-model-api");
assert.equal((await json("/api/config", false)).authenticationRequired, true);
for (const path of ["/api/v2/regressions", `/runs/${migration.v1RunIds[0]}/manifest.json`, `/api/v2/runs/${migration.v2RunIds[0]}`]) assert.equal((await get(path, false)).status, 401, "Reviewer code required: " + path);
for (const path of ["/shop.html?revision=fixed", "/v2-target/r1/index.html"]) assert.equal((await get(path, false)).status, 404, "Fixture must remain private.");
let screenshots = 0; const v1 = [];
for (const id of migration.v1RunIds) {
  const report = await json(`/runs/${id}/manifest.json`);
  assert.deepEqual(report, JSON.parse(await readFile(`runs/${id}/manifest.json`, "utf8")));
  for (const a of report.assertions) if (a.screenshotSha256) {
    const path = `/evidence/${id}/${a.screenshot}`;
    assert.equal((await get(path, false)).status, 401);
    const response = await get(path); assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), a.screenshotSha256); screenshots++;
  }
  v1.push(report);
}
const sourceV2 = JSON.parse(await readFile("runs/v2-live/data/runs/v2/state.json", "utf8"));
for (const id of migration.v2RunIds) {
  const report = await json(`/api/v2/runs/${id}`); assert.deepEqual(report, sourceV2.runs[id]);
  for (const a of report.records.flatMap((r) => r.assertions)) if (a.screenshotSha256) {
    const response = await get(`/api/v2/runs/${id}/evidence/${a.screenshot}`); assert.equal(response.status, 200);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), a.screenshotSha256); screenshots++;
  }
  for (const artifact of ["bug-packet", "playwright.test.mjs"]) assert.equal((await get(`/api/v2/runs/${id}/${artifact}`)).status, 200);
}
await json("/api/v2/regressions");
assert.equal((await fetch(deployment.worker + "/internal/execute", { method: "POST", body: "{}", signal: AbortSignal.timeout(30_000) })).status, 403);
const browser = await chromium.launch({ headless: true });
const blocked = []; const errors = [];
await mkdir("outputs/gcp/browser", { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => { const r = route.request(); if (r.method() !== "GET") { blocked.push(r.method() + " " + new URL(r.url()).pathname); return route.abort(); } return route.continue(); });
  const v1Id = v1.find((r) => r.verdict === "PASS" && r.assertions.some((a) => a.screenshotSha256)).runId;
  for (const [name, path, input, reportSelector] of [
    ["v1", `/?run=${v1Id}`, "#reviewer-code", "#report:not([hidden])"],
    ["v2", `/workbench.html?run=${migration.v2RunIds[0]}`, "#v2-reviewer-code", "#v2-report:not([hidden])"]
  ]) {
    await page.goto(origin + path); await page.locator(input).waitFor({ state: "visible" }); await page.locator(input).fill(code);
    if (name === "v2") await page.locator("#v2-unlock").click();
    await page.locator(reportSelector).waitFor({ state: "visible", timeout: 60_000 });
    if (name === "v1") await page.waitForFunction((selector) => { const images = [...document.querySelector(selector).querySelectorAll("img")]; return images.length > 0 && images.every((i) => i.complete && i.naturalWidth > 0); }, reportSelector, { timeout: 60_000 });
    else {
      assert.ok((await page.locator("#v2-controlled-note").innerText()).includes(`Plan limits: ${config.proposalLimit.perCode} per code and ${config.proposalLimit.total} total`));
      const link = page.getByRole("link", { name: "Open verified screenshot" }).first();
      const filename = (await link.getAttribute("href")).split("/").pop();
      const expected = sourceV2.runs[migration.v2RunIds[0]].records.flatMap((r) => r.assertions).find((a) => a.screenshot === filename).screenshotSha256;
      const downloaded = page.waitForEvent("download"); await link.click();
      assert.equal(hash(await readFile(await (await downloaded).path())), expected);
    }
    await page.screenshot({ path: `outputs/gcp/browser/${name}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `outputs/gcp/browser/${name}-mobile.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(blocked, []); assert.deepEqual(errors, []);
} finally { await browser.close(); }
const token = execFileSync("/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud", ["--account=" + process.env.PROOFPATH_GCP_ACCOUNT, "--project=proofpath-hackathon-2026", "auth", "print-access-token"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const ledgerResponse = await fetch("https://firestore.googleapis.com/v1/projects/proofpath-hackathon-2026/databases/(default)/documents/proofpath/live-release-20261103/records/live-ledger", { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(30_000) }); assert.ok(ledgerResponse.ok);
const raw = JSON.parse((await ledgerResponse.json()).fields.json.stringValue); assert.equal(typeof raw, "string");
const key = await readFile("runs/v2-live/operator/v3/ledger.key");
const state = await LiveProposalBudgetLedgerV3.fromSignedState(raw, key).snapshot();
const source = await LiveProposalBudgetLedgerV3.fromSignedState(await readFile("runs/v2-live/operator/v3/ledger/live-ledger-v3.json", "utf8"), key).snapshot();
assert.deepEqual(state, source, "Hosted verification must not change accounting.");
const result = { verifiedAt: new Date().toISOString(), web: origin, image: deployment.image, v1Reports: v1.length, v2Reports: migration.v2RunIds.length, verifiedScreenshots: screenshots, desktopAndMobile: true, browserErrors: errors.length, workerUnauthenticatedStatus: 403, reviewerAuthentication: true, ledgerPreserved: true, reservations: state.reservations.length, reservedUsd: state.reservations.length * state.policy.reservationMicrousd / 1e6, liveAdmissionBlocked: Boolean(state.liveAdmissionBlocked), providerCalls: 0 };
await writeFile("outputs/gcp/live-verification.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
