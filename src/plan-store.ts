import { createHash, randomUUID } from "node:crypto";
import { CONTRACT_VERSION, type Plan, validatePlan } from "./contracts.js";
import { TARGET_REGISTRY_VERSION, type Scenario } from "./scenarios.js";

export type PlannerProvenance = { mode: "fixture"; provider: null; model: null };
export type ApprovalEnvelope = {
  originalRequirement: string;
  scenario: Scenario;
  contractVersion: "1";
  targetRegistryVersion: typeof TARGET_REGISTRY_VERSION;
  planner: PlannerProvenance;
  plan: Plan;
};

type StoredPlan = { id: string; envelope: ApprovalEnvelope; digest: string; approvedAt?: number; consumed: boolean };
const canonical = (value: ApprovalEnvelope) => JSON.stringify(value);
const digestFor = (envelope: ApprovalEnvelope) => `sha256:${createHash("sha256").update(canonical(envelope)).digest("hex")}`;

export class PlanStore {
  private plans = new Map<string, StoredPlan>();

  create(requirement: string, scenario: Scenario, candidate: Plan, planner: PlannerProvenance = { mode: "fixture", provider: null, model: null }) {
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
    const stored = { id: randomUUID(), envelope, digest: digestFor(envelope), consumed: false };
    this.plans.set(stored.id, stored);
    return { id: stored.id, digest: stored.digest, plan: structuredClone(plan), envelope: structuredClone(envelope) };
  }

  approve(id: string) {
    const plan = this.require(id);
    if (plan.consumed) throw new Error("Plan approval has already been used.");
    if (plan.approvedAt) throw new Error("Plan is already approved; run it or create a new plan.");
    plan.approvedAt = Date.now();
    return { id: plan.id, digest: plan.digest, expiresAt: new Date(plan.approvedAt + 600_000).toISOString() };
  }

  consume(id: string) {
    const stored = this.require(id);
    if (!stored.approvedAt) throw new Error("Approve the plan before running it.");
    if (Date.now() - stored.approvedAt >= 600_000) throw new Error("Plan approval expired; approve a new snapshot.");
    if (stored.consumed) throw new Error("Plan approval has already been used.");
    validatePlan(stored.envelope.plan);
    if (stored.envelope.plan.scenarioId !== stored.envelope.scenario.id || digestFor(stored.envelope) !== stored.digest) throw new Error("Approved snapshot integrity check failed.");
    stored.consumed = true;
    return { id: stored.id, digest: stored.digest, envelope: structuredClone(stored.envelope) };
  }

  private require(id: string) {
    const plan = this.plans.get(id);
    if (!plan) throw new Error("Unknown plan.");
    return plan;
  }
}
