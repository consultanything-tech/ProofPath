import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { createV2Context, digestV2, type ReleaseRef, type V2Context } from "../src/v2-checkout.js";
import { inspectRegisteredTarget } from "../src/v2-planner.js";
import { validateSuiteProposal } from "../src/v2-planner.js";
import { V2Store } from "../src/v2-store.js";
import { createV2Runtime } from "../src/v2-runner.js";

async function availablePort() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

async function app() {
  const port = await availablePort();
  const instance = createProofPathServer(port, createPlanner({ PLANNER_MODE: "fixture" }));
  await new Promise<void>((resolve) => instance.server.listen(port, "127.0.0.1", resolve));
  return { ...instance, close: async () => { instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve())); } };
}

function release(id: "r1" | "r2", body: string): ReleaseRef {
  return { id, documentPath: `/v2-target/${id}/index.html`, resources: [`/v2-target/${id}/index.html`], fingerprint: `sha256:${createHash("sha256").update(body).digest("hex")}` };
}

async function inspectionTarget(bodies: Record<"r1" | "r2", string>) {
  let unregisteredRequests = 0;
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://fixture").pathname;
    const match = path.match(/^\/v2-target\/(r1|r2)\/index\.html$/);
    if (req.method === "GET" && match) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(bodies[match[1] as "r1" | "r2"]);
      return;
    }
    unregisteredRequests += 1;
    res.writeHead(200, { "content-type": "application/javascript" });
    res.end("document.body.dataset.unexpected = 'yes';");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { origin: `http://127.0.0.1:${address.port}`, unregisteredRequests: () => unregisteredRequests, close: async () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

function inspectionContext(origin: string, bodies: Record<"r1" | "r2", string>): V2Context {
  const context = createV2Context(origin);
  const releases = [release("r1", bodies.r1), release("r2", bodies.r2)] as const;
  return {
    ...context,
    app: { ...context.app, inspectionPolicy: { readonlyDocuments: releases.map((item) => item.documentPath), readonlyResources: releases.flatMap((item) => item.resources), reset: "new-context" } },
    grounding: { releases, observedTargets: [], declaredTargets: context.app.semanticTargets.map((target) => target.id), pairFingerprint: digestV2(releases.map((item) => item.fingerprint)) }
  };
}

test("frozen checkout releases expose real totals and isolated synthetic state", { timeout: 15_000 }, async () => {
  let server: Awaited<ReturnType<typeof app>> | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    server = await app();
    browser = await chromium.launch({ headless: true, timeout: 10_000 });
    for (const [release, expected] of [["r1", "7700"], ["r2", "7200"], ["r3", "7700"]] as const) {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/v2-target/${release}/index.html`);
      assert.equal(await page.locator("#contact").isHidden(), true);
      assert.equal(await page.locator("#quantity-desk-lamp").count(), 0);
      await page.getByRole("button", { name: "Add Desk Lamp" }).click();
      await page.getByRole("button", { name: "Add Desk Lamp" }).click();
      await page.getByLabel("Coupon").fill("SAVE10");
      assert.equal(await page.locator("#total-minor").textContent(), "8000");
      await page.getByRole("button", { name: "Apply coupon" }).click();
      assert.equal(await page.locator("#total-minor").textContent(), expected);
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${server.origin}/v2-target/r1/index.html`);
    await page.getByRole("button", { name: "Add Desk Lamp" }).click();
    await page.getByRole("button", { name: "Add Notebook" }).click();
    await page.getByLabel("Desk Lamp quantity").fill("2");
    await page.getByLabel("Desk Lamp quantity").press("Tab");
    await page.getByRole("button", { name: "Remove Notebook" }).click();
    assert.equal(await page.locator("#total-minor").textContent(), "8000");
    await page.getByRole("button", { name: "Remove Desk Lamp" }).click();
    assert.equal(await page.locator("#cart-lines").textContent(), "Cart is empty.");
    await page.getByRole("button", { name: "Add Notebook" }).click();
    await page.getByRole("button", { name: "Checkout" }).click();
    await page.getByRole("button", { name: "Confirm synthetic order" }).click();
    await page.getByText("Email is required.").waitFor();
    await page.getByLabel("Email").fill("qa@example.test");
    await page.getByLabel("Postal code").fill("018989");
    assert.equal(await page.locator("#confirmation").isHidden(), true);
    assert.equal(await page.locator("#email-error").isHidden(), false);
    await page.getByRole("button", { name: "Confirm synthetic order" }).click();
    await page.getByText("Synthetic order confirmed.").waitFor();
    await page.getByRole("button", { name: "Checkout" }).click();
    assert.equal(await page.locator("#confirmation").isHidden(), true);
    assert.equal(await page.getByLabel("Email").isVisible(), true);
    const reopenedAfterBlank = await browser.newPage();
    await reopenedAfterBlank.goto(`${server.origin}/v2-target/r1/index.html`);
    await reopenedAfterBlank.getByRole("button", { name: "Add Desk Lamp" }).click();
    await reopenedAfterBlank.getByRole("button", { name: "Checkout" }).click();
    await reopenedAfterBlank.getByRole("button", { name: "Confirm synthetic order" }).click();
    await reopenedAfterBlank.getByRole("button", { name: "Checkout" }).click();
    assert.equal(await reopenedAfterBlank.locator("#email-error").isHidden(), false);
    assert.equal(await reopenedAfterBlank.locator("#postal-code-error").isHidden(), false);
    await reopenedAfterBlank.close();
    const isolated = await browser.newPage();
    await isolated.goto(`${server.origin}/v2-target/r1/index.html`);
    assert.equal(await isolated.locator("#cart-lines").textContent(), "Cart is empty.");
    await isolated.getByRole("button", { name: "Add Desk Lamp" }).click();
    await isolated.getByLabel("Coupon").fill("NOPE");
    await isolated.getByRole("button", { name: "Apply coupon" }).click();
    await isolated.getByText("Coupon is invalid.").waitFor();
    assert.equal(await isolated.locator("#total-minor").textContent(), "4500");
    await isolated.close();
    await page.close();
  } finally {
    await browser?.close();
    await server?.close();
  }
});

