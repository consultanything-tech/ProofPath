import assert from "node:assert/strict";
import http from "node:http";
import { createV2Context } from "../dist/src/v2-checkout.js";
import { inspectRegisteredTarget } from "../dist/src/v2-planner.js";
import { chromium } from "playwright";

// CI uses a disposable volume, fixture planning and --network none. No provider
// credential, reviewer ledger or generation request is involved in this check.
assert.equal(process.env.PROOFPATH_RUNTIME, "hosted");
assert.equal(process.env.V2_PLANNER_MODE, "fixture");
assert.ok(!process.env.MODEL_API_KEY && !process.env.BASETEN_API_KEY);
const origin = new URL(process.env.PUBLIC_ORIGIN);
const port = Number(process.env.PORT);
const fixturePort = Number(process.env.FIXTURE_PORT);

function get(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, headers: { Host: host }, timeout: 5000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("timeout", () => req.destroy(new Error("Container smoke timed out.")));
    req.on("error", reject);
    req.end();
  });
}

assert.equal((await get(port, "/healthz", origin.host)).status, 200);
assert.equal((await get(port, "/healthz", "attacker.invalid")).status, 400);
assert.equal((await get(port, "/workbench.html", origin.host)).status, 200);
assert.equal((await get(port, "/api/config", origin.host)).status, 404);
assert.equal((await get(port, "/v2-target/r1/index.html", origin.host)).status, 404);
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
assert.equal((await get(fixturePort, "/v2-target/r1/index.html", `127.0.0.1:${fixturePort}`)).status, 200);
assert.equal((await get(fixturePort, "/api/v2/config", `127.0.0.1:${fixturePort}`)).status, 404);
const grounding = await inspectRegisteredTarget(createV2Context(fixtureOrigin));
assert.ok(grounding.observedTargets.length > 0);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${fixtureOrigin}/v2-target/r1/index.html`);
  await page.locator('[data-sku="desk-lamp"]').click();
  await page.waitForFunction(() => document.querySelector("#subtotal-minor")?.textContent === "4000");
} finally { await browser.close(); }
console.log(JSON.stringify({ containerSmoke: "PASS", chromiumInspection: "PASS", checkoutInteraction: "PASS", fixtureOrigin, observedTargets: grounding.observedTargets.length, generationRequests: 0 }));
