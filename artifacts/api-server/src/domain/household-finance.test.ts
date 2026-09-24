import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBudgetPerformance,
  calculateCashFlowMetrics,
  calculateEmergencyReserve,
  calculateFinancialHealthScore,
  calculateSafeToDeploy,
  canonicalManualTransactionAmount,
  canViewFinancialBalance,
  deduplicateImportedTransactions,
  detectRecurringTransactions,
  isExcludedFromHouseholdSpending,
  reviewedTransactionBudgetExclusion,
} from "./household-finance.ts";
import { allocateWeeklyGuidanceCents, canonicalFinalizedPlanningPeriods, latestFinalizedPlanningPeriod, remainingWeeklyGuidanceCents, weeklyGuidanceCents, weeklyGuidanceExclusionDecision } from "../services/household-finance.ts";
import { csvImportBankingAdapter, normalizeImportedAmount } from "../adapters/banking.ts";

test("manual entries canonicalize inflows and outflows regardless of entered sign", () => {
  assert.equal(canonicalManualTransactionAmount("125.50", "inflow"), "125.50");
  assert.equal(canonicalManualTransactionAmount("-125.50", "inflow"), "125.50");
  assert.equal(canonicalManualTransactionAmount("42.25", "outflow"), "-42.25");
  assert.equal(canonicalManualTransactionAmount("-42.25", "outflow"), "-42.25");
});

test("CSV keeps canonical income, expense, and refund signs", () => {
  const imported = csvImportBankingAdapter.importTransactions(
    "date,description,amount\n2026-09-01,Pay,2500.00\n2026-09-02,Groceries,-125.00\n2026-09-03,Refund,20.00",
  );
  assert.deepEqual(imported.map((row) => row.amount), ["2500.00", "-125.00", "20.00"]);
});

test("Plaid positive-outflow amounts normalize to the canonical contract", () => {
  assert.equal(normalizeImportedAmount("-2500.00", "positive_outflow"), "2500.00");
  assert.equal(normalizeImportedAmount("125.00", "positive_outflow"), "-125.00");
  assert.equal(normalizeImportedAmount("-20.00", "positive_outflow"), "20.00");
});

test("normalized mixed transactions net consistently across providers", () => {
  const canonical = [
    canonicalManualTransactionAmount("1000.00", "inflow"),
    ...csvImportBankingAdapter.importTransactions([
      { transactionDate: "2026-09-01", description: "Expense", amount: "-250.00" },
      { transactionDate: "2026-09-02", description: "Refund", amount: "25.00" },
    ]).map((row) => row.amount),
    normalizeImportedAmount("-500.00", "positive_outflow"),
    normalizeImportedAmount("100.00", "positive_outflow"),
  ];
  assert.equal(canonical.reduce((sum, amount) => sum + Number(amount), 0), 1175);
});

test("budget totals use signed transaction amounts and exclude transfers", () => {
  const [housing] = calculateBudgetPerformance(
    [{ id: "housing", name: "Housing", categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "1800.00", warningThreshold: "1.05" }],
    [
      { id: "expense", amount: "-1750.00", categoryId: "housing", excludedFromBudget: false },
      { id: "transfer", amount: "-500.00", categoryId: "other", excludedFromBudget: true },
    ],
    30,
    30,
  );
  assert.equal(housing.actual, "1750.00");
  assert.equal(housing.variance, "50.00");
});

test("transfer categories fail closed even when a row exclusion flag is inconsistent", () => {
  const [transfer] = calculateBudgetPerformance(
    [{ id: "transfer", name: "Transfer", categoryType: "transfer", essentialStatus: "mixed", monthlyTarget: "0.00", warningThreshold: "1.05" }],
    [{ id: "approved-transfer", amount: "-500.00", categoryId: "transfer", excludedFromBudget: false }],
    30,
    30,
  );
  assert.equal(transfer.actual, "0.00");
  assert.equal(transfer.projectedMonthEnd, "0.00");
});

test("credit-card payments are excluded explicitly by category or transfer group", () => {
  assert.equal(isExcludedFromHouseholdSpending({
    excludedFromBudget: false,
    transferGroupId: null,
  }, "transfer"), true);
  assert.equal(isExcludedFromHouseholdSpending({
    excludedFromBudget: false,
    transferGroupId: "card-payment-pair",
  }, "debt_payment"), true);

  const [debt] = calculateBudgetPerformance(
    [{ id: "card-payment", name: "Credit card payment", categoryType: "transfer", essentialStatus: "mixed", monthlyTarget: "0.00", warningThreshold: "1.05" }],
    [{ id: "card-payment-row", amount: "-350.00", categoryId: "card-payment", excludedFromBudget: false }],
    30,
    30,
  );
  assert.equal(debt.actual, "0.00");
});

test("weekly guidance review actions stay disabled for rows with transfer identity", () => {
  const decision = weeklyGuidanceExclusionDecision({
    categoryId: "food",
    pending: false,
    reviewStatus: "possible_transfer",
    excludedFromBudget: false,
    businessTag: "household" as const,
    transferGroupId: "transfer-group",
    amount: "-50.00",
  }, { categoryType: "variable_essential" });
  assert.deepEqual(decision, { reason: "unreviewed", actionable: false });
});

