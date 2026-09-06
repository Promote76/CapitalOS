import { centsToMoney, parseMoneyToCents } from "./finance.ts";

export type BudgetCategoryInput = {
  id: string;
  name: string;
  categoryType: string;
  essentialStatus: string;
  monthlyTarget: string;
  warningThreshold: string;
};

export type HouseholdTransactionInput = {
  id: string;
  amount: string;
  categoryId: string | null;
  excludedFromBudget: boolean;
};

export type BudgetPerformance = {
  id: string;
  name: string;
  categoryType: string;
  essentialStatus: string;
  budgeted: string;
  actual: string;
  variance: string;
  percentageUsed: number;
  projectedMonthEnd: string;
  status: "under_pace" | "on_pace" | "above_pace";
};

export type CashFlowMetrics = {
  grossInflow: string;
  essentialOutflow: string;
  discretionaryOutflow: string;
  debtService: string;
  savingsContributions: string;
  investmentContributions: string;
  propertyContributions: string;
  netCashFlow: string;
  freeCashFlow: string;
  savingsRate: number;
  investmentRate: number;
};

export type SafeToDeployResult = {
  safeToDeploy: string;
  rawSafeToDeploy: string;
  confidence: "high" | "medium" | "low";
  confidenceScore: number;
  breakdown: {
    liquidAvailableCash: string;
    billsDueBeforeNextIncome: string;
    requiredMonthlyExpenses: string;
    emergencyReserveShortfall: string;
    protectedGoalCommitments: string;
    knownUpcomingExpenses: string;
    requiredSafetyBuffer: string;
    maximumDeployableAmount: string;
  };
  reason: string;
};

const cents = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : parseMoneyToCents(value ?? "0");

export function canonicalManualTransactionAmount(
  amount: string,
  direction: "inflow" | "outflow",
) {
  const magnitude = Math.abs(parseMoneyToCents(amount));
  return centsToMoney(direction === "outflow" ? -magnitude : magnitude);
}

export function calculateBudgetPerformance(
  categories: BudgetCategoryInput[],
  transactions: HouseholdTransactionInput[],
  daysElapsed: number,
  daysInMonth: number,
): BudgetPerformance[] {
  return categories
    .map((category) => {
      const budgeted = cents(category.monthlyTarget);
      const netSpend = transactions
        .filter((transaction) => transaction.categoryId === category.id && !transaction.excludedFromBudget)
        .reduce((sum, transaction) => sum + cents(transaction.amount), 0);
      const actual = Math.max(0, category.categoryType === "income" ? netSpend : -netSpend);
      const variance = budgeted - actual;
      const percentageUsed = budgeted === 0 ? 0 : Number(((actual / budgeted) * 100).toFixed(1));
      const projectedCents = daysElapsed > 0 ? Math.round((actual / daysElapsed) * daysInMonth) : 0;
      const threshold = Number(category.warningThreshold || "1");
      const status =
        budgeted > 0 && projectedCents > budgeted * Math.max(threshold, 1.01)
          ? "above_pace"
          : actual > budgeted
            ? "above_pace"
            : percentageUsed >= 85
              ? "on_pace"
              : "under_pace";
      return {
        id: category.id,
        name: category.name,
        categoryType: category.categoryType,
        essentialStatus: category.essentialStatus,
        budgeted: centsToMoney(budgeted),
        actual: centsToMoney(actual),
        variance: centsToMoney(variance),
        percentageUsed,
        projectedMonthEnd: centsToMoney(projectedCents),
        status,
      };
    });
}

export function calculateCashFlowMetrics(
  transactions: Array<HouseholdTransactionInput & { categoryType: string; essentialStatus: string }>,
): CashFlowMetrics {
  let grossInflow = 0;
  let essentialOutflow = 0;
  let discretionaryOutflow = 0;
  let debtService = 0;
  let savingsContributions = 0;
  let investmentContributions = 0;
  let propertyContributions = 0;

  for (const transaction of transactions.filter((item) => !item.excludedFromBudget)) {
    const amount = cents(transaction.amount);
    if (transaction.categoryType === "transfer") continue;
    if (amount > 0 && transaction.categoryType === "income") {
      grossInflow += amount;
      continue;
    }
    const outflow = -amount;
    if (transaction.categoryType === "debt_payment") debtService += outflow;
    else if (transaction.categoryType === "savings") savingsContributions += outflow;
    else if (transaction.categoryType === "investment") investmentContributions += outflow;
    else if (transaction.categoryType === "one_time_expense" && transaction.essentialStatus === "essential") essentialOutflow += outflow;
    else if (transaction.essentialStatus === "essential") essentialOutflow += outflow;
    else discretionaryOutflow += outflow;
    if (transaction.categoryType === "investment" && transaction.essentialStatus === "mixed") propertyContributions += outflow;
  }

  essentialOutflow = Math.max(0, essentialOutflow);
  discretionaryOutflow = Math.max(0, discretionaryOutflow);
  debtService = Math.max(0, debtService);
  savingsContributions = Math.max(0, savingsContributions);
  investmentContributions = Math.max(0, investmentContributions);
  propertyContributions = Math.max(0, propertyContributions);
  const netCashFlow = grossInflow - essentialOutflow - discretionaryOutflow - debtService - savingsContributions - investmentContributions;
  const freeCashFlow = grossInflow - essentialOutflow - discretionaryOutflow - debtService - savingsContributions - investmentContributions;
  return {
    grossInflow: centsToMoney(grossInflow),
    essentialOutflow: centsToMoney(essentialOutflow),
    discretionaryOutflow: centsToMoney(discretionaryOutflow),
    debtService: centsToMoney(debtService),
    savingsContributions: centsToMoney(savingsContributions),
    investmentContributions: centsToMoney(investmentContributions),
    propertyContributions: centsToMoney(propertyContributions),
    netCashFlow: centsToMoney(netCashFlow),
    freeCashFlow: centsToMoney(freeCashFlow),
    savingsRate: grossInflow === 0 ? 0 : Number(((savingsContributions / grossInflow) * 100).toFixed(1)),
    investmentRate: grossInflow === 0 ? 0 : Number(((investmentContributions / grossInflow) * 100).toFixed(1)),
  };
}

