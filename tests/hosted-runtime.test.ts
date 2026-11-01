import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { mkdtemp, rm, readFile, writeFile, chmod, unlink, symlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createFixtureServer } from "../src/fixture-server.js";
import { readHostedRuntimeConfig } from "../src/runtime-config.js";
import { createProofPathServer, startHostedRuntime } from "../src/server.js";
import { createPlanner } from "../src/planner.js";
import { V2Store } from "../src/v2-store.js";

const port = async () => {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
};
const receive = (port: number, path: string, headers: Record<string, string>) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const req = request({ hostname: "127.0.0.1", port, path, headers }, (res) => {
    let body = ""; res.setEncoding("utf8"); res.on("data", (part) => body += part); res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
  });
  req.on("error", reject); req.end();
});
const post = (port: number, path: string, origin: string, body: unknown) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const req = request({ hostname: "127.0.0.1", port, path, method: "POST", headers: { Host: new URL(origin).host, Origin: origin, "Content-Type": "application/json" } }, (res) => {
    let received = ""; res.setEncoding("utf8"); res.on("data", (part) => received += part); res.on("end", () => resolve({ status: res.statusCode ?? 0, body: received }));
  });
  req.on("error", reject); req.end(JSON.stringify(body));
});

test("hosted runtime configuration requires one canonical public HTTPS origin and isolated persistent paths", () => {
  const base = { PROOFPATH_RUNTIME: "hosted", PUBLIC_ORIGIN: "https://review.proofpath.test", DATA_DIR: "/var/data/proofpath", V2_OPERATOR_DIR: "/var/data/proofpath/operator" };
  assert.deepEqual(readHostedRuntimeConfig(base), { publicOrigin: "https://review.proofpath.test", port: 3000, fixturePort: 4173, dataDir: "/var/data/proofpath", operatorDir: "/var/data/proofpath/operator" });
  for (const changed of [
    { PUBLIC_ORIGIN: "http://review.proofpath.test" }, { PUBLIC_ORIGIN: "https://review.proofpath.test/" },
    { V2_OPERATOR_DIR: "/var/private/operator" }, { DATA_DIR: "var/data" }, { PORT: "0" }, { PORT: "4173" },
    { PORT: " 3000" }, { PORT: "0xbb8" }, { PORT: "3e3" }, { PORT: "03000" }, { PORT: "3000.0" }
  ]) assert.throws(() => readHostedRuntimeConfig({ ...base, ...changed }));
  assert.equal(readHostedRuntimeConfig({}), null);
});

test("fixture listener permits only registered checkout files", async () => {
  const fixturePort = await port();
  const fixture = createFixtureServer(fixturePort);
  await new Promise<void>((resolve) => fixture.server.listen(fixturePort, "127.0.0.1", resolve));
  const host = new URL(fixture.origin).host;
  try {
    assert.equal((await receive(fixturePort, "/v2-target/r1/index.html", { Host: host })).status, 200);
    assert.equal((await receive(fixturePort, "/api/v2/groundings", { Host: host })).status, 404);
    assert.equal((await receive(fixturePort, "/workbench.html", { Host: host })).status, 404);
    assert.equal((await receive(fixturePort, "/v2-target/r1/index.html", { Host: "attacker.invalid" })).status, 400);
  } finally { fixture.server.closeAllConnections(); await new Promise<void>((resolve) => fixture.server.close(() => resolve())); }
});

test("hosted fixture runtime has strict public ingress and does not trust forwarded origin headers", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-hosted-runtime-"));
  const publicPort = await port(); const fixturePort = await port();
  const origin = "https://review.proofpath.test";
  const env = {
    PROOFPATH_RUNTIME: "hosted", V2_PLANNER_MODE: "fixture", PLANNER_MODE: "fixture", PUBLIC_ORIGIN: origin,
    PORT: String(publicPort), FIXTURE_PORT: String(fixturePort), DATA_DIR: root, V2_OPERATOR_DIR: join(root, "operator")
  };
  const runtime = await startHostedRuntime(env);
  try {
    assert.equal((await receive(publicPort, "/healthz", { Host: new URL(origin).host })).status, 200);
    assert.match((await receive(publicPort, "/", { Host: new URL(origin).host })).body, /Reviewed checkout regression workbench/);
    assert.equal((await receive(publicPort, "/api/config", { Host: new URL(origin).host })).status, 404);
    assert.equal((await receive(publicPort, "/v2-target/r1/index.html", { Host: new URL(origin).host })).status, 404);
    assert.equal((await receive(publicPort, "/index.html", { Host: new URL(origin).host })).status, 404);
    assert.equal((await receive(publicPort, "/healthz", { Host: "attacker.invalid", "X-Forwarded-Host": new URL(origin).host })).status, 400);
    assert.equal((await receive(publicPort, "/healthz", { Host: new URL(origin).host, "X-Forwarded-Host": "attacker.invalid", "X-Forwarded-Proto": "http" })).status, 200);
    assert.equal((await receive(publicPort, "/api/v2/groundings", { Host: new URL(origin).host, Origin: "https://attacker.invalid" })).status, 400);
    assert.equal((await receive(fixturePort, "/api/v2/config", { Host: `127.0.0.1:${fixturePort}` })).status, 404);
  } finally { await runtime.close(); }
  try {
    const restarted = await startHostedRuntime(env);
    try { assert.equal((await receive(publicPort, "/healthz", { Host: new URL(origin).host })).status, 200); }
    finally { await restarted.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("hosted fixture validation cannot open live data, and live startup cannot open validation data", async () => {
  const liveRoot = await mkdtemp(join(tmpdir(), "proofpath-live-profile-"));
  const fixtureRoot = await mkdtemp(join(tmpdir(), "proofpath-fixture-profile-"));
  try {
    await new V2Store(liveRoot).recoverInterruptedJobs();
    const prior = await readFile(join(liveRoot, "runs/v2/state.json"));
    await assert.rejects(V2Store.openOrInitializeHostedFixture(liveRoot), /profiles must remain separate/);
    assert.deepEqual(await readFile(join(liveRoot, "runs/v2/state.json")), prior);
    await V2Store.openOrInitializeHostedFixture(fixtureRoot);
    await assert.rejects(V2Store.openHosted(fixtureRoot), /profiles must remain separate/);
    await unlink(join(fixtureRoot, "runs/v2/state.json"));
    await assert.rejects(V2Store.openOrInitializeHostedFixture(fixtureRoot), /state must already exist/);
  } finally { await Promise.all([rm(liveRoot, { recursive: true, force: true }), rm(fixtureRoot, { recursive: true, force: true })]); }
});

test("hosted state rejects a runtime directory that escapes through a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-state-symlink-"));
  const outside = await mkdtemp(join(tmpdir(), "proofpath-outside-state-"));
  try {
    await new V2Store(outside).recoverInterruptedJobs();
    await mkdir(join(root, "runs"));
    await symlink(join(outside, "runs/v2"), join(root, "runs/v2"));
    await assert.rejects(V2Store.openHosted(root), /state must already exist/);
  } finally { await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]); }
});

