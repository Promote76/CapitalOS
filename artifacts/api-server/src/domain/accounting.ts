export type CashFlowLine = {
  amountCents: number;
  kind: "income" | "expense" | "transfer" | "contribution" | "debt_payment";
};

export type AccountingCashFlowLine = CashFlowLine & {
  reviewStatus: string;
  pending: boolean;
  excludedFromBudget: boolean;
  categorized: boolean;
};

export type LedgerLine = {
  debitCents: number;
  creditCents: number;
};

export function calculateNetWorth(assetCents: number, liabilityCents: number) {
  return assetCents - liabilityCents;
}

export type CrossViewScope = "planning" | "treasury" | "internal_portfolio" | "business" | "property";
export type CrossViewScopeStatus = "separate_scope" | "not_available" | "restricted";

function externalScope(
  scope: CrossViewScope,
  amountCents: number | null | undefined,
  restrictedScopes: ReadonlySet<CrossViewScope>,
) {
  if (restrictedScopes.has(scope)) {
    return { scope, amountCents: null, status: "restricted" as const };
  }
  if (amountCents === null || amountCents === undefined) {
    return { scope, amountCents: null, status: "not_available" as const };
  }
  return { scope, amountCents, status: "separate_scope" as const };
}

export function reconcileCrossViewTotals(input: {
  accountingNetWorthCents: number;
  accountingAssetsCents: number;
  accountingLiabilitiesCents: number;
  planningCapitalCents?: number | null;
  treasuryCapitalCents?: number | null;
  internalPortfolioCapitalCents?: number | null;
  businessEquityCents?: number | null;
  propertyEquityCents?: number | null;
  restrictedScopes?: CrossViewScope[];
}) {
  const accountingBalances = input.accountingAssetsCents - input.accountingLiabilitiesCents;
  const accountingReconciles = accountingBalances === input.accountingNetWorthCents;
  const restrictedScopes = new Set(input.restrictedScopes ?? []);
  const separateScopes = [
    externalScope("planning", input.planningCapitalCents, restrictedScopes),
    externalScope("treasury", input.treasuryCapitalCents, restrictedScopes),
    externalScope("internal_portfolio", input.internalPortfolioCapitalCents, restrictedScopes),
    externalScope("business", input.businessEquityCents, restrictedScopes),
    externalScope("property", input.propertyEquityCents, restrictedScopes),
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
    note: "Treasury and internal Portfolio are separate allocation scopes. Missing or restricted scopes remain explicit and are never treated as zero or added to household accounting net worth.",
  };
}

export function summarizeCashFlow(lines: CashFlowLine[]) {
  return lines.reduce(
    (summary, line) => {
      if (line.kind === "transfer") return summary;
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

export function summarizeReviewedCashFlow(lines: AccountingCashFlowLine[]) {
  return summarizeCashFlow(lines.filter((line) =>
    line.reviewStatus === "approved" &&
    !line.pending &&
    !line.excludedFromBudget &&
    line.categorized
  ));
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