export function calculateSafeToDeploy(input: {
  liquidAvailableCash: number;
  billsDueBeforeNextIncome: number;
  requiredMonthlyExpenses: number;
  emergencyReserveShortfall: number;
  protectedGoalCommitments: number;
  knownUpcomingExpenses: number;
  requiredSafetyBuffer: number;
  maximumDeployablePercentage: number;
  dataConfidence: number;
}): SafeToDeployResult {
  const raw =
    input.liquidAvailableCash -
    input.billsDueBeforeNextIncome -
    input.requiredMonthlyExpenses -
    input.emergencyReserveShortfall -
    input.protectedGoalCommitments -
    input.knownUpcomingExpenses -
    input.requiredSafetyBuffer;
  const maximumDeployableAmount = Math.floor(Math.max(raw, 0) * Math.min(Math.max(input.maximumDeployablePercentage, 0), 1));
  const safe = Math.min(Math.max(raw, 0), maximumDeployableAmount);
  const confidenceScore = Math.max(0, Math.min(100, Math.round(input.dataConfidence)));
  const confidence = confidenceScore >= 85 ? "high" : confidenceScore >= 65 ? "medium" : "low";
  return {
    safeToDeploy: centsToMoney(safe),
    rawSafeToDeploy: centsToMoney(Math.max(raw, 0)),
    confidence,
    confidenceScore,
    breakdown: {
      liquidAvailableCash: centsToMoney(input.liquidAvailableCash),
      billsDueBeforeNextIncome: centsToMoney(input.billsDueBeforeNextIncome),
      requiredMonthlyExpenses: centsToMoney(input.requiredMonthlyExpenses),
      emergencyReserveShortfall: centsToMoney(input.emergencyReserveShortfall),
      protectedGoalCommitments: centsToMoney(input.protectedGoalCommitments),
      knownUpcomingExpenses: centsToMoney(input.knownUpcomingExpenses),
      requiredSafetyBuffer: centsToMoney(input.requiredSafetyBuffer),
      maximumDeployableAmount: centsToMoney(maximumDeployableAmount),
    },
    reason:
      safe === 0
        ? "Current obligations exceed deployable surplus."
        : confidence === "low"
          ? "Account data is incomplete or stale, so the Governor is applying a conservative limit."
          : "Bills, reserves, protected goals, and the safety buffer are funded before deployable surplus is shown.",
  };
}

export function calculateEmergencyReserve(input: {
  essentialMonthlyExpenses: number;
  targetMonths: number;
  currentAmount: number;
}) {
  const target = input.essentialMonthlyExpenses * input.targetMonths;
  return {
    target: centsToMoney(target),
    current: centsToMoney(input.currentAmount),
    gap: centsToMoney(Math.max(target - input.currentAmount, 0)),
    monthsCovered: input.essentialMonthlyExpenses === 0 ? 0 : Number((input.currentAmount / input.essentialMonthlyExpenses).toFixed(1)),
    targetMonths: input.targetMonths,
  };
}

export function calculateFinancialHealthScore(input: {
  cashFlow: number;
  savingsConsistency: number;
  emergencyReserve: number;
  debtBurden: number;
  budgetStability: number;
  duplexProgress: number;
  liquidity: number;
  capitalRisk: number;
  incomeStability: number;
}) {
  const values = Object.values(input);
  const score = Math.round(values.reduce((sum, value) => sum + Math.max(0, Math.min(100, value)), 0) / values.length);
  return {
    score,
    label: score >= 85 ? "Healthy" : score >= 65 ? "Building" : "Review",
    disclaimer: "This summarizes household financial stability using Capital OS data. It is not a lender credit score or guarantee of financial outcomes.",
  };
}

export function deduplicateImportedTransactions<T extends { externalId?: string }>(
  imported: T[],
  existingExternalIds: Set<string>,
) {
  const seen = new Set(existingExternalIds);
  const fresh: T[] = [];
  for (const transaction of imported) {
    if (transaction.externalId && seen.has(transaction.externalId)) continue;
    if (transaction.externalId) seen.add(transaction.externalId);
    fresh.push(transaction);
  }
  return { fresh, skippedDuplicates: imported.length - fresh.length };
}

export function detectRecurringTransactions(
  transactions: Array<{ merchant?: string | null; amount: string; transactionDate: string }>,
) {
  const groups = new Map<string, { merchant: string; amount: string; dates: string[] }>();
  for (const transaction of transactions) {
    if (!transaction.merchant) continue;
    const key = `${transaction.merchant.toLowerCase()}|${transaction.amount}`;
    const group = groups.get(key) ?? { merchant: transaction.merchant, amount: transaction.amount, dates: [] };
    group.dates.push(transaction.transactionDate);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.dates.length >= 2)
    .map((group) => ({ merchant: group.merchant, amount: group.amount, occurrences: group.dates.length, dates: group.dates }));
}

export function canViewFinancialBalance(role: string, protectedAccount: boolean) {
  return !(role === "advisor" && protectedAccount);
}