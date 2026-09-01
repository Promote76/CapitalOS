import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBudgetPerformance,
  calculateCashFlowMetrics,
  calculateEmergencyReserve,
  calculateFinancialHealthScore,
  calculateSafeToDeploy,
  canViewFinancialBalance,
  deduplicateImportedTransactions,
  detectRecurringTransactions,
} from "./household-finance.ts";

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