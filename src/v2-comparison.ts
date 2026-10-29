export type ComparisonOutcome = { readonly verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly fingerprint: string; readonly observed: boolean };
export type ComparisonClass = "regression" | "resolved-failure" | "persistent-failure" | "stable-observation" | "expectation-met" | "expectation-not-met" | "inconclusive" | "non-comparable";

export function classifyComparison(previous: ComparisonOutcome | null | undefined, proposed: ComparisonOutcome | null | undefined, scope: "unchanged" | "new-or-changed"): ComparisonClass {
  if (!previous || !proposed || !previous.observed || !proposed.observed || previous.verdict === "INCONCLUSIVE" || proposed.verdict === "INCONCLUSIVE") return "inconclusive";
  if (previous.fingerprint !== proposed.fingerprint) return "non-comparable";
  if (scope === "new-or-changed") return proposed.verdict === "PASS" ? "expectation-met" : "expectation-not-met";
  if (previous.verdict === "PASS" && proposed.verdict === "FAIL") return "regression";
  if (previous.verdict === "FAIL" && proposed.verdict === "PASS") return "resolved-failure";
  if (previous.verdict === "FAIL" && proposed.verdict === "FAIL") return "persistent-failure";
  return "stable-observation";
}
