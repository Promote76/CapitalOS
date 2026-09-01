import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  accounts,
  bankConnections,
  emergencyReserves,
  financeBills,
  financeCategories,
  financeSnapshots,
  financeTransactions,
  financialAccounts,
  goals,
  incomeSources,
  recurringTransactions,
  riskStates,
  upcomingExpenses,
} from "@workspace/db";
import {
  calculateBudgetPerformance,
  calculateCashFlowMetrics,
  calculateEmergencyReserve,
  calculateFinancialHealthScore,
  calculateSafeToDeploy,
  canViewFinancialBalance,
  deduplicateImportedTransactions,
} from "../domain/household-finance";
import { getBankingStatus } from "../adapters/banking";
import { csvImportBankingAdapter } from "../adapters/banking";
import { ensureSeedData } from "./seed";
import type { Actor } from "./capital-os";
import { assertPermission } from "../domain/governance";

const numeric = (value: string | number | null | undefined) => Number(value ?? 0);
const cents = (value: string | number | null | undefined) => Math.round(numeric(value) * 100);
const nowMonth = () => new Date().toISOString().slice(0, 7);
const calendarToday = () => new Date().toISOString().slice(0, 10);

type IncomeTimingSource = {
  active: boolean;
  cadence: string;
  nextPayDate: string;
};

function addCadence(dateValue: string, cadence: string) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (cadence === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else if (cadence === "biweekly") date.setUTCDate(date.getUTCDate() + 14);
  else if (cadence === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3);
  else if (cadence === "annual") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function nextPayDate(source: IncomeTimingSource, asOf = calendarToday()) {
  if (!source.nextPayDate) return null;
  let next = source.nextPayDate;
  for (let attempts = 0; next < asOf && attempts < 120; attempts += 1) {
    const following = addCadence(next, source.cadence);
    if (!following) return null;
    next = following;
  }
  return next >= asOf ? next : null;
}

function nextIncomeDate(sources: IncomeTimingSource[], asOf = calendarToday()) {
  return sources
    .filter((source) => source.active)
    .map((source) => nextPayDate(source, asOf))
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? null;
}

function nextMonthPeriod(asOf = calendarToday()) {
  const current = new Date(`${asOf}T00:00:00.000Z`);
  if (Number.isNaN(current.getTime())) return null;
  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function hasPayDateInPeriod(source: IncomeTimingSource, start: string, end: string, asOf = calendarToday()) {
  let next = nextPayDate(source, asOf);
  for (let attempts = 0; next && next < end && attempts < 120; attempts += 1) {
    if (next >= start) return true;
    next = addCadence(next, source.cadence);
  }
  return false;
}

async function householdId() {
  return (await ensureSeedData()).householdId;
}

function accountVisibility(actor: Actor, account: typeof financialAccounts.$inferSelect) {
  const restricted = !canViewFinancialBalance(actor.role, account.protected);
  return {
    id: account.id,
    institution: account.institution,
    nickname: account.nickname,
    accountType: account.accountType,
    currentBalance: restricted ? null : account.currentBalance,
    availableBalance: restricted ? null : account.availableBalance,
    connectionStatus: account.connectionStatus,
    dataSource: account.dataSource,
    lastSync: account.lastSync,
    includedInNetWorth: account.includedInNetWorth,
    includedInBudget: account.includedInBudget,
    protected: account.protected,
    restricted,
  };
}

export async function getFinancialAccounts(actor: Actor) {
  const id = await householdId();
  const [rows, connections] = await Promise.all([
    db.select().from(financialAccounts).where(eq(financialAccounts.householdId, id)),
    db.select().from(bankConnections).where(eq(bankConnections.householdId, id)),
  ]);
  return {
    readOnly: true,
    accounts: rows.map((account) => accountVisibility(actor, account)),
    connections: connections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      institutionName: connection.institutionName,
      lastSuccessfulSync: connection.lastSuccessfulSync,
    })),
    totals: {
      visibleBalance: rows.reduce((sum, account) => sum + (actor.role === "advisor" && account.protected ? 0 : numeric(account.currentBalance)), 0).toFixed(2),
      accountCount: rows.length,
    },
  };
}

async function loadFinanceData() {
  const id = await householdId();
  const [categories, transactions, bills, recurring, expenses, income, reserve, capitalAccounts, goalsRows, risks] = await Promise.all([
    db.select().from(financeCategories).where(eq(financeCategories.householdId, id)),
    db.select().from(financeTransactions).where(eq(financeTransactions.householdId, id)),
    db.select().from(financeBills).where(eq(financeBills.householdId, id)),
    db.select().from(recurringTransactions).where(eq(recurringTransactions.householdId, id)),
    db.select().from(upcomingExpenses).where(eq(upcomingExpenses.householdId, id)),
    db.select().from(incomeSources).where(eq(incomeSources.householdId, id)),
    db.select().from(emergencyReserves).where(eq(emergencyReserves.householdId, id)).limit(1),
    db.select().from(financialAccounts).where(eq(financialAccounts.householdId, id)),
    db.select().from(goals).where(eq(goals.householdId, id)),
    db.select().from(riskStates).where(eq(riskStates.householdId, id)).limit(1),
  ]);
  return { id, categories, transactions, bills, recurring, expenses, income, reserve: reserve[0], capitalAccounts, goalsRows, risk: risks[0] };
}

