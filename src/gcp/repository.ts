import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { Firestore } from "@google-cloud/firestore";
import type { GcpConfig } from "./config.js";
export type Records = Map<string, unknown>;
export interface Repository { withLock<T>(work: (records: Records) => Promise<T> | T): Promise<T> }
const maxRecords = 400;
class BusyLease extends Error {}
const parse = (value: unknown): unknown => {
  if (typeof value !== "string" || Buffer.byteLength(value) > 800_000) throw new Error("Invalid saved GCP record.");
  return JSON.parse(value);
};
/** Domain work runs outside retryable transactions; only lease and fenced commit are retried. */
export class FirestoreRepository implements Repository {
  readonly db: Firestore;
  constructor(readonly config: GcpConfig) { this.db = new Firestore({ projectId: config.project, databaseId: config.database }); }
  private get collection() { return this.db.collection("proofpath").doc(this.config.namespace).collection("records"); }
  async withLock<T>(work: (records: Records) => Promise<T> | T): Promise<T> {
    const meta = this.collection.doc("_meta"); const owner = randomUUID();
    const deadline = Date.now() + 25_000;
    for (;;) { try { await this.db.runTransaction(async (tx) => {
      const saved = await tx.get(meta); const m = saved.data();
      if (!m || m.schema !== 1 || m.profile !== this.config.profile) throw new Error("GCP state must be explicitly initialized with the matching profile.");
      if (m.owner && m.until > Date.now()) throw new BusyLease("GCP state is busy; retry shortly.");
      tx.update(meta, { owner, until: Date.now() + 60_000 });
    }); break; } catch (error) {
      if (!(error instanceof BusyLease) || Date.now() >= deadline) throw error;
      await setTimeout(100 + Math.random() * 150);
    } }
    try {
      const snapshot = await this.collection.limit(maxRecords + 1).get();
      if (snapshot.size > maxRecords) throw new Error("GCP record bound reached.");
      const records: Records = new Map(snapshot.docs.filter((d) => d.id !== "_meta").map((d) => [d.id, parse(d.data().json)]));
      const before = new Map([...records].map(([id, value]) => [id, JSON.stringify(value)]));
      const result = await work(records);
      if (records.size >= maxRecords) throw new Error("GCP record bound reached.");
      await this.db.runTransaction(async (tx) => {
        const saved = (await tx.get(meta)).data();
        if (!saved || saved.owner !== owner || saved.until <= Date.now()) throw new Error("GCP state lease expired; changes rejected.");
        for (const [id, value] of records) {
          if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || id === "_meta") throw new Error("Invalid GCP record key.");
          const json = JSON.stringify(value);
          if (!json || Buffer.byteLength(json) > 800_000) throw new Error("GCP record size exceeded.");
          if (before.get(id) !== json) tx.set(this.collection.doc(id), { json });
        }
        for (const id of before.keys()) if (!records.has(id)) tx.delete(this.collection.doc(id));
        tx.update(meta, { owner: null, until: 0 });
      });
      return result;
    } finally {
      await this.db.runTransaction(async (tx) => { const saved = (await tx.get(meta)).data(); if (saved?.owner === owner) tx.update(meta, { owner: null, until: 0 }); }).catch(() => {});
    }
  }
  async initialize(records: Records) {
    if (records.size >= maxRecords) throw new Error("GCP record bound reached.");
    for (const id of records.keys()) if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || id === "_meta") throw new Error("Invalid GCP record key.");
    const meta = this.collection.doc("_meta");
    if (!(await this.collection.limit(1).get()).empty) throw new Error("GCP namespace must be empty before explicit initialization.");
    await this.db.runTransaction(async (tx) => {
      if ((await tx.get(meta)).exists) throw new Error("GCP namespace already initialized.");
      for (const [id, value] of records) { const json = JSON.stringify(value); if (Buffer.byteLength(json) > 800_000) throw new Error("GCP record size exceeded."); tx.create(this.collection.doc(id), { json }); }
      tx.create(meta, { schema: 1, profile: this.config.profile, owner: null, until: 0 });
    });
  }
}
