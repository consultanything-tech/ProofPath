import { createHmac, timingSafeEqual } from "node:crypto";
import { LiveProposalBudgetLedgerV3 } from "../v2-live-ledger-v3.js";
import { V2Store } from "../v2-store.js";
import { digestV2 } from "../v2-checkout.js";
import { GcpEvidenceIO, snapshotFromRecords, jobFromRecords } from "./state.js";
import type { EvidenceObjects, ObjectRef } from "./evidence.js";
import type { Records } from "./repository.js";
type Payload = { version: 1; project: string; namespace: string; records: [string, unknown][] };
export function encodeImport(records: Records, key: Buffer, project: string, namespace: string) {
  const payload: Payload = { version: 1, project, namespace, records: [...records] };
  return Buffer.from(JSON.stringify({ payload, mac: createHmac("sha256", key).update(JSON.stringify(payload)).digest("hex") }));
}
export async function verifyImport(bytes: Buffer, key: Buffer, project: string, namespace: string, objects: EvidenceObjects) {
  if (key.length !== 32 || bytes.length > 8_000_000) throw new Error("Invalid migration bundle.");
  const envelope = JSON.parse(bytes.toString("utf8")); const p = envelope.payload as Payload;
  if (!p || p.version !== 1 || p.project !== project || p.namespace !== namespace || !Array.isArray(p.records) || p.records.length >= 400 || !/^[a-f0-9]{64}$/.test(envelope.mac ?? "")) throw new Error("Migration destination or signature is invalid.");
  const expected = createHmac("sha256", key).update(JSON.stringify(p)).digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.mac, "hex"))) throw new Error("Migration signature is invalid.");
  const records: Records = new Map(p.records);
  if (records.size !== p.records.length || records.has("planning-activity") || records.has("_meta")) throw new Error("Migration contains duplicate or active records.");
  for (const [id, value] of records) if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || Buffer.byteLength(JSON.stringify(value)) > 800_000) throw new Error("Invalid migration record.");
  const raw = records.get("live-ledger"); if (typeof raw !== "string") throw new Error("Signed live accounting is required.");
  const ledger = LiveProposalBudgetLedgerV3.fromSignedState(raw, key); const state = await ledger.snapshot();
  if (state.reservations.some((r) => ["reserved", "dispatching"].includes(r.status))) throw new Error("Unfinished live reservations must be reconciled before migration.");
  const snapshot = snapshotFromRecords(records);
  if (snapshot.approvals.length || snapshot.proposals.length || Object.values(snapshot.state.runs).some((r) => ["accepted", "running"].includes(r.status))) throw new Error("Pending approvals or execution cannot be imported.");
  const io = new GcpEvidenceIO(records, objects, namespace); const store = V2Store.restore(snapshot, io);
  for (const [id, refs] of records) {
    if (id.startsWith("objects_")) for (const ref of Object.values(refs as Record<string, ObjectRef>)) await objects.read(ref);
    if (id.startsWith("job_")) { const job = jobFromRecords(records, id.slice(4)); if (!["completed", "interrupted"].includes(job.status)) throw new Error("Active jobs cannot be imported."); }
  }
  for (const [id, saved] of Object.entries(snapshot.state.runs)) if (digestV2(await store.readJob(id)) !== digestV2(saved)) throw new Error("Migration evidence does not match the saved report.");
  return { records, reservations: state.reservations.length, runs: Object.keys(snapshot.state.runs).length, blocked: Boolean(state.liveAdmissionBlocked) };
}
