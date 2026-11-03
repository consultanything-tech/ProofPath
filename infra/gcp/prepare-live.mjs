import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openLiveOperatorV3 } from "../../dist/src/v2-operator-v3.js";
import { LiveProposalBudgetLedgerV3 } from "../../dist/src/v2-live-ledger-v3.js";
import { PlanStore } from "../../dist/src/plan-store.js";
import { V2Store } from "../../dist/src/v2-store.js";
import { snapshotToRecords } from "../../dist/src/gcp/state.js";
import { encodeImport } from "../../dist/src/gcp/import.js";
const project = "proofpath-hackathon-2026", region = "asia-southeast1";
const account = process.env.PROOFPATH_GCP_ACCOUNT; assert.ok(account, "Set PROOFPATH_GCP_ACCOUNT to your deployer account.");
const namespace = "live-release-20261103";
const gcloud = "/Users/vermapankaj/Downloads/Dev-Projects/google-cloud-sdk/bin/gcloud";
const operatorDir = resolve("runs/v2-live/operator"), v3 = join(operatorDir, "v3");
const cloudEnv = { ...process.env }; delete cloudEnv.MODEL_API_KEY; delete cloudEnv.BASETEN_API_KEY;
const gc = (args, input) => execFileSync(gcloud, ["--account=" + account, "--project=" + project, ...args], { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], env: cloudEnv }).trim();
const hash = (bytes) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
const privateRead = async (file) => { const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink() && !(info.mode & 0o077), "Private source permissions are required."); return readFile(file); };
assert.ok(process.env.MODEL_API_KEY, "Configure the existing direct Meta key locally first.");
const helperEntry = (entry) => /^\/Users\/vermapankaj\/(?:\.codex\/plugins\/cache\/openai-bundled\/unified-computer-use\/[^/]+\/require-browser-access\.mjs|\.npm\/_npx\/[a-f0-9]+\/node_modules\/(?:\.bin\/(?:xcodebuildmcp|chrome-devtools-mcp)|chrome-devtools-mcp\/build\/src\/telemetry\/watchdog\/main\.js))$/.test(entry.replace(/^file:\/\//, ""));
assert.ok(helperEntry("/Users/vermapankaj/.npm/_npx/99336612077b7094/node_modules/.bin/xcodebuildmcp"));
assert.ok(!helperEntry(resolve("dist/src/server.js")));
// Refuse other application owners; Codex tool helpers can share the checkout's cwd.
const processes = execFileSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).split("\n");
for (const line of processes) {
  const match = line.trim().match(/^(\d+)\s+.*\bnode$/); if (!match || Number(match[1]) === process.pid) continue;
  const args = execFileSync("/bin/ps", ["-p", match[1], "-o", "args="], { encoding: "utf8" }).trim().split(/\s+/);
  if (helperEntry(args[1] ?? "") || (args[1] === "--import" && helperEntry(args[2] ?? "") && args[3] === "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua-repl/bin/cua-repl.mjs")) continue;
  let cwd = ""; try { cwd = execFileSync("/usr/sbin/lsof", ["-a", "-p", match[1], "-d", "cwd", "-Fn"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { try { process.kill(Number(match[1]), 0); } catch (error) { if (error.code === "ESRCH") continue; throw error; } throw new Error("Cannot establish that the local Node process has stopped."); }
  assert.ok(!cwd.split("\n").includes("n" + process.cwd()), "Stop ProofPath's local Node processes cleanly before cutover.");
}
const key = await privateRead(join(v3, "ledger.key"));
const sourceRaw = await privateRead(join(v3, "ledger/live-ledger-v3.json"));
const sourceState = await LiveProposalBudgetLedgerV3.fromSignedState(sourceRaw.toString(), key).snapshot();
assert.ok(!sourceState.reservations.some((r) => ["reserved", "dispatching"].includes(r.status)), "Uncertain reservations need reconciliation first.");
const output = resolve("runs/gcp-migration", namespace); await mkdir(output, { recursive: false, mode: 0o700 }).catch(async (error) => { if (error.code !== "ENOENT") throw error; await mkdir(resolve("runs/gcp-migration"), { mode: 0o700 }); await mkdir(output, { mode: 0o700 }); });
// A verified stopped owner plus terminal signed reservations permits archiving a crash-left lock.
const lock = join(v3, "ledger/live-ledger-v3.lock");
try { const info = await lstat(lock); assert.ok(info.isFile() && !info.isSymbolicLink() && Date.now() - info.mtimeMs > 600_000, "Ownership lock is too recent to recover."); await rename(lock, join(v3, `ledger/live-ledger-v3.lock.pre-gcp-${Date.now()}`)); } catch (error) { if (error.code !== "ENOENT") throw error; }
const operator = await openLiveOperatorV3(operatorDir);
try {
  assert.equal(hash(await privateRead(join(v3, "ledger/live-ledger-v3.json"))), hash(sourceRaw), "Source accounting changed during ownership acquisition.");
  const registry = JSON.parse((await privateRead(join(v3, "reviewer.allowlist.json"))).toString());
  assert.equal(registry.digests.length, 1, "Legacy V1 reports need a single unambiguous reviewer owner.");
  const principal = operator.registry.authenticate("Bearer " + (await privateRead(join(v3, "reviewer-code.txt"))).toString().trim());
  const store = await V2Store.openHosted(resolve("runs/v2-live/data")); await store.recoverInterruptedJobs();
  const snapshot = await store.snapshot(); snapshot.proposals = []; snapshot.approvals = [];
  const records = new Map(); snapshotToRecords(records, snapshot); records.set("live-ledger", operator.ledger.signedState());
  const files = new Map();
  const capture = async (id, name, path, digest) => {
    assert.match(id, /^[a-f0-9-]{36}$/); assert.match(name, /^(?:[a-z0-9-]+\.png|manifest\.json|manifest\.sha256)$/);
    const info = await lstat(path); assert.ok(info.isFile() && !info.isSymbolicLink() && info.size <= 8_000_000);
    const bytes = await readFile(path); if (digest) assert.equal(hash(bytes), digest, "Source evidence is damaged.");
    const relative = `${id}/${name}`; files.set(relative, bytes);
  };
  for (const [id, saved] of Object.entries(snapshot.state.runs)) {
    const report = await store.readJob(id); assert.deepEqual(report, saved, "Source V2 report integrity changed during migration.");
    const suite = Object.values(snapshot.state.suites).find((s) => s.digest === report.approvalDigest); assert.ok(suite);
    const approval = { definition: suite.definition, rules: suite.definition.rules, referenceId: suite.definition.referenceId, expectations: suite.expectations, grounding: suite.grounding, provenance: suite.provenance, digest: suite.digest, expiresAt: report.startedAt, consumed: true };
    await store.validateExecutionApproval(approval);
    records.set("job_" + id, { kind: "v2", id, status: report.status, fence: 0, until: 0, createdAt: Date.parse(report.startedAt), dispatch: "queued", approval });
    const root = resolve("runs/v2-live/data/runs/v2", id);
    for (const a of report.records.flatMap((r) => r.assertions)) if (a.screenshot !== "not-captured.png") { assert.ok(a.screenshotSha256); await capture(id, a.screenshot, join(root, a.screenshot), a.screenshotSha256); }
    for (const name of ["manifest.json", "manifest.sha256"]) await capture(id, name, join(root, name));
  }
  let v1Count = 0;
  for (const entry of await readdir("runs", { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
    const path = resolve("runs", entry.name, "manifest.json"); let report;
    try { report = JSON.parse(await readFile(path, "utf8")); } catch { continue; }
    if (report.planner?.mode !== "meta") continue;
    assert.equal(report.runId, entry.name); assert.ok(report.endedAt && ["completed", "failed", "blocked", "timed-out"].includes(report.executionStatus));
    const bytes = await readFile(path); assert.equal((await readFile(path.replace("manifest.json", "manifest.sha256"), "utf8")).trim(), hash(bytes).slice(7));
    const plan = { id: report.planId, digest: report.approvalDigest, envelope: report.approvalEnvelope, consumed: true, approvedAt: Date.parse(report.startedAt), ownerKey: principal.key }; PlanStore.restore([plan]);
    records.set("plan_" + plan.id, plan);
    records.set("job_" + report.runId, { kind: "v1", id: report.runId, status: "completed", fence: 0, until: 0, createdAt: Date.parse(report.startedAt), dispatch: "queued", ownerKey: principal.key, approval: { id: plan.id, digest: plan.digest, envelope: plan.envelope }, report });
    for (const a of report.assertions) if (a.screenshot !== "not-captured.png") { assert.ok(a.screenshotSha256); await capture(report.runId, a.screenshot, resolve("runs", report.runId, a.screenshot), a.screenshotSha256); }
    for (const name of ["manifest.json", "manifest.sha256"]) await capture(report.runId, name, resolve("runs", report.runId, name));
    v1Count++;
  }
  records.set("v1meta", { count: v1Count });
  const marker = { version: 1, phase: "prepared", project, namespace, sourceLedgerSha256: hash(sourceRaw), reservations: sourceState.reservations.length, preparedAt: new Date().toISOString() };
  const retirement = await open(join(operatorDir, "gcp-live.retired.json"), "wx", 0o600);
  try { await retirement.writeFile(JSON.stringify(marker)); await retirement.sync(); } finally { await retirement.close(); }
  const directory = await open(operatorDir, "r"); try { await directory.sync(); } finally { await directory.close(); }
  const pins = {};
  for (const [name, value] of [["model-api-key", process.env.MODEL_API_KEY], ["ledger-key", key.toString("base64")], ["reviewer-pepper", (await privateRead(join(v3, "reviewer.pepper"))).toString("base64")], ["reviewer-digests", JSON.stringify(registry.digests)]]) {
    gc(["secrets", "create", "proofpath-" + name, "--replication-policy=user-managed", "--locations=" + region, "--quiet"]);
    const version = gc(["secrets", "versions", "add", "proofpath-" + name, "--data-file=-", "--format=value(name)"], value).split("/").pop(); assert.match(version, /^\d+$/); pins[name] = "proofpath-" + name + ":" + version;
  }
  const evidence = join(output, "evidence"); await mkdir(evidence, { mode: 0o700 });
  for (const [relative, bytes] of files) { const path = join(evidence, relative); await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 }); await writeFile(path, bytes, { flag: "wx", mode: 0o600 }); }
  gc(["storage", "cp", "--recursive", "--if-generation-match=0", evidence, `gs://${project}-evidence/${namespace}/migration/`]);
  const token = gc(["auth", "print-access-token"]);
  const list = await fetch(`https://storage.googleapis.com/storage/v1/b/${project}-evidence/o?prefix=${namespace}/migration/evidence/&maxResults=1000`, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(30_000) }); assert.ok(list.ok);
  const metadata = await list.json(); assert.ok(!metadata.nextPageToken && metadata.items?.length === files.size);
  for (const item of metadata.items) { const relative = item.name.slice((namespace + "/migration/evidence/").length); const bytes = files.get(relative); assert.ok(bytes && Number(item.size) === bytes.length); const [id, name] = relative.split("/"); const refs = records.get("objects_" + id) ?? {}; refs[name] = { name: item.name, generation: item.generation, sha256: hash(bytes), size: bytes.length }; records.set("objects_" + id, refs); }
  const bundle = encodeImport(records, key, project, namespace); const bundlePath = join(output, "records.json"); await writeFile(bundlePath, bundle, { flag: "wx", mode: 0o600 });
  const bundleUrl = `gs://${project}-evidence/${namespace}/migration/records.json`; gc(["storage", "cp", "--if-generation-match=0", bundlePath, bundleUrl]);
  const ref = JSON.parse(gc(["storage", "objects", "describe", bundleUrl, "--format=json"]));
  const config = { project, region, namespace, pins, importObject: { name: `${namespace}/migration/records.json`, generation: String(ref.generation), size: bundle.length, sha256: hash(bundle) }, reservations: sourceState.reservations.length, v1Reports: v1Count, v2Reports: Object.keys(snapshot.state.runs).length, v1RunIds: [...records].filter(([id]) => id.startsWith("job_")).map(([,j]) => j).filter(j => j.kind === "v1").map(j => j.id), v2RunIds: Object.keys(snapshot.state.runs), sourceLedgerSha256: hash(sourceRaw) };
  await writeFile(join(output, "migration-config.json"), JSON.stringify(config, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ prepared: namespace, reservations: config.reservations, v1Reports: v1Count, v2Reports: config.v2Reports, evidenceObjects: files.size, localAdmissionRetired: true }));
} finally { await operator.close(); }
