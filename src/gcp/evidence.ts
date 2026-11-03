import { createHash } from "node:crypto";
import { Storage } from "@google-cloud/storage";
export type ObjectRef = { name: string; generation: string; sha256: string; size: number };
export const sha256 = (bytes: Buffer | string) => "sha256:" + createHash("sha256").update(bytes).digest("hex");
export interface EvidenceObjects { put(name: string, bytes: Buffer): Promise<ObjectRef>; read(ref: ObjectRef): Promise<Buffer> }
export class GcsEvidence implements EvidenceObjects {
  private storage: Storage;
  constructor(readonly bucket: string, readonly prefix: string, project: string) { this.storage = new Storage({ projectId: project, retryOptions: { maxRetries: 1, totalTimeout: 20 } }); }
  async put(name: string, bytes: Buffer): Promise<ObjectRef> {
    if (!/^[a-zA-Z0-9_./-]+$/.test(name) || name.includes("..") || bytes.length > 8_000_000) throw new Error("Invalid evidence object.");
    const full = `${this.prefix}/${name}`; const file = this.storage.bucket(this.bucket).file(full);
    try { await file.save(bytes, { resumable: false, validation: "crc32c", preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: name.endsWith(".png") ? "image/png" : "application/json", metadata: { sha256: sha256(bytes) } } }); }
    catch (error) { if ((error as {code?: number}).code !== 412) throw error; }
    const [metadata] = await file.getMetadata();
    const ref = { name: full, generation: String(metadata.generation), size: bytes.length, sha256: sha256(bytes) };
    const saved = await this.read(ref);
    if (!saved.equals(bytes)) throw new Error("Immutable evidence collision.");
    return ref;
  }
  async read(ref: ObjectRef): Promise<Buffer> {
    if (!ref.name.startsWith(this.prefix + "/") || ref.name.includes("..") || !/^\d+$/.test(ref.generation) || !/^sha256:[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > 8_000_000) throw new Error("Invalid evidence reference.");
    const file = this.storage.bucket(this.bucket).file(ref.name, { generation: ref.generation });
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== ref.size) throw new Error("Evidence size mismatch.");
    const [bytes] = await file.download({ validation: "crc32c" });
    if (bytes.length !== ref.size || sha256(bytes) !== ref.sha256) throw new Error("Evidence integrity check failed.");
    return bytes;
  }
}
