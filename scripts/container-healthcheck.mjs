import http from "node:http";

function healthcheck() {
  const configuredPort = process.env.PORT ?? "";
  if (!/^[1-9][0-9]*$/.test(configuredPort)) return Promise.resolve(false);
  const port = Number(configuredPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return Promise.resolve(false);

  let origin;
  try {
    origin = new URL(process.env.PUBLIC_ORIGIN ?? "");
  } catch {
    return Promise.resolve(false);
  }
  if (origin.protocol !== "https:" || !origin.host || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || origin.origin !== process.env.PUBLIC_ORIGIN) return Promise.resolve(false);

  return new Promise((resolve) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/healthz",
      method: "GET",
      headers: { Host: origin.host },
      timeout: 3_000,
    }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
    request.end();
  });
}

const healthy = await healthcheck();
process.exitCode = healthy ? 0 : 1;