test("weekly guidance review actions allow only recoverable household rows", () => {
  const base = {
    pending: false,
    reviewStatus: "needs_review" as const,
    excludedFromBudget: false,
    businessTag: "household" as const,
    transferGroupId: null,
    amount: "-50.00",
  };
  assert.deepEqual(
    weeklyGuidanceExclusionDecision({ ...base, categoryId: "food" }, { categoryType: "variable_essential" }),
    { reason: "unreviewed", actionable: true },
  );
  assert.deepEqual(
    weeklyGuidanceExclusionDecision({ ...base, categoryId: null }, undefined),
    { reason: "uncategorized", actionable: true },
  );
  assert.deepEqual(
    weeklyGuidanceExclusionDecision({ ...base, categoryId: null, businessTag: "business" }, undefined),
    { reason: "uncategorized", actionable: false },
  );
});

test("review transitions cannot include transfers after approval", () => {
  assert.equal(reviewedTransactionBudgetExclusion("approved", "transfer", null), true);
  assert.equal(reviewedTransactionBudgetExclusion("approved", "debt_payment", "card-payment-pair"), true);
  assert.equal(reviewedTransactionBudgetExclusion("excluded", "fixed_expense", null), true);
  assert.equal(reviewedTransactionBudgetExclusion("approved", "fixed_expense", null), false);
});

test("refunds reduce the original category spend", () => {
  const [food] = calculateBudgetPerformance(
    [{ id: "food", name: "Food", categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "600.00", warningThreshold: "1.05" }],
    [
      { id: "expense", amount: "-100.00", categoryId: "food", excludedFromBudget: false },
      { id: "refund", amount: "25.00", categoryId: "food", excludedFromBudget: false },
    ],
    30,
    30,
  );
  assert.equal(food.actual, "75.00");
});

test("approved income appears as a positive Budget Performance actual", () => {
  const [income] = calculateBudgetPerformance(
    [{ id: "income", name: "Household income", categoryType: "income", essentialStatus: "essential", monthlyTarget: "5000.00", warningThreshold: "1.05" }],
    [
      { id: "pay", amount: "235.00", categoryId: "income", excludedFromBudget: false },
      { id: "excluded", amount: "100.00", categoryId: "income", excludedFromBudget: true },
    ],
    6,
    30,
  );
  assert.equal(income.actual, "235.00");
  assert.equal(income.budgeted, "5000.00");
});

test("safe to deploy is never negative and reserve shortfall reduces it", () => {
  const result = calculateSafeToDeploy({
    liquidAvailableCash: 10_000 * 100,
    billsDueBeforeNextIncome: 1_000 * 100,
    requiredMonthlyExpenses: 3_000 * 100,
    emergencyReserveShortfall: 2_000 * 100,
    protectedGoalCommitments: 1_000 * 100,
    knownUpcomingExpenses: 500 * 100,
    requiredSafetyBuffer: 1_000 * 100,
    maximumDeployablePercentage: 0.25,
    dataConfidence: 70,
  });
  assert.equal(result.safeToDeploy, "375.00");
  assert.equal(calculateSafeToDeploy({
    liquidAvailableCash: 100,
    billsDueBeforeNextIncome: 500,
    requiredMonthlyExpenses: 300,
    emergencyReserveShortfall: 100,
    protectedGoalCommitments: 100,
    knownUpcomingExpenses: 100,
    requiredSafetyBuffer: 100,
    maximumDeployablePercentage: 0.25,
    dataConfidence: 90,
  }).safeToDeploy, "0.00");
});

test("cash-flow reconciliation separates savings from household expenses", () => {
  const metrics = calculateCashFlowMetrics([
    { id: "income", amount: "5000.00", categoryId: null, excludedFromBudget: false, categoryType: "income", essentialStatus: "essential" },
    { id: "rent", amount: "-1500.00", categoryId: null, excludedFromBudget: false, categoryType: "fixed_expense", essentialStatus: "essential" },
    { id: "save", amount: "-500.00", categoryId: null, excludedFromBudget: false, categoryType: "savings", essentialStatus: "essential" },
  ]);
  assert.equal(metrics.grossInflow, "5000.00");
  assert.equal(metrics.essentialOutflow, "1500.00");
  assert.equal(metrics.savingsContributions, "500.00");
  assert.equal(metrics.netCashFlow, "3000.00");
});

test("emergency reserve reports current months and remaining gap", () => {
  const reserve = calculateEmergencyReserve({ essentialMonthlyExpenses: 3_000 * 100, targetMonths: 3, currentAmount: 6_000 * 100 });
  assert.equal(reserve.monthsCovered, 2);
  assert.equal(reserve.gap, "3000.00");
});

