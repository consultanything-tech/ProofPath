import { createHash, randomUUID } from "node:crypto";
import { CONTRACT_VERSION, type Plan, validatePlan } from "./contracts.js";
import { getScenario, TARGET_REGISTRY_VERSION, type Scenario } from "./scenarios.js";

export type PlannerProvenance = { mode: "fixture"; provider: null; model: null } | { mode: "meta"; provider: "meta-model-api"; model: "muse-spark-1.3" } | { mode: "baseten"; provider: "baseten"; model: "meta-models/muse-spark-open-1026" };
export type ApprovalEnvelope = {
  originalRequirement: string;
  scenario: Scenario;
  contractVersion: "1";
  targetRegistryVersion: typeof TARGET_REGISTRY_VERSION;
  planner: PlannerProvenance;
  plan: Plan;
};

export type StoredPlan = { id: string; envelope: ApprovalEnvelope; digest: string; ownerKey?: string; approvedAt?: number; consumed: boolean };
const canonical = (value: ApprovalEnvelope) => JSON.stringify(value);
const digestFor = (envelope: ApprovalEnvelope) => `sha256:${createHash("sha256").update(canonical(envelope)).digest("hex")}`;

export class PlanStore {
  private plans = new Map<string, StoredPlan>();

  static restore(plans: StoredPlan[]) {
    const store = new PlanStore();
    for (const plan of plans) {
      if (!plan || !/^[a-f0-9-]{36}$/.test(plan.id) || store.plans.has(plan.id) || !plan.envelope || digestFor(plan.envelope) !== plan.digest || typeof plan.consumed !== "boolean" || (plan.ownerKey !== undefined && (typeof plan.ownerKey !== "string" || !plan.ownerKey || plan.ownerKey.length > 128)) || (plan.approvedAt !== undefined && (!Number.isSafeInteger(plan.approvedAt) || plan.approvedAt <= 0)) || (plan.consumed && !plan.approvedAt)) throw new Error("Saved plan integrity check failed.");
      const envelope = plan.envelope;
      const provenance = envelope.planner;
      if (typeof envelope.originalRequirement !== "string" || !envelope.originalRequirement.trim() || envelope.originalRequirement.length > 2000 || envelope.contractVersion !== CONTRACT_VERSION || envelope.targetRegistryVersion !== TARGET_REGISTRY_VERSION || JSON.stringify(envelope.scenario) !== JSON.stringify(getScenario(envelope.scenario?.id, envelope.scenario?.revision)) || validatePlan(envelope.plan).scenarioId !== envelope.scenario.id || !provenance || ![
        JSON.stringify({ mode: "fixture", provider: null, model: null }),
        JSON.stringify({ mode: "meta", provider: "meta-model-api", model: "muse-spark-1.3" }),
        JSON.stringify({ mode: "baseten", provider: "baseten", model: "meta-models/muse-spark-open-1026" })
      ].includes(JSON.stringify(provenance))) throw new Error("Saved plan envelope is invalid.");
      store.plans.set(plan.id, structuredClone(plan));
    }
    return store;
  }
  snapshot(): StoredPlan[] { return structuredClone([...this.plans.values()]); }

  create(requirement: string, scenario: Scenario, candidate: Plan, planner: PlannerProvenance = { mode: "fixture", provider: null, model: null }, ownerKey?: string) {
    const plan = validatePlan(candidate);
    if (plan.scenarioId !== scenario.id) throw new Error("Plan does not match the selected scenario.");
    const envelope: ApprovalEnvelope = {
      originalRequirement: requirement,
      scenario: structuredClone(scenario),
      contractVersion: CONTRACT_VERSION,
      targetRegistryVersion: TARGET_REGISTRY_VERSION,
      planner: structuredClone(planner),
      plan: structuredClone(plan)
    };
    const stored = { id: randomUUID(), envelope, digest: digestFor(envelope), ...(ownerKey ? { ownerKey } : {}), consumed: false };
    this.plans.set(stored.id, stored);
    return { id: stored.id, digest: stored.digest, plan: structuredClone(plan), envelope: structuredClone(envelope) };
  }

  approve(id: string, ownerKey?: string) {
    const plan = this.require(id, ownerKey);
    if (plan.consumed) throw new Error("Plan approval has already been used.");
    if (plan.approvedAt) throw new Error("Plan is already approved; run it or create a new plan.");
    plan.approvedAt = Date.now();
    return { id: plan.id, digest: plan.digest, expiresAt: new Date(plan.approvedAt + 600_000).toISOString() };
  }

  consume(id: string, ownerKey?: string) {
    const stored = this.require(id, ownerKey);
    if (!stored.approvedAt) throw new Error("Approve the plan before running it.");
    if (Date.now() - stored.approvedAt >= 600_000) throw new Error("Plan approval expired; approve a new snapshot.");
    if (stored.consumed) throw new Error("Plan approval has already been used.");
    validatePlan(stored.envelope.plan);
    if (stored.envelope.plan.scenarioId !== stored.envelope.scenario.id || digestFor(stored.envelope) !== stored.digest) throw new Error("Approved snapshot integrity check failed.");
    stored.consumed = true;
    return { id: stored.id, digest: stored.digest, envelope: structuredClone(stored.envelope) };
  }

  private require(id: string, ownerKey?: string) {
    const plan = this.plans.get(id);
    if (!plan || (plan.ownerKey !== undefined && plan.ownerKey !== ownerKey)) throw new Error("Unknown plan.");
    return plan;
  }
}
