import type { Repository, Records } from "../../src/gcp/repository.js";
import { sha256, type EvidenceObjects, type ObjectRef } from "../../src/gcp/evidence.js";
export class MemoryRepository implements Repository {
  records: Records = new Map(); private tail = Promise.resolve();
  withLock<T>(work: (records: Records) => Promise<T> | T): Promise<T> {
    const next = this.tail.then(async () => { const draft = structuredClone(this.records); const result = await work(draft); this.records = draft; return result; });
    this.tail = next.then(() => undefined, () => undefined); return next;
  }
}
export class MemoryEvidence implements EvidenceObjects {
  files = new Map<string, Buffer>();
  async put(name: string, bytes: Buffer): Promise<ObjectRef> {
    const old = this.files.get(name); if (old && !old.equals(bytes)) throw new Error("Immutable collision.");
    this.files.set(name, Buffer.from(bytes)); return { name, generation: "1", sha256: sha256(bytes), size: bytes.length };
  }
  async read(ref: ObjectRef) { const bytes = this.files.get(ref.name); if (!bytes || ref.generation !== "1" || bytes.length !== ref.size || sha256(bytes) !== ref.sha256) throw new Error("Evidence integrity failed."); return Buffer.from(bytes); }
}