test("corrupt or unwritable hosted state is rejected before live services or public ingress", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-hosted-invalid-state-"));
  const publicPort = await port(); const fixturePort = await port();
  const file = join(root, "runs/v2/state.json");
  let servicesOpened = 0;
  try {
    await new V2Store(root).recoverInterruptedJobs();
    const valid = await readFile(file);
    const env = { PROOFPATH_RUNTIME: "hosted", V2_PLANNER_MODE: "meta", PUBLIC_ORIGIN: "https://review.proofpath.test",
      PORT: String(publicPort), FIXTURE_PORT: String(fixturePort), DATA_DIR: root, V2_OPERATOR_DIR: join(root, "operator") };
    const dependencies = { createLiveServices: async (): Promise<never> => { servicesOpened += 1; throw new Error("Must not open live services."); } };
    await writeFile(file, "{corrupt");
    await assert.rejects(startHostedRuntime(env, dependencies), { name: "SyntaxError" });
    await writeFile(file, valid); await chmod(file, 0o400);
    await assert.rejects(startHostedRuntime(env, dependencies), /writable/);
    assert.equal(servicesOpened, 0);
    await assert.rejects(receive(publicPort, "/healthz", { Host: "review.proofpath.test" }));
  } finally { await chmod(file, 0o600).catch(() => {}); await rm(root, { recursive: true, force: true }); }
});

test("hosted direct Meta startup fails closed before binding public ingress when persistent V2 state is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-hosted-missing-state-"));
  const publicPort = await port(); const fixturePort = await port();
  try {
    await assert.rejects(startHostedRuntime({
      PROOFPATH_RUNTIME: "hosted", V2_PLANNER_MODE: "meta", PLANNER_MODE: "fixture", MODEL_API_KEY: "not-used",
      PUBLIC_ORIGIN: "https://review.proofpath.test", PORT: String(publicPort), FIXTURE_PORT: String(fixturePort), DATA_DIR: root, V2_OPERATOR_DIR: join(root, "operator")
    }), /state must already exist/i);
    await assert.rejects(receive(publicPort, "/healthz", { Host: "review.proofpath.test" }));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("proposal and target inspection gate rejects overlap before a second inspection begins", async () => {
  const root = await mkdtemp(join(tmpdir(), "proofpath-inspection-gate-"));
  const previous = process.env.DATA_DIR; process.env.DATA_DIR = root;
  const serverPort = await port();
  let releaseInspection: (() => void) | undefined;
  let inspections = 0;
  const instance = createProofPathServer(serverPort, createPlanner({ PLANNER_MODE: "fixture" }), {
    inspect: async (context) => {
      inspections += 1;
      await new Promise<void>((resolve) => { releaseInspection = resolve; });
      return context.grounding;
    }
  });
  await new Promise<void>((resolve) => instance.server.listen(serverPort, "127.0.0.1", resolve));
  const source = "Cart quantity stays between one and five. SAVE10 coupon is applied once. Delivery is free at the reviewed threshold. Contact email and postal code are required.";
  try {
    const first = post(serverPort, "/api/v2/proposals", instance.origin, { requirement: source, releases: ["r1", "r2"] });
    while (inspections === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    const second = await post(serverPort, "/api/v2/proposals", instance.origin, { requirement: source, releases: ["r1", "r2"] });
    assert.equal(second.status, 409);
    assert.equal(inspections, 1);
    releaseInspection?.();
    assert.ok([200, 201].includes((await first).status));
  } finally {
    instance.server.closeAllConnections(); await new Promise<void>((resolve) => instance.server.close(() => resolve()));
    previous === undefined ? delete process.env.DATA_DIR : process.env.DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
