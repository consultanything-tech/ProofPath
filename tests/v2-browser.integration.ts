import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { chromium } from "playwright";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";

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

test("frozen checkout releases expose real totals and isolated synthetic state", { timeout: 15_000 }, async () => {
  const server = await app();
  const browser = await chromium.launch({ headless: true, timeout: 10_000 });
  try {
    for (const [release, expected] of [["r1", "7700"], ["r2", "7200"], ["r3", "7700"]] as const) {
      const page = await browser.newPage();
      await page.goto(`${server.origin}/v2-target/${release}/index.html`);
      await page.getByRole("button", { name: "Add Desk Lamp" }).click();
      await page.getByRole("button", { name: "Add Desk Lamp" }).click();
      await page.getByLabel("Coupon").fill("SAVE10");
      await page.getByRole("button", { name: "Apply coupon" }).click();
      assert.equal(await page.locator("#total-minor").textContent(), expected);
      await page.close();
    }
    const page = await browser.newPage();
    await page.goto(`${server.origin}/v2-target/r1/index.html`);
    await page.getByRole("button", { name: "Add Notebook" }).click();
    await page.getByRole("button", { name: "Checkout" }).click();
    await page.getByRole("button", { name: "Confirm synthetic order" }).click();
    await page.getByText("Email is required.").waitFor();
    await page.getByLabel("Email").fill("qa@example.test");
    await page.getByLabel("Postal code").fill("018989");
    await page.getByRole("button", { name: "Confirm synthetic order" }).click();
    await page.getByText("Synthetic order confirmed.").waitFor();
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
    await browser.close();
    await server.close();
  }
});