function transactionWithCategory(data: Awaited<ReturnType<typeof loadFinanceData>>) {
  return data.transactions.map((transaction) => {
    const category = data.categories.find((item) => item.id === transaction.categoryId);
    return {
      ...transaction,
      categoryType: category?.categoryType ?? "one_time_expense",
      essentialStatus: category?.essentialStatus ?? "mixed",
    };
  });
}

export async function getBudget() {
  const data = await loadFinanceData();
  const performance = calculateBudgetPerformance(
    data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      categoryType: category.categoryType,
      essentialStatus: category.essentialStatus,
      monthlyTarget: category.monthlyTarget,
      warningThreshold: category.warningThreshold,
    })),
    data.transactions.map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      excludedFromBudget: transaction.excludedFromBudget,
    })),
    25,
    31,
  );
  const totals = performance.reduce((result, category) => {
    result.budgeted += numeric(category.budgeted);
    result.actual += numeric(category.actual);
    return result;
  }, { budgeted: 0, actual: 0 });
  return {
    month: "August 2026",
    categories: performance,
    totals: {
      budgeted: totals.budgeted.toFixed(2),
      actual: totals.actual.toFixed(2),
      remaining: (totals.budgeted - totals.actual).toFixed(2),
      percentageUsed: totals.budgeted === 0 ? 0 : Number(((totals.actual / totals.budgeted) * 100).toFixed(1)),
    },
    notes: ["Transfers and credit-card payments are excluded from spending totals to avoid double counting.", "Refunds reduce category spend when categorized to the original category."],
  };
}

export async function getCashFlow() {
  const data = await loadFinanceData();
  const cashFlow = calculateCashFlowMetrics(transactionWithCategory(data));
  const reserve = calculateEmergencyReserve({
    essentialMonthlyExpenses: cents(data.reserve?.essentialMonthlyExpenses),
    targetMonths: data.reserve?.targetMonths ?? 3,
    currentAmount: cents(data.reserve?.currentAmount),
  });
  const health = calculateFinancialHealthScore({
    cashFlow: numeric(cashFlow.netCashFlow) > 0 ? 88 : 45,
    savingsConsistency: 84,
    emergencyReserve: Math.min(100, (reserve.monthsCovered / reserve.targetMonths) * 100),
    debtBurden: 82,
    budgetStability: 86,
    duplexProgress: 79,
    liquidity: 76,
    capitalRisk: 92,
    incomeStability: 90,
  });
  const asOf = calendarToday();
  const incomeDate = nextIncomeDate(data.income, asOf);
  const nextMonth = nextMonthPeriod(asOf);
  const nextMonthInflow = nextMonth
    ? data.income
      .filter((source) => source.active && hasPayDateInPeriod(source, nextMonth.start, nextMonth.end, asOf))
      .reduce((sum, source) => sum + numeric(source.expectedMonthly), 0)
    : 0;
  const nextMonthEssentialOutflow = data.categories
    .filter((category) => category.essentialStatus === "essential" && category.categoryType !== "income")
    .reduce((sum, category) => sum + numeric(category.monthlyTarget), 0);
  return {
    month: "August 2026",
    metrics: cashFlow,
    reserve,
    financialHealth: health,
    forecast: {
      nextMonthInflow: nextMonthInflow.toFixed(2),
      nextMonthEssentialOutflow: nextMonthEssentialOutflow.toFixed(2),
      nextMonthNet: (nextMonthInflow - nextMonthEssentialOutflow).toFixed(2),
      confidence: 86,
      nextIncomeDate: incomeDate,
    },
  };
}

export async function getSafeToDeploy() {
  const data = await loadFinanceData();
  const asOf = calendarToday();
  const incomeDate = nextIncomeDate(data.income, asOf);
  const liquid = data.capitalAccounts.filter((account) => ["checking", "savings", "money_market"].includes(account.accountType)).reduce((sum, account) => sum + cents(account.availableBalance ?? account.currentBalance), 0);
  const bills = data.bills
    .filter((bill) => !incomeDate || bill.dueDate < incomeDate)
    .reduce((sum, bill) => sum + cents(bill.expectedAmount), 0);
  const essential = data.categories.filter((category) => category.essentialStatus === "essential" && category.categoryType !== "income").reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
  const reserveTarget = cents(data.reserve?.essentialMonthlyExpenses) * (data.reserve?.targetMonths ?? 3);
  const reserveShortfall = Math.max(0, reserveTarget - cents(data.reserve?.currentAmount));
  const protectedCommitments = data.goalsRows.reduce((sum, goal) => sum + cents(goal.weeklyContribution) * 4, 0);
  const upcoming = data.expenses.filter((expense) => expense.required).reduce((sum, expense) => sum + Math.max(0, cents(expense.estimatedAmount) - cents(expense.fundedAmount)), 0);
  return calculateSafeToDeploy({
    liquidAvailableCash: liquid,
    billsDueBeforeNextIncome: bills,
    requiredMonthlyExpenses: essential,
    emergencyReserveShortfall: reserveShortfall,
    protectedGoalCommitments: protectedCommitments,
    knownUpcomingExpenses: upcoming,
    requiredSafetyBuffer: 1000 * 100,
    maximumDeployablePercentage: 0.25,
    dataConfidence: 86,
  });
}

