export type V2Sku = "desk-lamp" | "notebook" | "cable";
export type V2ReleaseId = "r1" | "r2" | "r3";

export interface CatalogProduct { readonly sku: V2Sku; readonly name: string; readonly unitPriceMinor: number; }
export interface Catalog { readonly version: "2"; readonly currency: "SGD"; readonly products: readonly CatalogProduct[]; }

export interface ReleaseRef {
  readonly id: V2ReleaseId;
  readonly documentPath: string;
  readonly resources: readonly string[];
  readonly fingerprint: string;
}

export interface SemanticTarget { readonly id: string; readonly role: "button" | "input" | "status" | "region"; }
export interface AppContract {
  readonly appId: "registered-checkout";
  readonly adapterVersion: "2";
  readonly origin: string;
  readonly catalog: Catalog;
  readonly semanticTargets: readonly SemanticTarget[];
  readonly inspectionPolicy: { readonly readonlyDocuments: readonly string[]; readonly readonlyResources: readonly string[]; readonly reset: "new-context" };
}

export interface CheckoutRules {
  readonly currency: "SGD";
  readonly quantityMinimum: number;
  readonly quantityMaximum: number;
  readonly couponCode: string;
  readonly couponBasisPoints: number;
  readonly rounding: "half-up";
  readonly deliveryBasis: "discounted-subtotal";
  readonly deliveryThresholdMinor: number;
  readonly deliveryThresholdInclusive: true;
  readonly deliveryFeeMinor: number;
  readonly requiredContactFields: readonly ("email" | "postal-code")[];
  readonly syntheticConfirmationOnly: true;
}

export type SemanticAction =
  | { readonly id: string; readonly kind: "open-app"; readonly target: "checkout"; readonly value: null }
  | { readonly id: string; readonly kind: "add-product" | "remove-product"; readonly target: V2Sku; readonly value: null }
  | { readonly id: string; readonly kind: "set-quantity"; readonly target: V2Sku; readonly value: number }
  | { readonly id: string; readonly kind: "fill-coupon"; readonly target: "coupon"; readonly value: string }
  | { readonly id: string; readonly kind: "apply-coupon"; readonly target: "coupon"; readonly value: null }
  | { readonly id: string; readonly kind: "open-contact"; readonly target: "contact"; readonly value: null }
  | { readonly id: string; readonly kind: "fill-contact"; readonly target: "email" | "postal-code"; readonly value: string }
  | { readonly id: string; readonly kind: "confirm-synthetic-order"; readonly target: "synthetic-order"; readonly value: null };

export interface CaseAssertion { readonly id: string; readonly predicate: "total-minor" | "coupon-error" | "contact-errors" | "synthetic-confirmation"; }
export interface CaseDefinition {
  readonly id: string;
  readonly criterionIds: readonly string[];
  readonly category: "happy" | "negative" | "boundary" | "interaction";
  readonly rationale: string;
  readonly actions: readonly SemanticAction[];
  readonly assertions: readonly CaseAssertion[];
}

export interface CaseInput {
  readonly cart: readonly { readonly sku: V2Sku; readonly quantity: number }[];
  readonly coupon: string | null;
  readonly contact: { readonly email: string; readonly postalCode: string };
  readonly state: {
    readonly contactOpen: boolean;
    readonly couponAttempted: boolean;
    readonly appliedCoupon: string | null;
    readonly confirmationAttempted: boolean;
    readonly confirmationContact: { readonly email: string; readonly postalCode: string } | null;
    readonly confirmationDismissed: boolean;
  };
}

export interface ExpectedCase {
  readonly subtotalMinor: number;
  readonly discountMinor: number;
  readonly discountedSubtotalMinor: number;
  readonly deliveryMinor: number;
  readonly totalMinor: number;
  readonly couponError: "invalid-coupon" | null;
  readonly contactErrors: { readonly email: "required" | null; readonly postalCode: "required" | null };
  readonly syntheticConfirmation: "confirmed" | "blocked" | "not-requested";
}

