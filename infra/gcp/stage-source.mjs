import { cp, lstat, mkdir, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const destination = resolve(process.argv[2] ?? "");
assert.ok(destination.startsWith("/private/tmp/") || destination.startsWith("/tmp/"), "Use a new temporary build directory.");
await mkdir(destination, { recursive: false, mode: 0o700 });
const files = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "Dockerfile", ".dockerignore", "scripts/container-healthcheck.mjs", "infra/gcp/cloudbuild.yaml"];
async function scan(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = join(path, entry.name);
    assert.ok(!entry.isSymbolicLink() && !entry.name.startsWith("."), "Unexpected build source entry.");
    if (entry.isDirectory()) await scan(name);
    else { assert.ok(/\.(ts|js|html|css|json|png|svg|webp|woff2)$/.test(name), `Unexpected source type: ${name}`); files.push(name); }
  }
}
for (const path of ["src", "tests", "public"]) await scan(path);
for (const path of files) { assert.ok((await lstat(path)).isFile()); await mkdir(resolve(destination, path, ".."), { recursive: true }); await cp(path, resolve(destination, path), { errorOnExist: true, force: false }); }
console.log(`Staged ${files.length} allowlisted source files; local credentials, runs, operator state and Git history excluded.`);
