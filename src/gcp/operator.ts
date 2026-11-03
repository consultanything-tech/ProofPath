import { CloudTasksClient } from "@google-cloud/tasks";
import { gcpConfig } from "./config.js";
import { createGcpServices } from "./runtime.js";
import { snapshotToRecords } from "./state.js";
import { V2Store } from "../v2-store.js";
import { smokeQueuedWorkflows } from "./smoke.js";
import { verifyImport } from "./import.js";

const config = gcpConfig(process.env);
const { repo, objects } = createGcpServices(config);
const client = await new CloudTasksClient().auth.getIdTokenClient(config.origin);
const transport: typeof fetch = async (input, init) => {
  if (typeof input !== "string" || new URL(input).origin !== config.origin) throw new Error("Unexpected operator destination.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", (await client.getRequestHeaders(config.origin)).get("authorization")!);
  return fetch(input, { ...init, headers, signal: AbortSignal.timeout(290_000), redirect: "error" });
};
try {
  if (process.env.MODEL_API_KEY || process.env.BASETEN_API_KEY) throw new Error("Operator commands must not have provider credentials.");
  if (process.argv[2] === "init-live") {
    if (config.profile !== "live") throw new Error("Live import requires an isolated live namespace.");
    const key = Buffer.from(process.env.GCP_LEDGER_KEY ?? "", "base64");
    const imported = await verifyImport(await objects.read(JSON.parse(process.env.GCP_IMPORT_OBJECT ?? "null")), key, config.project, config.namespace, objects);
    await repo.initialize(imported.records);
    console.log(JSON.stringify({ imported: config.namespace, reservations: imported.reservations, runs: imported.runs, blocked: imported.blocked }));
  } else if (process.argv[2] === "check-live") {
    if (config.profile !== "live") throw new Error("Expected live namespace.");
    const response = await transport(config.origin + "/api/v2/config");
    if (!response.ok || (await response.json() as { mode: string }).mode !== "controlled-live") throw new Error("Live application configuration was not verified.");
    if ((await transport(config.origin + "/api/v2/groundings")).status !== 401) throw new Error("Application must require a reviewer code.");
    if ((await fetch(config.workerUrl + "/internal/execute", { method: "POST", body: "{}", signal: AbortSignal.timeout(30_000) })).status !== 403) throw new Error("Worker must require Cloud Run IAM authentication.");
    console.log(JSON.stringify({ namespace: config.namespace, controlledLive: true, unauthenticatedReviewerDenied: true, unauthenticatedWorkerDenied: true, providerCalls: 0 }));
  } else if (config.profile !== "fixture") throw new Error("Fixture commands require an isolated fixture namespace.");
  else if (process.argv[2] === "init-fixture") {
    const records = new Map(); snapshotToRecords(records, V2Store.emptySnapshot());
    await repo.initialize(records);
    console.log(JSON.stringify({ initialized: config.namespace, profile: config.profile }));
  } else if (process.argv[2] === "smoke-fixture") {
    console.log(JSON.stringify({ namespace: config.namespace, ...await smokeQueuedWorkflows(config.origin, transport) }));
  } else throw new Error("Expected init-fixture or smoke-fixture.");
} finally { await repo.db.terminate(); }
