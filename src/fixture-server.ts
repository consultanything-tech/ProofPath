import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { resolveRelease } from "./v2-checkout.js";

const publicRoot = resolve(process.cwd(), "public");
const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const registered = new Set(["r1", "r2", "r3"].flatMap((id) => resolveRelease(id).resources));

function reply(res: import("node:http").ServerResponse, status: number, body: string | Buffer, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Content-Security-Policy": "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(body);
}

/**
 * The browser runner's target-only listener. It intentionally has no public UI,
 * API, evidence, report, or arbitrary-file route.
 */
export function createFixtureServer(port: number) {
  const origin = `http://127.0.0.1:${port}`;
  const server = createServer(async (req, res) => {
    try {
      if (req.headers.host !== new URL(origin).host) return reply(res, 400, JSON.stringify({ error: "Exact fixture Host header required." }));
      const url = new URL(req.url ?? "/", origin);
      if (url.origin !== origin || req.method !== "GET" || url.search || url.hash || !registered.has(url.pathname)) return reply(res, 404, JSON.stringify({ error: "Not found." }));
      const file = resolve(publicRoot, `.${url.pathname}`);
      if (!file.startsWith(publicRoot)) return reply(res, 404, JSON.stringify({ error: "Not found." }));
      return reply(res, 200, await readFile(file), mime[extname(file)] ?? "application/octet-stream");
    } catch { return reply(res, 404, JSON.stringify({ error: "Not found." })); }
  });
  return { server, origin };
}
