import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { createV2Context, digestV2, type ReleaseRef, type V2Context } from "../src/v2-checkout.js";
import { inspectRegisteredTarget } from "../src/v2-planner.js";

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
  const egress = "<!doctype html><script src='/unregistered.js'></script><button id=checkout>Checkout</button>";
  const blocked = await inspectionTarget({ r1: egress, r2: egress });
  try {
    await assert.rejects(inspectRegisteredTarget(inspectionContext(blocked.origin, { r1: egress, r2: egress })), /unregistered|blocked/i);
    assert.equal(blocked.unregisteredRequests(), 0);
  } finally {
    await blocked.close();
  }
});
