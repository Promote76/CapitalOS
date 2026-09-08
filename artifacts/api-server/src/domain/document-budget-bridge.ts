import { createHash } from "node:crypto";

export const statementCategoryDecisionStatuses = [
  "UNCLASSIFIED",
  "SUGGESTED",
  "USER_CONFIRMED",
  "USER_CORRECTED",
  "NOT_APPLICABLE_TRANSFER",
  "NOT_APPLICABLE_SETTLEMENT",
  "REJECTED",
] as const;

export const statementFinancialInclusionStatuses = [
  "NOT_REVIEWED",
  "READY_FOR_INCLUSION_REVIEW",
  "MATCH_CANDIDATE",
  "DUPLICATE_REVIEW_REQUIRED",
  "READY_TO_IMPORT",
  "LINKED_EXISTING",
  "IMPORTED_NEW",
  "EXCLUDED_TRANSFER",
  "EXCLUDED_SETTLEMENT",
  "EXCLUDED_DUPLICATE",
  "REVERSED",
  "REJECTED",
] as const;

export type StatementCategoryDecisionStatus = typeof statementCategoryDecisionStatuses[number];
export type StatementFinancialInclusionStatus = typeof statementFinancialInclusionStatuses[number];

const inclusionTransitions: Record<StatementFinancialInclusionStatus, readonly StatementFinancialInclusionStatus[]> = {
  NOT_REVIEWED: ["READY_FOR_INCLUSION_REVIEW", "REJECTED"],
  READY_FOR_INCLUSION_REVIEW: ["MATCH_CANDIDATE", "DUPLICATE_REVIEW_REQUIRED", "READY_TO_IMPORT", "EXCLUDED_TRANSFER", "EXCLUDED_SETTLEMENT", "REJECTED"],
  MATCH_CANDIDATE: ["DUPLICATE_REVIEW_REQUIRED", "READY_TO_IMPORT", "LINKED_EXISTING", "EXCLUDED_DUPLICATE", "REJECTED"],
  DUPLICATE_REVIEW_REQUIRED: ["READY_TO_IMPORT", "LINKED_EXISTING", "EXCLUDED_DUPLICATE", "REJECTED"],
  READY_TO_IMPORT: ["IMPORTED_NEW", "LINKED_EXISTING", "EXCLUDED_TRANSFER", "EXCLUDED_SETTLEMENT", "EXCLUDED_DUPLICATE", "REJECTED"],
  LINKED_EXISTING: ["REVERSED"],
  IMPORTED_NEW: ["REVERSED"],
  EXCLUDED_TRANSFER: [],
  EXCLUDED_SETTLEMENT: [],
  EXCLUDED_DUPLICATE: [],
  REVERSED: [],
  REJECTED: [],
};

/**
 * Inclusion is monotonic: an already-included row may only become REVERSED,
 * never return to a state that could create a second official transaction.
 */
export function canTransitionStatementFinancialInclusion(
  from: StatementFinancialInclusionStatus,
  to: StatementFinancialInclusionStatus,
) {
  return inclusionTransitions[from].includes(to);
}

export type StatementRowFingerprintInput = {
  householdId: string;
  accountId: string | null;
  postedDate: string | null;
  signedAmount: string;
  description: string;
  merchant?: string | null;
  reference?: string | null;
  providerTransactionId?: string | null;
};

const normalizeIdentityText = (value: string | null | undefined) =>
  (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");

/** Stable, household-scoped identity for exact-once statement-row inclusion. */
export function statementRowFingerprint(input: StatementRowFingerprintInput) {
  const sourceIdentity = [
    input.householdId.trim().toLocaleLowerCase("en-US"),
    input.accountId ?? "",
    input.postedDate ?? "",
    input.signedAmount.trim(),
    normalizeIdentityText(input.description),
    normalizeIdentityText(input.merchant),
    normalizeIdentityText(input.reference),
    normalizeIdentityText(input.providerTransactionId),
  ].join("\u001f");
  return createHash("sha256").update(sourceIdentity).digest("hex");
}