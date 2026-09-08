import { centsToMoney, parseMoneyToCents } from "./finance";

export type SettlementMathResult = {
  revenueLineTotalCents: number;
  deductionLineTotalCents: number;
  calculatedNetCents: number;
  reportedGrossCents: number | null;
  reportedDeductionsCents: number | null;
  reportedNetCents: number | null;
  grossVarianceCents: number;
  deductionVarianceCents: number;
  netVarianceCents: number;
  status: "reconciled" | "needs_review";
  reason: string;
};

export function reconcileSettlementMath(input: {
  revenueLines: Array<{ amount: string }>;
  deductionLines: Array<{ amount: string }>;
  reportedGross?: string | null;
  reportedDeductions?: string | null;
  reportedNet?: string | null;
}): SettlementMathResult {
  const revenueLineTotalCents = input.revenueLines.reduce((sum, line) => sum + parseMoneyToCents(line.amount), 0);
  const deductionLineTotalCents = input.deductionLines.reduce((sum, line) => sum + parseMoneyToCents(line.amount), 0);
  const calculatedNetCents = revenueLineTotalCents - deductionLineTotalCents;
  const reportedGrossCents = input.reportedGross == null ? null : parseMoneyToCents(input.reportedGross);
  const reportedDeductionsCents = input.reportedDeductions == null ? null : parseMoneyToCents(input.reportedDeductions);
  const reportedNetCents = input.reportedNet == null ? null : parseMoneyToCents(input.reportedNet);
  const grossVarianceCents = reportedGrossCents == null ? 0 : revenueLineTotalCents - reportedGrossCents;
  const deductionVarianceCents = reportedDeductionsCents == null ? 0 : deductionLineTotalCents - reportedDeductionsCents;
  const netVarianceCents = reportedNetCents == null ? 0 : calculatedNetCents - reportedNetCents;
  const complete = reportedGrossCents != null && reportedDeductionsCents != null && reportedNetCents != null;
  const reconciled = complete && grossVarianceCents === 0 && deductionVarianceCents === 0 && netVarianceCents === 0;

  return {
    revenueLineTotalCents,
    deductionLineTotalCents,
    calculatedNetCents,
    reportedGrossCents,
    reportedDeductionsCents,
    reportedNetCents,
    grossVarianceCents,
    deductionVarianceCents,
    netVarianceCents,
    status: reconciled ? "reconciled" : "needs_review",
    reason: reconciled
      ? "Settlement line totals reconcile to the reported totals."
      : complete
        ? `Settlement variance remains: gross ${centsToMoney(grossVarianceCents)}, deductions ${centsToMoney(deductionVarianceCents)}, net ${centsToMoney(netVarianceCents)}.`
        : "Reported gross, deductions, and net are all required before a settlement can be marked reconciled.",
  };
}

export type PeriodReconciliationResult = {
  settlementGrossCents: number;
  settlementDeductionsCents: number;
  operatingExpensesCents: number;
  calculatedProfitCents: number;
  reportedProfitCents: number | null;
  varianceCents: number;
  periodCoverage: "complete" | "incomplete";
  status: "reconciled" | "needs_review";
  reason: string;
};

export function reconcileBusinessPeriod(input: {
  settlementGross: string;
  settlementDeductions: string;
  operatingExpenses: string;
  reportedProfit?: string | null;
  settlementPeriods: Array<{ start: string; end: string }>;
  requestedPeriod: { start: string; end: string };
}): PeriodReconciliationResult {
  const settlementGrossCents = parseMoneyToCents(input.settlementGross);
  const settlementDeductionsCents = parseMoneyToCents(input.settlementDeductions);
  const operatingExpensesCents = parseMoneyToCents(input.operatingExpenses);
  const calculatedProfitCents = settlementGrossCents - settlementDeductionsCents - operatingExpensesCents;
  const reportedProfitCents = input.reportedProfit == null ? null : parseMoneyToCents(input.reportedProfit);
  const varianceCents = reportedProfitCents == null ? 0 : calculatedProfitCents - reportedProfitCents;
  const periodCoverage = input.settlementPeriods.some((period) => period.start <= input.requestedPeriod.start && period.end >= input.requestedPeriod.end)
    ? "complete"
    : "incomplete";
  const reconciled = periodCoverage === "complete" && reportedProfitCents != null && varianceCents === 0;
  return {
    settlementGrossCents,
    settlementDeductionsCents,
    operatingExpensesCents,
    calculatedProfitCents,
    reportedProfitCents,
    varianceCents,
    periodCoverage,
    status: reconciled ? "reconciled" : "needs_review",
    reason: reconciled
      ? "Settlement and operating results cover the requested period and reconcile to reported profit."
      : periodCoverage === "incomplete"
        ? "The available source documents do not fully cover the requested period."
        : "Calculated profit does not reconcile to the reported profit.",
  };
}