export async function getFinanceInsights() {
  const data = await loadFinanceData();
  const transactions = transactionWithCategory(data);
  const subscriptions = data.recurring.filter((item) => item.essentialStatus === "discretionary");
  const anomalies = transactions.filter((transaction) => transaction.reviewStatus !== "approved");
  return {
    insights: [
      { type: "positive", title: "Savings rhythm is holding", description: "Protected and opportunity contributions are on their planned monthly pace.", severity: "low" },
      { type: "advisory", title: "Streaming bundle is discretionary", description: `${subscriptions[0]?.merchant ?? "One subscription"} costs ${subscriptions[0]?.annualCost ?? "0.00"} annually and can be reviewed without affecting essential coverage.`, severity: "low" },
      { type: anomalies.length ? "review" : "positive", title: anomalies.length ? "Review uncategorized activity" : "Ledger is reconciled", description: anomalies.length ? `${anomalies.length} transactions need a household review.` : "No duplicate or uncategorized transactions are in the current seed view.", severity: anomalies.length ? "medium" : "low" },
    ],
    subscriptions: subscriptions.map((item) => ({ merchant: item.merchant, monthlyAmount: item.averageAmount, annualCost: item.annualCost, essentialStatus: item.essentialStatus })),
    anomalyCount: anomalies.length,
  };
}

export async function getFinanceLists() {
  const data = await loadFinanceData();
  return {
    bills: data.bills,
    upcomingExpenses: data.expenses,
    incomeSources: data.income,
    recurring: data.recurring,
  };
}

export async function createManualFinancialAccount(actor: Actor, input: {
  institution: string;
  nickname: string;
  accountType: string;
  currentBalance?: string;
}) {
  assertPermission(actor.role, "contribute");
  const id = await householdId();
  let [connection] = await db.select().from(bankConnections).where(and(eq(bankConnections.householdId, id), eq(bankConnections.provider, "manual"))).limit(1);
  if (!connection) {
    [connection] = await db.insert(bankConnections).values({
      householdId: id,
      provider: "manual",
      status: "manual",
      institutionName: input.institution,
    }).returning();
  }
  const [account] = await db.insert(financialAccounts).values({
    householdId: id,
    bankConnectionId: connection.id,
    institution: input.institution,
    nickname: input.nickname,
    accountType: input.accountType as typeof financialAccounts.$inferInsert.accountType,
    currentBalance: input.currentBalance ?? "0.00",
    availableBalance: input.currentBalance ?? "0.00",
    connectionStatus: "manual",
    dataSource: "manual",
  }).returning();
  return accountVisibility(actor, account);
}

export async function importFinanceCsv(actor: Actor, accountId: string, csv: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId();
  const account = await db.select().from(financialAccounts).where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.householdId, id))).limit(1);
  if (!account[0]) throw new Error("Financial account was not found");
  const imported = csvImportBankingAdapter.importTransactions(csv);
  const existing = await db.select({ externalId: financeTransactions.externalId }).from(financeTransactions).where(eq(financeTransactions.accountId, accountId));
  const existingIds = new Set(existing.map((item) => item.externalId).filter((id): id is string => Boolean(id)));
  const deduplicated = deduplicateImportedTransactions(imported, existingIds);
  const fresh = deduplicated.fresh;
  if (fresh.length) {
    await db.insert(financeTransactions).values(fresh.map((item) => ({
      householdId: id,
      accountId,
      externalId: item.externalId,
      transactionDate: item.transactionDate,
      description: item.description,
      merchant: item.merchant,
      originalAmount: item.amount,
      amount: item.amount,
      dataSource: "csv_import" as const,
      reviewStatus: "needs_review" as const,
    })));
  }
  return { imported: fresh.length, skippedDuplicates: deduplicated.skippedDuplicates, readOnly: true };
}

export async function getFinanceSnapshot() {
  const id = await householdId();
  const [snapshot] = await db.select().from(financeSnapshots).where(and(eq(financeSnapshots.householdId, id), eq(financeSnapshots.snapshotDate, nowMonth() + "-01"))).limit(1);
  return snapshot ?? null;
}

export async function getFinanceSnapshots() {
  const id = await householdId();
  return db.select().from(financeSnapshots).where(eq(financeSnapshots.householdId, id));
}

export { getBankingStatus };