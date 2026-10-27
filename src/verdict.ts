export type AssertionResult = { id: string; expected: string; observed: string | null; verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; screenshot: string; screenshotSha256?: string; timestamp?: string; url?: string };

export function aggregate(results: AssertionResult[], executionComplete = true): "PASS" | "FAIL" | "INCONCLUSIVE" {
  if (results.some((item) => item.verdict === "FAIL")) return "FAIL";
  if (!executionComplete || results.length === 0 || results.some((item) => item.verdict === "INCONCLUSIVE")) return "INCONCLUSIVE";
  return "PASS";
}