export type NumericCheckoutRuleField = "quantityMinimum" | "quantityMaximum" | "couponBasisPoints" | "deliveryThresholdMinor" | "deliveryFeeMinor";
export interface NumericRuleChange { readonly criterionId: string; readonly field: NumericCheckoutRuleField; readonly value: number; readonly sourceQuote: string; }
export interface RequirementContract {
  readonly version: "2";
  readonly originalText: string;
  readonly criteria: readonly { readonly id: string; readonly sourceQuote: string; readonly normalizedRule: string }[];
  readonly normalizedRules: CheckoutRules;
  readonly adoptedReferenceIds: readonly string[];
  readonly numericRuleChanges: readonly NumericRuleChange[];
  readonly reviewedReferences: readonly { readonly criterionId: string; readonly adoptedReferenceIds: readonly string[] }[];
  readonly expectationScope: readonly { readonly criterionId: string; readonly scope: "unchanged" | "new-or-changed" }[];
  readonly coverageGaps: readonly string[];
}
export interface RequirementProposal {
  readonly version: "2";
  readonly originalText: string;
  readonly criteria: RequirementContract["criteria"];
  readonly numericRuleChanges: readonly NumericRuleChange[];
  readonly expectationScope: RequirementContract["expectationScope"];
  readonly coverageGaps: readonly string[];
}

export interface GroundingBundle {
  readonly releases: readonly [ReleaseRef, ReleaseRef];
  readonly observedTargets: readonly string[];
  readonly declaredTargets: readonly string[];
  readonly pairFingerprint: string;
}

export interface ProposalResult { readonly kind: "proposal" | "clarification"; readonly requirement: RequirementProposal; readonly cases: readonly CaseDefinition[]; readonly gaps: readonly string[]; }
export interface CriterionReviewDecision { readonly criterionId: string; readonly interpretation: string; readonly scope: "unchanged" | "new-or-changed"; readonly adoptedReferenceIds: readonly string[]; readonly acceptedGaps: readonly string[]; readonly acceptedNumericRuleChanges: readonly NumericRuleChange[]; }
export interface ReviewDecision { readonly decisions: readonly CriterionReviewDecision[]; }
export interface SuiteDefinition { readonly version: "2"; readonly requirement: RequirementContract; readonly rules: CheckoutRules; readonly referenceId: string; readonly cases: readonly CaseDefinition[]; readonly app: AppContract; readonly releases: readonly [ReleaseRef, ReleaseRef]; }
export interface SuiteApproval { readonly definition: SuiteDefinition; readonly rules: CheckoutRules; readonly referenceId: string; readonly expectations: readonly ExpectedCase[]; readonly grounding: GroundingBundle; readonly provenance: readonly string[]; readonly digest: string; readonly expiresAt: string; readonly consumed: boolean; }
export interface V2ActionResult { readonly id: string; readonly status: "completed" | "blocked" | "timed-out" | "failed" | "not-run"; readonly startedAt: string | null; readonly endedAt: string | null; readonly url: string | null; readonly error?: string; }
export interface V2AssertionResult { readonly id: string; readonly expected: unknown; readonly observed: unknown | null; readonly verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly screenshot: string; readonly screenshotSha256?: string; readonly timestamp: string; readonly url: string; }
export interface CaseReleaseRecord { readonly caseId: string; readonly releaseId: V2ReleaseId; readonly actions: readonly V2ActionResult[]; readonly assertions: readonly V2AssertionResult[]; readonly verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly startedAt: string; readonly endedAt: string; }
export interface CaseComparison { readonly caseId: string; readonly classification: "regression" | "resolved-failure" | "persistent-failure" | "stable-observation" | "expectation-met" | "expectation-not-met" | "inconclusive" | "non-comparable"; }
export interface SuiteRunArtifactSnapshot { readonly definition: SuiteDefinition; readonly expectations: readonly ExpectedCase[]; readonly provenance: readonly string[]; }
export interface SuiteRun { readonly id: string; readonly approvalDigest: string; readonly artifact: SuiteRunArtifactSnapshot; readonly status: "accepted" | "running" | "completed" | "interrupted"; readonly records: readonly CaseReleaseRecord[]; readonly comparisons: readonly CaseComparison[]; readonly coverage: readonly string[]; readonly verdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly candidateVerdict: "PASS" | "FAIL" | "INCONCLUSIVE"; readonly startedAt: string; readonly endedAt: string | null; }
export interface SavedRegression { readonly id: string; readonly definition: SuiteDefinition; readonly provenance: readonly string[]; }
export interface PreparedProposal { readonly provenance?: readonly string[]; readonly id: string; readonly proposal: ProposalResult; readonly context: V2Context; }
export interface PreparedSuite { readonly provenance?: readonly string[]; readonly id: string; readonly definition: SuiteDefinition; readonly expectations: readonly ExpectedCase[]; readonly digest: string; }
export interface ApprovalReceipt { readonly id: string; readonly digest: string; readonly expiresAt: string; }

export interface V2Context {
  readonly app: AppContract;
  readonly catalog: Catalog;
  readonly rules: CheckoutRules;
  readonly releases: readonly ReleaseRef[];
  readonly grounding: GroundingBundle;
  readonly requirement: RequirementContract;
}
