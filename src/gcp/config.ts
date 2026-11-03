export type GcpConfig = {
  project: string; region: string; database: string; namespace: string; profile: "fixture" | "live";
  bucket: string; queue: string; workerUrl: string; taskAccount: string; origin: string;
  role: "web" | "worker"; port: number; fixturePort: number;
};
export function gcpConfig(env: NodeJS.ProcessEnv = process.env): GcpConfig {
  const required = (name: string, pattern: RegExp) => { const value = env[name] ?? ""; if (!pattern.test(value)) throw new Error(`Invalid ${name}.`); return value; };
  const url = (name: string) => { const value = required(name, /^https:\/\//); const parsed = new URL(value); if (parsed.origin !== value || parsed.username || parsed.password) throw new Error(`Invalid ${name}.`); return value; };
  const role = required("PROOFPATH_ROLE", /^(web|worker)$/) as "web" | "worker";
  const profile = required("GCP_DATA_PROFILE", /^(fixture|live)$/) as "fixture" | "live";
  const port = Number(env.PORT ?? 8080); const fixturePort = Number(env.FIXTURE_PORT ?? 4173);
  if (![port, fixturePort].every((n) => Number.isInteger(n) && n > 0 && n < 65536) || port === fixturePort) throw new Error("Invalid runtime ports.");
  if (role === "worker" && (env.MODEL_API_KEY || env.BASETEN_API_KEY)) throw new Error("Worker must not have provider credentials.");
  return {
    project: required("GCP_PROJECT_ID", /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/), region: required("GCP_REGION", /^[a-z]+-[a-z]+\d$/),
    database: env.GCP_FIRESTORE_DATABASE ?? "(default)", namespace: required("GCP_STATE_NAMESPACE", /^[a-z][a-z0-9-]{2,60}$/), profile,
    bucket: required("GCP_EVIDENCE_BUCKET", /^[a-z0-9][a-z0-9.-]{1,220}[a-z0-9]$/), queue: required("GCP_TASKS_QUEUE", /^[a-z][a-z0-9-]{1,80}$/),
    workerUrl: url("GCP_WORKER_URL"), taskAccount: required("GCP_TASK_CALLER_SERVICE_ACCOUNT", /^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/),
    origin: url("PUBLIC_ORIGIN"), role, port, fixturePort
  };
}
