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

export type StatementCategoryCandidate = {
  id: string;
  name: string;
  categoryType: string;
};

export type StatementCategorySuggestion = {
  categoryId: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
};

const categoryWords = (value: string) =>
  new Set(value.toLocaleLowerCase("en-US").split(/[^a-z0-9]+/).filter((word) => word.length > 2));

/**
 * Suggestions are advisory and household-local. Exact name/description overlap
 * is preferred; otherwise direction only narrows a deterministic low-confidence
 * fallback that still requires a separate reviewer decision.
 */
export function suggestStatementCategory(
  description: string,
  direction: "deposit" | "withdrawal",
  candidates: readonly StatementCategoryCandidate[],
): StatementCategorySuggestion | null {
  const eligible = candidates.filter((candidate) =>
    direction === "deposit"
      ? candidate.categoryType === "income"
      : candidate.categoryType !== "income" && candidate.categoryType !== "transfer",
  );
  if (!eligible.length) return null;
  const descriptionWords = categoryWords(description);
  const ranked = eligible.map((candidate) => {
    const words = categoryWords(candidate.name);
    const overlap = [...words].filter((word) => descriptionWords.has(word)).length;
    return { candidate, overlap, exact: description.toLocaleLowerCase("en-US").includes(candidate.name.toLocaleLowerCase("en-US")) };
  }).sort((a, b) => Number(b.exact) - Number(a.exact) || b.overlap - a.overlap || a.candidate.name.localeCompare(b.candidate.name));
  const best = ranked[0];
  const confidence = best.exact ? "HIGH" : best.overlap > 0 ? "MEDIUM" : "LOW";
  const reason = best.exact
    ? `Statement description contains the household category name "${best.candidate.name}".`
    : best.overlap > 0
      ? `Statement description shares ${best.overlap} meaningful word${best.overlap === 1 ? "" : "s"} with the household category "${best.candidate.name}".`
      : `No merchant-name match was found; "${best.candidate.name}" is the first household category compatible with this transaction direction.`;
  return { categoryId: best.candidate.id, confidence, reason };
}

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