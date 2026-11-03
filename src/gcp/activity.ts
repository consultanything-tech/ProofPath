import { randomUUID } from "node:crypto";
import { ProposalBudgetError } from "../v2-proposal-budget.js";
import type { Repository } from "./repository.js";

/** A stopped or timed-out provider request requires operator reconciliation. */
export class GcpActivityGate {
  private owner: string | undefined;
  constructor(readonly repo: Repository, readonly clock = Date.now) {}
  async acquire() {
    if (this.owner) return false;
    const owner = randomUUID();
    return this.repo.withLock((records) => {
      const active = records.get("planning-activity") as { owner: string; until: number } | undefined;
      if (active) {
        if (!Number.isFinite(active.until) || active.until <= this.clock()) throw new ProposalBudgetError(503, "Previous planning activity requires operator reconciliation.");
        return false;
      }
      records.set("planning-activity", { owner, until: this.clock() + 240_000 });
      this.owner = owner;
      return true;
    });
  }
  async release() {
    const owner = this.owner;
    if (!owner) return;
    try {
      await this.repo.withLock((records) => {
        const active = records.get("planning-activity") as { owner: string; until: number } | undefined;
        if (!active || active.owner !== owner || active.until <= this.clock()) throw new ProposalBudgetError(503, "Planning activity requires operator reconciliation.");
        records.delete("planning-activity");
      });
    } finally { this.owner = undefined; }
  }
}
