import { LiveProposalBudgetLedgerV3, type LiveProvider, type LiveUsage, type LiveReservationStatus } from "../v2-live-ledger-v3.js";
import type { ReviewerPrincipal } from "../v2-proposal-budget.js";
import type { Repository } from "./repository.js";
/** Reuses the signed ledger validator and policy transitions without filesystem locks. */
export class FirestoreLiveLedger {
  constructor(readonly repo: Repository, readonly key: Buffer) {}
  private async mutate<T>(work: (ledger: LiveProposalBudgetLedgerV3) => Promise<T>): Promise<T> {
    let failure: unknown;
    const result = await this.repo.withLock(async (records) => {
      const raw = records.get("live-ledger"); if (typeof raw !== "string") throw new Error("Existing signed live ledger must be migrated before startup.");
      const ledger = LiveProposalBudgetLedgerV3.fromSignedState(raw, this.key);
      let result: T | undefined;
      try { result = await work(ledger); } catch (error) { failure = error; }
      // Usage breaches must commit their fail-closed state even though the caller receives an error.
      records.set("live-ledger", ledger.signedState());
      return result;
    });
    if (failure) throw failure;
    return result as T;
  }
  preflight(p: ReviewerPrincipal) { return this.mutate((l) => l.preflight(p)); }
  reserve(p: ReviewerPrincipal, digest: string, tokens: number, provider: LiveProvider = "meta") { return this.mutate((l) => l.reserve(p, digest, tokens, provider)); }
  beforeAttempt(id: string, number: 1 | 2) { return this.mutate((l) => l.beforeAttempt(id, number)); }
  usage(id: string, usage: LiveUsage) { return this.mutate((l) => l.usage(id, usage)); }
  finish(id: string, status: Exclude<LiveReservationStatus, "reserved" | "dispatching" | "interrupted">) { return this.mutate((l) => l.finish(id, status)); }
  block() { return this.mutate((l) => l.block()); }
  snapshot() { return this.mutate((l) => l.snapshot()); }
}
