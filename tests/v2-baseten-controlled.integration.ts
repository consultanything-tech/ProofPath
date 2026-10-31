import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createProofPathServer } from "../src/server.js";
import { createPlanner } from "../src/planner.js";
import { createV2Planner } from "../src/v2-planner.js";
import { ProposalBudgetError, ReviewerCodeRegistry } from "../src/v2-proposal-budget.js";
import type { V2ProposalService } from "../src/v2-http.js";

test("Baseten-labeled protected UI preserves model provenance and report access after exhaustion", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-baseten-ui-"));
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = root;
  const code = randomBytes(24).toString("base64url");
  const pepper = randomBytes(32);
  const registry = new ReviewerCodeRegistry(pepper, [ReviewerCodeRegistry.digest(pepper, code)]);
  let proposals = 0;
  let inspections = 0;
  // Scripted UI backend: this test makes no real Baseten or Meta request.
  const service: V2ProposalService = {
    requiresAuthentication: true,
    publicMetadata: { provider: "baseten", model: "meta-models/muse-spark-open-1026", protocol: "responses", schemaEnforcement: "local" },
    async authenticate(header) { return registry.authenticate(header); },
    async authorize(header) {
      const principal = registry.authenticate(header);
      if (proposals >= 1) throw new ProposalBudgetError(429, "Proposal budget is exhausted.");
      return principal;
    },
    async propose(context, principal) {
      assert.ok(registry.owns(principal));
      proposals += 1;
      return {
        proposal: await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context),
        reservationId: "synthetic-ui-reservation",
        provenance: ["baseten-responses-live-v1", "schema-locally-enforced", "reservation:synthetic-ui-reservation"]
      };
    }
  };
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const instance = createProofPathServer(address.port, createPlanner({ PLANNER_MODE: "fixture" }), {
    proposalService: service, inspect: async (context) => { inspections += 1; return context.grounding; }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => instance.server.listen(address.port, "127.0.0.1", resolve));
    const config = await (await fetch(instance.origin + "/api/v2/config")).json() as { mode: string; authenticationRequired: boolean; planner: { provider: string } };
    assert.equal(config.mode, "controlled-live"); assert.equal(config.authenticationRequired, true); assert.equal(config.planner.provider, "baseten");
    assert.equal((await fetch(instance.origin + "/api/plans", { method: "POST" })).status, 403);
    assert.equal((await fetch(instance.origin + "/api/v2/groundings")).status, 401);
    assert.equal(inspections, 0);
    const headers = { "Content-Type": "application/json", Origin: instance.origin, Authorization: `Bearer ${code}` };
    const selected = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers,
      body: JSON.stringify({ requirement: "An invalid coupon must display an error.", releases: ["r1", "r2"], provider: "meta" }) });
    assert.equal(selected.status, 400); assert.equal(proposals, 0); assert.equal(inspections, 0);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(10_000);
    await page.goto(instance.origin + "/workbench.html");
    await page.locator("#v2-reviewer-code").waitFor({ state: "visible" });
    assert.match(await page.locator("#v2-mode-label").innerText(), /Baseten-hosted Meta/);
    assert.match(await page.locator("#v2-controlled-note").innerText(), /validates model output locally/);
    await page.locator("#v2-reviewer-code").fill(code);
    await page.locator("#v2-requirement").fill("An invalid coupon must display an error.");
    await page.getByRole("button", { name: "Inspect registered pair and propose" }).click();
    await page.getByRole("heading", { name: "2. Review exact rules, cases and gaps" }).waitFor();
    assert.match(await page.locator("#v2-review-output").innerText(), /Baseten-hosted Meta/);
    for (const check of await page.locator("[data-accept], [data-reference], [data-gap]").all()) await check.check();
    for (const scope of await page.locator("[data-scope]").all()) await scope.selectOption("unchanged");
    await page.getByRole("button", { name: "Compile reviewed snapshot" }).click();
    await page.getByRole("heading", { name: "3. Final one-use approval" }).waitFor();
    assert.match(await page.locator("#v2-approval-output").innerText(), /Baseten-hosted Meta/);
    await page.getByRole("button", { name: "Approve exact reviewed snapshot" }).click();
    await page.getByRole("button", { name: "Run approved pair" }).click();
    await page.getByText("Paired run completed; save the immutable definition or download artifacts.").waitFor({ timeout: 35_000 });
    assert.match(await page.locator("#v2-report-output").innerText(), /Baseten-hosted Meta/);
    const reopen = await page.getByRole("link", { name: "Open this report" }).getAttribute("href");
    assert.ok(reopen);
    const exhausted = await fetch(instance.origin + "/api/v2/proposals", { method: "POST", headers,
      body: JSON.stringify({ requirement: "An invalid coupon must display an error.", releases: ["r1", "r2"] }) });
    assert.equal(exhausted.status, 429); assert.equal(proposals, 1);
    await page.goto(instance.origin + reopen);
    await page.locator("#v2-reviewer-code").waitFor({ state: "visible" });
    assert.equal(await page.locator("#v2-reviewer-code").inputValue(), "");
    await page.locator("#v2-reviewer-code").fill(code);
    await page.getByRole("button", { name: "Open protected workbench" }).click();
    await page.getByText("Loaded persisted read-only run report.").waitFor();
    assert.match(await page.locator("#v2-report-output").innerText(), /Baseten-hosted Meta/);
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Download bug packet" }).click();
    const download = await downloading; const path = await download.path(); assert.ok(path);
    const contents = await readFile(path, "utf8");
    assert.match(contents, /baseten-responses-live-v1/); assert.ok(!contents.includes(code));
    assert.equal(proposals, 1);
    assert.deepEqual(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })), { local: 0, session: 0 });
  } finally {
    await browser?.close(); instance.server.closeAllConnections();
    await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    previous === undefined ? delete process.env.DATA_DIR : process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
