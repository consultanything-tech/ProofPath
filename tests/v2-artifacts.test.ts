import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { renderBugPacket, renderPlaywrightExport, renderPlaywrightExportForTest } from "../src/v2-artifacts.js";
import { createV2Context, withSourceRequirement } from "../src/v2-checkout.js";
import { createV2Planner } from "../src/v2-planner.js";
import { createPlanner } from "../src/planner.js";
import { createProofPathServer } from "../src/server.js";
import { V2Store } from "../src/v2-store.js";

const runFile = promisify(execFile);
const source = "Cart total must match unit prices. An invalid coupon must display an error. SAVE10 discounts the cart subtotal by 10%. Delivery is free at discounted subtotal S$75.00 or more. Contact fields are required before synthetic confirmation.";

async function port() {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

async function approved(origin = "http://127.0.0.1:4173", releases: ["r2", "r3"] = ["r2", "r3"]) {
  const root = await mkdtemp(join(tmpdir(), "proofpath-v2-artifact-"));
  const context = withSourceRequirement(createV2Context(origin, releases), source);
  const proposed = await createV2Planner({ V2_PLANNER_MODE: "fixture" }).propose(context);
  assert.equal(proposed.kind, "proposal");
  const store = new V2Store(root);
  const pending = await store.createProposal(proposed, context);
  const review = { decisions: proposed.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged" as const, adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposed.gaps, acceptedNumericRuleChanges: [] })) };
  const suite = await store.reviewProposal(pending.id, review);
  return { root, store, approval: await store.consumeApproval((await store.approveSuite(suite.id)).id) };
}

test("bug packet deterministically carries reviewed evidence and escapes untrusted literals", async () => {
  const fixture = await approved();
  try {
    const run = await fixture.store.createJob(fixture.approval);
    const altered = structuredClone(run);
    (altered.artifact.definition.requirement as { originalText: string }).originalText = "quoted \"line\"\nSnowman ☃ </script>";
    const first = renderBugPacket(altered);
    assert.equal(first, renderBugPacket(altered));
    assert.match(first, /approvalDigest/);
    assert.match(first, /"releases"/);
    assert.match(first, /"coverage"/);
    assert.match(first, /\\"line\\"\\nSnowman ☃ \\u003c\/script\\u003e/);
    assert.ok(!first.includes("expiresAt"));
    assert.ok(!first.includes("rootCause"));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});

test("exported reviewed adapter test fails against r2 and passes against r3", { timeout: 60_000 }, async () => {
  const targetPort = await port();
  const server = createProofPathServer(targetPort, createPlanner({ PLANNER_MODE: "fixture" }));
  const fixture = await approved(server.origin);
  const exportDirectory = await mkdtemp(join(process.cwd(), "tests/.task4-export-"));
  const exportPath = join(exportDirectory, "reviewed-checkout.test.mjs");
  try {
    await new Promise<void>((resolve) => server.server.listen(targetPort, "127.0.0.1", resolve));
    await writeFile(exportPath, renderPlaywrightExport(fixture.approval));
    const childEnv: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: server.origin, NODE_OPTIONS: "" };
    delete childEnv.NODE_TEST_CONTEXT;
    await assert.rejects(runFile(process.execPath, ["--test", exportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r2" } }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 1);
      assert.match(`${error.stdout}\n${error.stderr}`, /7200|7700/);
      return true;
    });
    const passing = await runFile(process.execPath, ["--test", exportPath], { env: { ...childEnv, PROOFPATH_RELEASE: "r3" } });
    assert.match(passing.stdout, /pass 1/);
  } finally {
    server.server.closeAllConnections();
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
    await rm(exportDirectory, { recursive: true, force: true });
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("export rejects unknown release selection and reduced trusted deadlines", async () => {
  const targetPort = await port(); const server = createProofPathServer(targetPort, createPlanner({ PLANNER_MODE: "fixture" })); const fixture = await approved(server.origin); const directory = await mkdtemp(join(process.cwd(), "tests/.task4-export-")); const file = join(directory, "negative.test.mjs");
  try {
    await new Promise<void>((resolve) => server.server.listen(targetPort, "127.0.0.1", resolve));
    await writeFile(file, renderPlaywrightExportForTest(fixture.approval, { caseMs: 1, suiteMs: 1 }));
    const env: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: server.origin, NODE_OPTIONS: "", PROOFPATH_RELEASE: "unknown" }; delete env.NODE_TEST_CONTEXT;
    await assert.rejects(runFile(process.execPath, ["--test", file], { env }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => { assert.equal(error.code, 1); assert.match(`${error.stdout}\n${error.stderr}`, /PROOFPATH_RELEASE/); return true; });
    env.PROOFPATH_RELEASE = "r3";
    await assert.rejects(runFile(process.execPath, ["--test", file], { env }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => { assert.equal(error.code, 1); assert.match(`${error.stdout}\n${error.stderr}`, /deadline/i); return true; });
  } finally { server.server.closeAllConnections(); await new Promise<void>((resolve) => server.server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await rm(fixture.root, { recursive: true, force: true }); }
});

test("export rejects changed served bytes before browser actions", async () => {
  const targetPort = await port(); const server = createProofPathServer(targetPort, createPlanner({ PLANNER_MODE: "fixture" })); const fixture = await approved(server.origin); const directory = await mkdtemp(join(process.cwd(), "tests/.task4-export-")); const file = join(directory, "bytes.test.mjs");
  try {
    await new Promise<void>((resolve) => server.server.listen(targetPort, "127.0.0.1", resolve));
    const altered = structuredClone(fixture.approval); (altered.definition.releases[1] as { fingerprint: string }).fingerprint = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
    await writeFile(file, renderPlaywrightExport(altered)); const env: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: server.origin, NODE_OPTIONS: "", PROOFPATH_RELEASE: "r3" }; delete env.NODE_TEST_CONTEXT;
    await assert.rejects(runFile(process.execPath, ["--test", file], { env }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string }) => { assert.equal(error.code, 1); assert.match(`${error.stdout}\n${error.stderr}`, /bytes changed/); return true; });
  } finally { server.server.closeAllConnections(); await new Promise<void>((resolve) => server.server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await rm(fixture.root, { recursive: true, force: true }); }
});

test("export fails closed on forbidden request, WebSocket, popup, and download", { timeout: 60_000 }, async () => {
  const escape = createServer((_req, res) => { res.end("unexpected"); }); await new Promise<void>((resolve) => escape.listen(0, "127.0.0.1", resolve)); const escapeAddress = escape.address(); assert.ok(escapeAddress && typeof escapeAddress !== "string"); let hits = 0; escape.on("request", () => { hits += 1; }); escape.on("upgrade", (_req, socket) => { hits += 1; socket.destroy(); });
  const index = await readFile(join(process.cwd(), "public/v2-target/r3/index.html")); const runtime = await readFile(join(process.cwd(), "public/v2-target/runtime.js")); const baseShop = await readFile(join(process.cwd(), "public/v2-target/r3/shop.js"), "utf8");
  const runVariant = async (name: string, injection: string) => {
    const shop = Buffer.from(`${baseShop}\n${injection}`); const fingerprint = `sha256:${createHash("sha256").update(index).update(shop).update(runtime).digest("hex")}`;
    const server = createServer((req, res) => { const path = new URL(req.url ?? "/", "http://fixture").pathname; const body = path.endsWith("index.html") ? index : path.endsWith("shop.js") ? shop : path.endsWith("runtime.js") ? runtime : undefined; if (!body) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`; const fixture = await approved(origin); const directory = await mkdtemp(join(process.cwd(), "tests/.task4-export-")); const file = join(directory, `${name}.test.mjs`);
    try { const altered = structuredClone(fixture.approval); (altered.definition.releases[1] as { fingerprint: string }).fingerprint = fingerprint; await writeFile(file, renderPlaywrightExportForTest(altered, { caseMs: 1500, suiteMs: 5000 })); const env: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: origin, NODE_OPTIONS: "", PROOFPATH_RELEASE: "r3" }; delete env.NODE_TEST_CONTEXT; await assert.rejects(runFile(process.execPath, ["--test", file], { env, timeout: 6000 }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string; signal?: string | null }) => { assert.equal(error.code, 1); assert.equal(error.signal, null); assert.match(`${error.stdout}\n${error.stderr}`, /Browser crossed the reviewed resource boundary/); return true; }); } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await rm(fixture.root, { recursive: true, force: true }); }
  };
  try { const origin = `http://127.0.0.1:${escapeAddress.port}`; await runVariant("request", `fetch("${origin}/escape")`); await runVariant("websocket", `new WebSocket("ws://127.0.0.1:${escapeAddress.port}/escape")`); await runVariant("popup", `window.open("${origin}/escape")`); await runVariant("download", `document.body.insertAdjacentHTML("beforeend", "<a download href='data:text/plain,fixture' id='download'>x</a>"); document.querySelector("#download").click()`); assert.equal(hits, 0); } finally { escape.closeAllConnections(); await new Promise<void>((resolve) => escape.close(() => resolve())); }
});

test("export rejects missing or duplicate observed markers while valid hidden markers remain observable", { timeout: 90_000 }, async () => {
  const index = await readFile(join(process.cwd(), "public/v2-target/r3/index.html"), "utf8"); const shop = await readFile(join(process.cwd(), "public/v2-target/r3/shop.js")); const runtime = await readFile(join(process.cwd(), "public/v2-target/runtime.js"));
  const markers = ["total-minor", "coupon-error", "email-error", "postal-code-error", "confirmation"];
  for (const mode of ["missing", "duplicate"] as const) for (const marker of markers) {
    const changed = mode === "missing" ? index.replace(new RegExp(`<[^>]+id="${marker}"[^>]*>[\\s\\S]*?<\\/[^>]+>`), "") : index.replace("</main>", `<p id="${marker}"></p></main>`);
    const fingerprint = `sha256:${createHash("sha256").update(changed).update(shop).update(runtime).digest("hex")}`; const server = createServer((req, res) => { const path = new URL(req.url ?? "/", "http://fixture").pathname; const body = path.endsWith("index.html") ? changed : path.endsWith("shop.js") ? shop : path.endsWith("runtime.js") ? runtime : undefined; if (!body) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": path.endsWith(".js") ? "text/javascript" : "text/html" }); res.end(body); }); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string"); const origin = `http://127.0.0.1:${address.port}`; const fixture = await approved(origin); const directory = await mkdtemp(join(process.cwd(), "tests/.task4-export-")); const file = join(directory, `${mode}-${marker}.test.mjs`);
    try { const altered = structuredClone(fixture.approval); const first = altered.definition.cases[0]!; (first.assertions as unknown as Array<unknown>).push({ id: "probe-coupon", predicate: "coupon-error" }, { id: "probe-contact", predicate: "contact-errors" }, { id: "probe-confirmation", predicate: "synthetic-confirmation" }); (altered.definition.releases[1] as { fingerprint: string }).fingerprint = fingerprint; await writeFile(file, renderPlaywrightExportForTest(altered, { caseMs: 1500, suiteMs: 5000 })); const env: NodeJS.ProcessEnv = { ...process.env, PROOFPATH_ORIGIN: origin, NODE_OPTIONS: "", PROOFPATH_RELEASE: "r3" }; delete env.NODE_TEST_CONTEXT; await assert.rejects(runFile(process.execPath, ["--test", file], { env, timeout: 6000 }), (error: NodeJS.ErrnoException & { stdout?: string; stderr?: string; signal?: string | null }) => { assert.equal(error.code, 1); assert.equal(error.signal, null); assert.match(`${error.stdout}\n${error.stderr}`, /missing, duplicate, or hidden/); return true; }); } finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); await rm(fixture.root, { recursive: true, force: true }); }
  }
});
