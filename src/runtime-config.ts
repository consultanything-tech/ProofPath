import { isAbsolute, relative, resolve } from "node:path";

export type HostedRuntimeConfig = Readonly<{
  readonly publicOrigin: string;
  readonly port: number;
  readonly fixturePort: number;
  readonly dataDir: string;
  readonly operatorDir: string;
}>;

function port(value: string | undefined, fallback: number, name: string): number {
  if (value !== undefined && !/^[1-9]\d{0,4}$/.test(value)) throw new Error(`${name} must be a decimal TCP port.`);
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) throw new Error(`${name} must be a TCP port between 1 and 65535.`);
  return parsed;
}

function canonicalHttpsOrigin(value: string | undefined): string {
  if (!value) throw new Error("PUBLIC_ORIGIN is required for hosted runtime.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("PUBLIC_ORIGIN must be a canonical HTTPS origin."); }
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.origin !== value) {
    throw new Error("PUBLIC_ORIGIN must be a canonical HTTPS origin without a path, query, fragment, or credentials.");
  }
  return parsed.origin;
}

function containedPath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

/** Returns null for the existing local runtime; hosted startup is opt-in and strict. */
export function readHostedRuntimeConfig(env: NodeJS.ProcessEnv = process.env): HostedRuntimeConfig | null {
  if (env.PROOFPATH_RUNTIME === undefined || env.PROOFPATH_RUNTIME === "") return null;
  if (env.PROOFPATH_RUNTIME !== "hosted") throw new Error("PROOFPATH_RUNTIME must be exactly 'hosted' when configured.");
  if (!env.DATA_DIR || !isAbsolute(env.DATA_DIR)) throw new Error("Hosted runtime requires an absolute DATA_DIR.");
  if (!env.V2_OPERATOR_DIR || !isAbsolute(env.V2_OPERATOR_DIR)) throw new Error("Hosted runtime requires an absolute V2_OPERATOR_DIR.");
  const dataDir = resolve(env.DATA_DIR);
  const operatorDir = resolve(env.V2_OPERATOR_DIR);
  if (!containedPath(dataDir, operatorDir)) throw new Error("V2_OPERATOR_DIR must be contained within DATA_DIR in hosted runtime.");
  const publicOrigin = canonicalHttpsOrigin(env.PUBLIC_ORIGIN);
  const publicPort = port(env.PORT, 3000, "PORT");
  const fixturePort = port(env.FIXTURE_PORT, 4173, "FIXTURE_PORT");
  if (publicPort === fixturePort) throw new Error("PORT and FIXTURE_PORT must be different in hosted runtime.");
  return { publicOrigin, port: publicPort, fixturePort, dataDir, operatorDir };
}
