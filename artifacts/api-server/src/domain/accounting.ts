export type CashFlowLine = {
  amountCents: number;
  kind: "income" | "expense" | "transfer" | "contribution" | "debt_payment";
};

export type LedgerLine = {
  debitCents: number;
  creditCents: number;
};

export function calculateNetWorth(assetCents: number, liabilityCents: number) {
  return assetCents - liabilityCents;
}

export type CrossViewScope = "accounting" | "planning" | "treasury" | "business" | "property";

export function reconcileCrossViewTotals(input: {
  accountingNetWorthCents: number;
  accountingAssetsCents: number;
  accountingLiabilitiesCents: number;
  planningCapitalCents?: number;
  treasuryCapitalCents?: number;
  businessEquityCents?: number;
  propertyEquityCents?: number;
}) {
  const accountingBalances = input.accountingAssetsCents - input.accountingLiabilitiesCents;
  const accountingReconciles = accountingBalances === input.accountingNetWorthCents;
  const separateScopes: Array<{ scope: CrossViewScope; amountCents: number; status: "separate_scope" }> = [
    { scope: "planning", amountCents: input.planningCapitalCents ?? 0, status: "separate_scope" },
    { scope: "treasury", amountCents: input.treasuryCapitalCents ?? 0, status: "separate_scope" },
    { scope: "business", amountCents: input.businessEquityCents ?? 0, status: "separate_scope" },
    { scope: "property", amountCents: input.propertyEquityCents ?? 0, status: "separate_scope" },
  ];
  return {
    status: accountingReconciles ? "RECONCILED" as const : "REVIEW_REQUIRED" as const,
    accounting: {
      assetsCents: input.accountingAssetsCents,
      liabilitiesCents: input.accountingLiabilitiesCents,
      netWorthCents: input.accountingNetWorthCents,
      reconciles: accountingReconciles,
    },
    separateScopes,
    note: "Planning, Treasury, business, and property values are intentionally not aggregated into household accounting net worth.",
  };
}

export function summarizeCashFlow(lines: CashFlowLine[]) {
  return lines.reduce(
    (summary, line) => {
      if (line.kind === "income") summary.incomeCents += Math.max(0, line.amountCents);
      if (line.kind === "expense") summary.expensesCents += Math.max(0, Math.abs(line.amountCents));
      if (line.kind === "contribution") summary.contributionsCents += Math.max(0, Math.abs(line.amountCents));
      if (line.kind === "debt_payment") summary.debtReductionCents += Math.max(0, Math.abs(line.amountCents));
      summary.netCashFlowCents += line.amountCents;
      return summary;
    },
    { incomeCents: 0, expensesCents: 0, contributionsCents: 0, debtReductionCents: 0, netCashFlowCents: 0 },
  );
}

export function calculateNetWorthAttribution(input: {
  netWorthChangeCents: number;
  capitalContributedCents: number;
  investmentGrowthCents: number;
  debtReductionCents: number;
}) {
  const otherCents = input.netWorthChangeCents
    - input.capitalContributedCents
    - input.investmentGrowthCents
    - input.debtReductionCents;
  return {
    ...input,
    otherCents,
    reconciles: input.netWorthChangeCents === input.capitalContributedCents + input.investmentGrowthCents + input.debtReductionCents + otherCents,
  };
}

export function ledgerDebitsEqualCredits(lines: LedgerLine[]) {
  return lines.length > 0 && lines.every((line) =>
    line.debitCents > 0 &&
    line.creditCents > 0 &&
    line.debitCents === line.creditCents,
  );
}