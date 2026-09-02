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
  return lines.every((line) => line.debitCents === line.creditCents);
}