import { lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { openLiveOperator } from "./v2-operator.js";
import { openLiveOperatorV3 } from "./v2-operator-v3.js";
import { LiveMetaProposalService } from "./v2-live-proposal.js";
import { LiveProposalBudgetLedgerV3, V2_LIVE_RETIREMENT_MARKER } from "./v2-live-ledger-v3.js";
import { BasetenLiveProposalService, createBasetenAdmission, readBasetenModelProfile, type BasetenLiveLedger } from "./v2-baseten-live.js";
import type { V2ProposalService } from "./v2-http.js";

const unavailable = () => new Error("Controlled live configuration is unavailable.");
async function present(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw unavailable(); }
}

/** Operator-selected startup only; this function is never reached from an HTTP body. */
export async function createControlledLiveServices(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch): Promise<{
  readonly service: V2ProposalService; readonly operatorVersion: "2" | "3"; close(): Promise<void>;
}> {
  const mode = env.V2_PLANNER_MODE;
  if (mode !== "meta" && mode !== "baseten") throw unavailable();
  const key = mode === "baseten" ? env.BASETEN_API_KEY : env.MODEL_API_KEY;
  if (!key) throw unavailable();
  const operatorDir = resolve(env.V2_OPERATOR_DIR ?? "runs/v2-live/operator");
  const shared = await present(join(operatorDir, "v3")) || await present(join(operatorDir, V2_LIVE_RETIREMENT_MARKER));
  if (mode === "baseten" && !shared) throw new Error("Migrate the existing live operator to shared accounting before selecting Baseten.");
  // Presence of any v3 artifact forbids falling back to a separate v2 pool.
  const operator = shared ? await openLiveOperatorV3(operatorDir) : await openLiveOperator(operatorDir);
  try {
    if (mode === "meta") {
      const service = new LiveMetaProposalService(operator.ledger, operator.registry, key, fetcher);
      return { service, operatorVersion: shared ? "3" : "2", close: () => operator.close() };
    }
    if (!(operator.ledger instanceof LiveProposalBudgetLedgerV3)) throw unavailable();
    const ledger = operator.ledger;
    const basetenLedger: BasetenLiveLedger = {
      preflight: (principal) => ledger.preflight(principal),
      reserve: (principal, requestDigest, inputTokens) => ledger.reserve(principal, requestDigest, inputTokens, "baseten"),
      beforeAttempt: (id, attempt) => ledger.beforeAttempt(id, attempt),
      usage: (id, usage) => ledger.usage(id, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, totalTokens: usage.totalTokens }),
      finish: (id, status) => ledger.finish(id, status),
      block: () => ledger.block()
    };
    const profile = await readBasetenModelProfile(key, fetcher);
    const service = new BasetenLiveProposalService(basetenLedger, operator.registry, key, createBasetenAdmission(profile), fetcher);
    return { service, operatorVersion: "3", close: () => operator.close() };
  } catch (error) { await operator.close().catch(() => {}); throw error; }
}