test("readonly inspection records only rendered visible controls and blocks egress", { timeout: 30_000 }, async () => {
  const hidden = "<!doctype html><button id=checkout style='display:none'>Checkout</button><input id=coupon aria-label=Coupon>";
  const instance = await inspectionTarget({ r1: hidden, r2: hidden });
  try {
    const grounding = await inspectRegisteredTarget(inspectionContext(instance.origin, { r1: hidden, r2: hidden }));
    assert.ok(!grounding.observedTargets.includes("checkout"));
    assert.ok(grounding.observedTargets.includes("coupon"));
    assert.ok(grounding.declaredTargets.includes("checkout"));
  } finally {
    await instance.close();
  }
  const sibling = "/v2-target/r3/sibling.js";
  const egress = `<!doctype html><script src='${sibling}'></script><button id=checkout>Checkout</button>`;
  const blocked = await inspectionTarget({ r1: egress, r2: egress });
  try {
    const context = inspectionContext(blocked.origin, { r1: egress, r2: egress });
    await assert.rejects(inspectRegisteredTarget({ ...context, app: { ...context.app, inspectionPolicy: { ...context.app.inspectionPolicy, readonlyResources: [...context.app.inspectionPolicy.readonlyResources, sibling] } } }), /unregistered|blocked/i);
    assert.equal(blocked.unregisteredRequests(), 0);
  } finally {
    await blocked.close();
  }
});

test("paired execution records fresh per-release evidence and exposes the seeded delivery regression", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-browser-"));
  let server: Awaited<ReturnType<typeof app>> | undefined;
  try {
    server = await app();
    const context = createV2Context(server.origin);
    const proposal = validateSuiteProposal({
      kind: "proposal",
      requirement: { version: "2", originalText: context.requirement.originalText, criteria: context.requirement.criteria, numericRuleChanges: [], expectationScope: context.requirement.expectationScope, coverageGaps: [] },
      cases: [{ id: "delivery", criterionIds: ["cart", "coupon", "delivery", "contact"], category: "interaction", rationale: "Checks discounted delivery against the reviewed oracle.", actions: [
        { id: "open", kind: "open-app", target: "checkout", value: null }, { id: "lamp-one", kind: "add-product", target: "desk-lamp", value: null }, { id: "lamp-two", kind: "add-product", target: "desk-lamp", value: null },
        { id: "coupon", kind: "fill-coupon", target: "coupon", value: "SAVE10" }, { id: "apply", kind: "apply-coupon", target: "coupon", value: null }
      ], assertions: [{ id: "total", predicate: "total-minor" }] }], gaps: []
    }, context);
    const review = { decisions: context.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged" as const, adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: [], acceptedNumericRuleChanges: [] })) };
    const store = new V2Store(root);
    const prepared = await store.createProposal(proposal, context);
    const suite = await store.reviewProposal(prepared.id, review);
    const approval = await store.approveSuite(suite.id);
    const runtime = createV2Runtime(store, server.origin);
    const { runId } = await runtime.start(approval.id);
    let run = await runtime.read(runId);
    for (let attempts = 0; run.status !== "completed" && attempts < 100; attempts += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      run = await runtime.read(runId);
    }
    assert.equal(run.status, "completed");
    assert.deepEqual(run.records.map((record) => [record.releaseId, record.verdict]), [["r1", "PASS"], ["r2", "FAIL"]]);
    assert.match(run.records[0]!.assertions[0]!.screenshotSha256 ?? "", /^sha256:[a-f0-9]{64}$/);
    const manifest = JSON.parse(await readFile(join(root, "runs", "v2", runId, "manifest.json"), "utf8"));
    assert.equal(manifest.approvalDigest, suite.digest);
    assert.equal(await readFile(join(root, "runs", "v2", runId, "manifest.sha256"), "utf8"), `${createHash("sha256").update(JSON.stringify(manifest, null, 2)).digest("hex")}\n`);
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});