export function matchSettlementCash(input: {
  settlementNet: string;
  paidDate: string | null;
  candidates: Array<{ id: string; transactionDate: string; amount: string; description: string }>;
  dateWindowDays?: number;
}) {
  const expectedCents = parseMoneyToCents(input.settlementNet);
  if (!input.paidDate || expectedCents <= 0) {
    return { status: "unmatched" as const, transactionId: null, confidence: 0, matchedAmountCents: 0, reason: "A positive net amount and paid date are required for cash matching." };
  }
  const window = input.dateWindowDays ?? 7;
  const candidates = input.candidates
    .map((candidate) => ({
      ...candidate,
      amountCents: parseMoneyToCents(candidate.amount),
      dayDistance: Math.abs((Date.parse(candidate.transactionDate) - Date.parse(input.paidDate!)) / 86_400_000),
    }))
    .filter((candidate) => candidate.amountCents === expectedCents && candidate.dayDistance <= window);
  if (candidates.length === 1) {
    return {
      status: "matched" as const,
      transactionId: candidates[0].id,
      confidence: candidates[0].dayDistance === 0 ? 1 : 0.85,
      matchedAmountCents: expectedCents,
      reason: "One read-only business transaction matches the settlement net and payment window.",
    };
  }
  return {
    status: candidates.length > 1 ? "needs_review" as const : "unmatched" as const,
    transactionId: null,
    confidence: 0,
    matchedAmountCents: 0,
    reason: candidates.length > 1
      ? "Multiple transactions match the amount and payment window; human review is required."
      : "No read-only business transaction matches the settlement net and payment window.",
  };
}

export function calculateBusinessCashPosition(input: {
  bankCash: string;
  pendingDeposits: string;
  outstandingAdvances: string;
  escrowHeld: string;
  reimbursementsDue: string;
  reserveFloor: string;
}) {
  const bankCashCents = parseMoneyToCents(input.bankCash);
  const pendingDepositsCents = parseMoneyToCents(input.pendingDeposits);
  const outstandingAdvancesCents = parseMoneyToCents(input.outstandingAdvances);
  const escrowHeldCents = parseMoneyToCents(input.escrowHeld);
  const reimbursementsDueCents = parseMoneyToCents(input.reimbursementsDue);
  const reserveFloorCents = parseMoneyToCents(input.reserveFloor);
  const safeToDistributeCents = Math.max(
    0,
    bankCashCents - escrowHeldCents - reimbursementsDueCents - reserveFloorCents,
  );
  return {
    bankCashCents,
    pendingDepositsCents,
    outstandingAdvancesCents,
    escrowHeldCents,
    reimbursementsDueCents,
    reserveFloorCents,
    safeToDistributeCents,
    status: "reviewable" as const,
    reason: "Safe-to-distribute excludes escrow, reimbursements due, and the business reserve floor.",
  };
}

export function evaluateOwnerDraw(input: {
  requestedAmount: string;
  safeToDistribute: string;
  unresolvedAnomalies: number;
  cashMatchStatus: "matched" | "unmatched" | "needs_review" | "not_required";
  settlementMathStatus: "reconciled" | "needs_review" | "not_required";
}) {
  const requestedCents = parseMoneyToCents(input.requestedAmount);
  const safeCents = parseMoneyToCents(input.safeToDistribute);
  const blockedReasons: string[] = [];
  if (requestedCents <= 0) blockedReasons.push("Owner draw must be positive.");
  if (requestedCents > safeCents) blockedReasons.push("Requested owner draw exceeds safe-to-distribute capacity.");
  if (input.unresolvedAnomalies > 0) blockedReasons.push("Unresolved business income anomalies remain.");
  if (!["matched", "not_required"].includes(input.cashMatchStatus)) blockedReasons.push("Settlement cash evidence is not complete.");
  if (!["reconciled", "not_required"].includes(input.settlementMathStatus)) blockedReasons.push("Settlement math is not reconciled.");
  return {
    eligibleAmountCents: blockedReasons.length === 0 ? Math.min(requestedCents, safeCents) : 0,
    blockedReasons,
    status: blockedReasons.length === 0 ? "eligible" as const : "needs_review" as const,
  };
}

export function verifiedIncomeFromApprovedDraw(input: {
  proposalStatus: string;
  approvedAmount: string;
  requestedAmount: string;
  blockedReasons: string[];
}) {
  const approvedCents = parseMoneyToCents(input.approvedAmount);
  const requestedCents = parseMoneyToCents(input.requestedAmount);
  if (input.proposalStatus !== "approved" || approvedCents <= 0 || approvedCents > requestedCents || input.blockedReasons.length > 0) {
    throw new Error("Only an explicitly approved, unblocked owner draw can become verified household income");
  }
  return approvedCents;
}