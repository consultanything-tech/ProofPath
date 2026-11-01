import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import test from "node:test";
import { resolve } from "node:path";

const healthcheck = resolve(process.cwd(), "scripts/container-healthcheck.mjs");

async function withHealthServer(status: number, configure: (port: number) => NodeJS.ProcessEnv, verify: (host: string | undefined) => void) {
  let observedHost: string | undefined;
  const server = createServer((request, response) => {
    observedHost = request.headers.host;
    response.writeHead(status);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, [healthcheck], {
        env: { ...process.env, ...configure(address.port) },
        stdio: "ignore",
      });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    verify(observedHost);
    return exitCode;
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("container health check uses the canonical host and accepts only HTTP 200", async () => {
  const canonical = (port: number) => ({ PORT: String(port), PUBLIC_ORIGIN: "https://review.proofpath.example:8443" });
  const healthy = await withHealthServer(200, canonical, (host) => assert.equal(host, "review.proofpath.example:8443"));
  assert.equal(healthy, 0);

  const unhealthy = await withHealthServer(503, canonical, (host) => assert.equal(host, "review.proofpath.example:8443"));
  assert.equal(unhealthy, 1);
});

test("container health check rejects noncanonical runtime configuration before connecting", async () => {
  const malformedPort = await withHealthServer(200, (port) => ({ PORT: `${port}junk`, PUBLIC_ORIGIN: "https://review.proofpath.example" }), (host) => assert.equal(host, undefined));
  assert.equal(malformedPort, 1);

  const noncanonicalOrigin = await withHealthServer(200, (port) => ({ PORT: String(port), PUBLIC_ORIGIN: "https://review.proofpath.example/" }), (host) => assert.equal(host, undefined));
  assert.equal(noncanonicalOrigin, 1);
});
