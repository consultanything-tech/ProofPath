import { createServer, type IncomingMessage } from "node:http";
import { createProofPathServer } from "../server.js";
import { createPlanner } from "../planner.js";
import { createFixtureServer } from "../fixture-server.js";
import { LiveMetaProposalService } from "../v2-live-proposal.js";
import { ReviewerCodeRegistry } from "../v2-proposal-budget.js";
import { gcpConfig, type GcpConfig } from "./config.js";
import { FirestoreRepository } from "./repository.js";
import { GcsEvidence } from "./evidence.js";
import { GcpJobs, TasksDispatcher } from "./jobs.js";
import { GcpActivityGate } from "./activity.js";
import { FirestoreLiveLedger } from "./ledger.js";
const listen = (server: import("node:http").Server, port: number, host: string) => new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, host, () => resolve()); });
const secretBuffer = (env: NodeJS.ProcessEnv, name: string) => { const value = env[name]; if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`Missing ${name}.`); const bytes = Buffer.from(value, "base64"); if (bytes.length !== 32) throw new Error(`Invalid ${name}.`); return bytes; };
export function createGcpServices(config: GcpConfig) {
  const repo = new FirestoreRepository(config); const objects = new GcsEvidence(config.bucket, config.namespace, config.project);
  const jobs = new GcpJobs(repo, objects, config, new TasksDispatcher(config));
  return { repo, objects, jobs };
}
async function workerBody(req: IncomingMessage): Promise<string> {
  let bytes = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { const b = Buffer.from(chunk); bytes += b.length; if (bytes > 256) throw new Error("Invalid task body."); chunks.push(b); }
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || Object.keys(body).length !== 1 || typeof body.runId !== "string" || !/^[a-f0-9-]{36}$/.test(body.runId)) throw new Error("Invalid task body.");
  return body.runId;
}
export async function startGcpRuntime(env: NodeJS.ProcessEnv) {
  const config = gcpConfig(env); const { repo, jobs } = createGcpServices(config);
  await repo.withLock(() => undefined);
  const fixture = createFixtureServer(config.fixturePort, true); await listen(fixture.server, config.fixturePort, "127.0.0.1");
  let server: import("node:http").Server;
  if (config.role === "worker") {
    // Cloud Run IAM permits only the task-caller identity; task headers are sanity checks, not authentication.
    server = createServer(async (req, res) => {
      try {
        if (req.headers.host !== new URL(config.workerUrl).host) { res.writeHead(400).end(); return; }
        if (req.method === "GET" && req.url === "/healthz") { res.writeHead(200).end("ok"); return; }
        if (req.method !== "POST" || req.url !== "/internal/execute" || req.headers["content-type"]?.split(";", 1)[0] !== "application/json" || typeof req.headers["x-cloudtasks-taskname"] !== "string") { res.writeHead(404).end(); return; }
        const id = await workerBody(req);
        if (!(req.headers["x-cloudtasks-taskname"] as string).endsWith("run-" + id)) { res.writeHead(400).end(); return; }
        await jobs.execute(id); res.writeHead(204).end();
      } catch { res.writeHead(503).end("Approved task unavailable."); }
    });
  } else {
    let proposalService: import("../v2-http.js").V2ProposalService | undefined;
    if (config.profile === "live") {
      if (!env.MODEL_API_KEY || env.V2_PLANNER_MODE !== "meta") throw new Error("GCP live profile requires the verified Meta adapter.");
      const key = secretBuffer(env, "GCP_LEDGER_KEY"); const pepper = secretBuffer(env, "GCP_REVIEWER_PEPPER");
      const digests = JSON.parse(env.GCP_REVIEWER_DIGESTS ?? "null"); if (!Array.isArray(digests)) throw new Error("Reviewer registry missing.");
      const registry = new ReviewerCodeRegistry(pepper, digests); const ledger = new FirestoreLiveLedger(repo, key);
      const snapshot = await ledger.snapshot();
      const policy = snapshot.policy;
      proposalService = Object.assign(new LiveMetaProposalService(ledger, registry, env.MODEL_API_KEY), { proposalLimit: { perCode: policy.reviewerLimit, total: policy.globalLimit, reservationUsd: (policy.reservationMicrousd / 1e6).toFixed(2), totalUsd: (policy.globalMicrousd / 1e6).toFixed(2) } });
    }
    const instance = createProofPathServer(config.port, createPlanner({ PLANNER_MODE: "fixture" }), {
      ...(proposalService ? { proposalService, controlledLive: true } : {}),
      runtime: { hosted: true, bothJourneys: true, planningGate: new GcpActivityGate(repo), origin: config.origin, fixtureOrigin: fixture.origin, v2Store: jobs.v2, plans: jobs.plans,
        v2Runtime: { start: (id) => jobs.startV2(id), read: (id) => jobs.readV2(id), stopAdmissions() {}, async drain() { return true; } },
        v1Jobs: { start: (id, owner) => jobs.startV1(id, owner), read: (id, owner) => jobs.readV1(id, owner), evidence: (id, name, owner) => jobs.readV1Evidence(id, name, owner) }
      }
    });
    await instance.ready; server = instance.server;
  }
  await listen(server, config.port, "0.0.0.0");
  const stop = () => { server.close(); fixture.server.close(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  return { server, fixtureServer: fixture.server, repo, jobs, config, close: stop };
}