test("financial health score stays inside the explainable 0-100 range", () => {
  const health = calculateFinancialHealthScore({
    cashFlow: 120,
    savingsConsistency: 80,
    emergencyReserve: 60,
    debtBurden: 70,
    budgetStability: 90,
    duplexProgress: 80,
    liquidity: 75,
    capitalRisk: 95,
    incomeStability: 85,
  });
  assert.equal(health.score, 82);
  assert.equal(health.label, "Building");
});

test("imports skip duplicate bank transaction IDs", () => {
  const result = deduplicateImportedTransactions(
    [{ externalId: "a" }, { externalId: "b" }, { externalId: "b" }, { externalId: "c" }],
    new Set(["a"]),
  );
  assert.equal(result.fresh.length, 2);
  assert.equal(result.skippedDuplicates, 2);
});

test("recurring detection groups repeated merchant and amount pairs", () => {
  const recurring = detectRecurringTransactions([
    { merchant: "Stream Co", amount: "-82.00", transactionDate: "2026-07-20" },
    { merchant: "Stream Co", amount: "-82.00", transactionDate: "2026-08-20" },
    { merchant: "Market", amount: "-40.00", transactionDate: "2026-08-21" },
  ]);
  assert.equal(recurring[0].merchant, "Stream Co");
  assert.equal(recurring[0].occurrences, 2);
});

test("advisors cannot see protected account balances", () => {
  assert.equal(canViewFinancialBalance("advisor", true), false);
  assert.equal(canViewFinancialBalance("advisor", false), true);
  assert.equal(canViewFinancialBalance("owner", true), true);
});

test("copy-forward selects the latest finalized plan, including a newer closed period", () => {
  const source = latestFinalizedPlanningPeriod([
    { month: "2026-01-01", status: "approved", id: "older" },
    { month: "2026-02-01", status: "closed", id: "closed-newer" },
    { month: "2026-03-01", status: "draft", id: "draft" },
  ], "2026-04-01");
  assert.equal(source?.id, "closed-newer");
});

test("same-month superseding corrections become the only canonical finalized budget version", () => {
  const periods = [
    { month: "2026-08-01", status: "approved", id: "aug-original", createdAt: "2026-08-01T10:00:00.000Z" },
    { month: "2026-08-01", status: "closed", id: "aug-corrected", createdAt: "2026-08-15T10:00:00.000Z" },
    { month: "2026-09-01", status: "approved", id: "sep-current", createdAt: "2026-09-01T10:00:00.000Z" },
    { month: "2026-09-01", status: "draft", id: "sep-draft", createdAt: "2026-09-20T10:00:00.000Z" },
  ];
  assert.deepEqual(canonicalFinalizedPlanningPeriods(periods).map((period) => period.id), ["aug-corrected", "sep-current"]);
  assert.equal(latestFinalizedPlanningPeriod(periods, "2026-09-01")?.id, "aug-corrected");
});

test("weekly guidance template balances exact cents across the approved catalog", () => {
  const names = ["Housing", "Food", "Transportation", "Utilities", "Insurance", "Healthcare", "Childcare", "Debt payment", "Personal", "Entertainment", "Savings", "Investments", "Other"];
  const basisPoints = [3000, 1200, 1000, 800, 600, 500, 500, 800, 400, 300, 500, 300, 100];
  const result = allocateWeeklyGuidanceCents(123_457, names.map((name, index) => ({ id: String(index), name, categoryType: "fixed_expense", archived: false, allocationBasisPoints: basisPoints[index] })));
  assert.equal(result.isCompleteTemplate, true);
  assert.equal([...result.allocations.values()].reduce((total, amount) => total + amount, 0), 123_457);
  assert.equal(weeklyGuidanceCents(10_000), 2_308);
});

test("weekly guidance fails closed for custom or incomplete allocation templates", () => {
  const result = allocateWeeklyGuidanceCents(100_000, [{ id: "custom", categoryType: "variable_essential", archived: false, allocationBasisPoints: null }]);
  assert.equal(result.isCompleteTemplate, false);
  assert.equal(result.allocations.size, 0);
});

test("weekly guidance adjusts remaining weekly amount for spending and never goes negative", () => {
  assert.equal(remainingWeeklyGuidanceCents(30_000, 10_000, 4), 5_000);
  assert.equal(remainingWeeklyGuidanceCents(30_000, 40_000, 4), 0);
  assert.equal(remainingWeeklyGuidanceCents(30_000, 0, 0), 0);
});

test("CSV imports preserve quoted descriptions and reject malformed rows", () => {
  const imported = csvImportBankingAdapter.importTransactions(
    'date,description,amount,merchant\n2026-09-01,"Market, weekly",-42.50,"Corner Market"',
  );
  assert.equal(imported.length, 1);
  assert.deepEqual(imported[0], {
    externalId: undefined,
    transactionDate: "2026-09-01",
    description: "Market, weekly",
    amount: "-42.50",
    merchant: "Corner Market",
  });
  assert.throws(
    () => csvImportBankingAdapter.importTransactions("date,description,amount\n2026-09-01,Missing amount"),
    /same number of columns/,
  );
});