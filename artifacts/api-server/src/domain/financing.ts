import { centsToMoney } from "./finance.ts";

export type FinancingLiabilityInput = {
  currentBalanceCents: number;
  monthlyPaymentCents: number;
  liabilityType: string;
  creditLimitCents?: number;
  ownership: "household" | "business";
  status: string;
};

export type FinancingReadiness = {
  status: "ready_for_review" | "needs_data" | "not_ready";
  score: number;
  monthlyDebtServiceCents: number;
  monthlyIncomeCents: number;
  dtiPercent: number | null;
  revolvingUtilizationPercent: number | null;
  propertyDscr: number | null;
  reasons: string[];
};

export function calculateMonthlyPayment(input: {
  principalCents: number;
  annualRatePercent: number;
  termMonths: number;
}): number {
  if (input.principalCents <= 0 || input.termMonths <= 0) return 0;
  const monthlyRate = input.annualRatePercent / 100 / 12;
  if (monthlyRate === 0) return Math.round(input.principalCents / input.termMonths);
  const factor = Math.pow(1 + monthlyRate, input.termMonths);
  return Math.round(input.principalCents * (monthlyRate * factor) / (factor - 1));
}

export function calculateDebtMetrics(input: {
  liabilities: FinancingLiabilityInput[];
  monthlyIncomeCents: number;
  proposedMonthlyPaymentCents?: number;
  propertyMonthlyNoiCents?: number;
}): Pick<FinancingReadiness, "monthlyDebtServiceCents" | "monthlyIncomeCents" | "dtiPercent" | "revolvingUtilizationPercent" | "propertyDscr"> {
  const active = input.liabilities.filter((item) => item.status === "active");
  const monthlyDebtServiceCents = active.reduce((sum, item) => sum + item.monthlyPaymentCents, 0) + (input.proposedMonthlyPaymentCents ?? 0);
  const revolvingBalance = active
    .filter((item) => item.liabilityType === "revolving")
    .reduce((sum, item) => sum + item.currentBalanceCents, 0);
  const revolvingLimit = active
    .filter((item) => item.liabilityType === "revolving")
    .reduce((sum, item) => sum + (item.creditLimitCents ?? 0), 0);
  return {
    monthlyDebtServiceCents,
    monthlyIncomeCents: input.monthlyIncomeCents,
    dtiPercent: input.monthlyIncomeCents > 0 ? Number(((monthlyDebtServiceCents / input.monthlyIncomeCents) * 100).toFixed(2)) : null,
    revolvingUtilizationPercent: revolvingLimit > 0 ? Number(((revolvingBalance / revolvingLimit) * 100).toFixed(2)) : null,
    propertyDscr: input.propertyMonthlyNoiCents !== undefined && monthlyDebtServiceCents > 0
      ? Number((input.propertyMonthlyNoiCents / monthlyDebtServiceCents).toFixed(3))
      : null,
  };
}

export function calculateCashToClose(input: {
  purchasePriceCents: number;
  downPaymentPercent: number;
  closingCostsCents: number;
  loanFeesCents: number;
  immediateRepairsCents: number;
  initialReservesCents: number;
  creditsCents?: number;
  assistanceCents?: number;
  availableHouseholdCashCents: number;
  protectedCashCents: number;
  businessOperatingCashCents: number;
}) {
  const downPaymentCents = Math.round(input.purchasePriceCents * input.downPaymentPercent);
  const uses = downPaymentCents + input.closingCostsCents + input.loanFeesCents + input.immediateRepairsCents + input.initialReservesCents;
  const credits = (input.creditsCents ?? 0) + (input.assistanceCents ?? 0);
  const eligibleCashCents = Math.max(
    input.availableHouseholdCashCents - input.protectedCashCents - input.businessOperatingCashCents,
    0,
  );
  const sources = eligibleCashCents + credits;
  const fundingGapCents = Math.max(uses - sources, 0);
  return {
    usesCents: uses,
    sourcesCents: sources,
    creditsCents: credits,
    eligibleCashCents,
    fundingGapCents,
    status: fundingGapCents > 0 ? "funding_gap" as const : "funded_with_review" as const,
    explanation: fundingGapCents > 0
      ? "Funding gap: do not fill the gap automatically with additional debt."
      : "Sources cover modeled uses, subject to reserve, governor, and independent review.",
  };
}

export function calculateFinancingReadiness(input: {
  metrics: ReturnType<typeof calculateDebtMetrics>;
  score: number | null;
  documentsComplete: number;
  documentsTotal: number;
  cashToCloseGapCents: number;
  safeToBorrowCents: number;
}): FinancingReadiness {
  const reasons: string[] = [];
  let score = 100;
  if (input.metrics.dtiPercent === null) {
    reasons.push("Monthly income is needed before DTI can be assessed.");
    score -= 25;
  } else if (input.metrics.dtiPercent > 43) {
    reasons.push("Modeled DTI is above the conservative 43% review threshold.");
    score -= 30;
  } else if (input.metrics.dtiPercent > 36) {
    reasons.push("Modeled DTI is above the preferred 36% planning threshold.");
    score -= 12;
  }
  if (input.metrics.revolvingUtilizationPercent !== null && input.metrics.revolvingUtilizationPercent > 30) {
    reasons.push("Revolving utilization is above the 30% planning threshold.");
    score -= 15;
  }
  if (input.score === null) {
    reasons.push("No credit score was provided; this is not a creditworthiness or approval decision.");
    score -= 15;
  }
  if (input.documentsTotal === 0 || input.documentsComplete < input.documentsTotal) {
    reasons.push("Document readiness is incomplete.");
    score -= 10;
  }
  if (input.cashToCloseGapCents > 0) {
    reasons.push("Cash-to-close has a funding gap.");
    score -= 25;
  }
  if (input.safeToBorrowCents <= 0) {
    reasons.push("Capital Governor or liquidity inputs do not support additional borrowing capacity.");
    score -= 25;
  }
  const boundedScore = Math.max(0, Math.min(100, score));
  return {
    status: reasons.length === 0 ? "ready_for_review" : boundedScore >= 60 ? "needs_data" : "not_ready",
    score: boundedScore,
    ...input.metrics,
    reasons,
  };
}

export function financingPolicy() {
  return {
    mode: "advisory_only",
    executionEnabled: false,
    providersEnabled: false,
    lenderApprovalClaimsAllowed: false,
    disclaimer: "Illustrative planning outputs are not credit decisions, prequalification, preapproval, commitments, or lender approval.",
    prohibitedActions: [
      "credit pulls",
      "loan application submission",
      "lender scraping",
      "offer acceptance",
      "disclosure signing",
      "money movement",
      "automatic debt creation",
    ],
    moneyTreatment: "Loan proceeds are modeled as cash plus liability, never as income.",
  } as const;
}

export function moneyRecord(value: number) {
  return centsToMoney(Math.round(value));
}