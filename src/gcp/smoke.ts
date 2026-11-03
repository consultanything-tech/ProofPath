import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import type { PreparedProposal, PreparedSuite, SuiteRun, ApprovalReceipt } from "../v2-contracts.js";
import type { RunManifest } from "../evidence.js";

/** Fixture-only acceptance journey, reusable against local adapters and real cloud services. */
export async function smokeQueuedWorkflows(origin: string, transport: typeof fetch = fetch) {
  const request = async (path: string, body?: unknown) => {
    const response = await transport(origin + path, body === undefined ? {} : { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return response.json() as Promise<any>;
  };
  const poll = async (path: string, finished: (value: any) => boolean) => {
    const deadline = Date.now() + 480_000;
    for (;;) { const value = await request(path); if (finished(value)) return value; assert.ok(Date.now() < deadline, "Queued fixture run timed out."); await setTimeout(500); }
  };
  assert.equal((await request("/api/v2/config")).mode, "fixture", "Never run fixture acceptance against live admission.");
  for (const path of ["/", "/workbench.html"]) assert.equal((await transport(origin + path)).status, 200);
  assert.equal((await transport(origin + "/v2-target/r1/index.html")).status, 404);
  assert.equal((await transport(origin + "/shop.html?revision=fixed")).status, 404);
  const v1: string[] = [];
  for (const revision of ["seeded-bug", "fixed"]) {
    const plan = await request("/api/plans", { requirement: "Quantity two totals S$78.", scenarioId: "quantity-update", revision });
    await request(`/api/plans/${plan.id}/approve`, {});
    const accepted = await request(`/api/plans/${plan.id}/run`, {});
    assert.equal((await request(`/api/plans/${plan.id}/run`, {})).runId, accepted.runId);
    const report = await poll(`/runs/${accepted.runId}/manifest.json`, (value) => !value.jobStatus) as RunManifest;
    assert.equal(report.executionStatus, "completed"); assert.equal(report.verdict, revision === "fixed" ? "PASS" : "FAIL");
    const capture = report.assertions.find((a) => a.screenshotSha256)!; assert.ok(capture);
    assert.equal((await transport(`${origin}/evidence/${report.runId}/${capture.screenshot}`)).status, 200);
    v1.push(report.runId);
  }
  const v2: string[] = [];
  for (const candidate of ["r2", "r3"]) {
    const proposal = await request("/api/v2/proposals", { requirement: "Delivery is free at discounted subtotal S$75.00 or more.", releases: ["r1", candidate] }) as PreparedProposal;
    assert.ok(proposal.id);
    const suite = await request(`/api/v2/proposals/${proposal.id}/review`, { review: { decisions: proposal.context.requirement.criteria.map((criterion) => ({ criterionId: criterion.id, interpretation: criterion.normalizedRule, scope: "unchanged", adoptedReferenceIds: ["checkout-reference-v2"], acceptedGaps: proposal.proposal.gaps, acceptedNumericRuleChanges: [] })) } }) as PreparedSuite;
    const approval = await request(`/api/v2/suites/${suite.id}/approve`, {}) as ApprovalReceipt;
    const accepted = await request(`/api/v2/approvals/${approval.id}/runs`, {});
    assert.equal((await request(`/api/v2/approvals/${approval.id}/runs`, {})).runId, accepted.runId);
    const report = await poll(`/api/v2/runs/${accepted.runId}`, (value) => !["accepted", "running"].includes(value.status)) as SuiteRun;
    assert.equal(report.status, "completed"); assert.equal(report.candidateVerdict, candidate === "r2" ? "FAIL" : "PASS");
    assert.ok(report.comparisons.some((c) => c.classification === (candidate === "r2" ? "regression" : "stable-observation")));
    assert.ok(report.records.length > 0);
    const capture = report.records.flatMap((record) => record.assertions).find((a) => a.screenshotSha256)!; assert.ok(capture);
    assert.equal((await transport(`${origin}/api/v2/runs/${report.id}/evidence/${capture.screenshot}`)).status, 200);
    const saved = await request(`/api/v2/runs/${report.id}/regressions`, {}); assert.ok(saved.id);
    for (const artifact of ["bug-packet", "playwright.test.mjs"]) assert.equal((await transport(`${origin}/api/v2/runs/${report.id}/${artifact}`)).status, 200);
    v2.push(report.id);
  }
  return { v1, v2, providerCalls: 0 };
}
