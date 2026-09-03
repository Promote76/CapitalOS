import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents,
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
import { assertPermission, GovernanceError } from "../domain/governance";
import { activeSecurityContext } from "../middleware/request-scope";

const numeric = (value: string | number | null | undefined) => Number(value ?? 0);
const cents = (value: string | number | null | undefined) => Math.round(numeric(value) * 100);
const nowMonth = () => new Date().toISOString().slice(0, 7);
const calendarToday = () => new Date().toISOString().slice(0, 10);
const validFinancialAccountTypes = new Set([
  "checking",
  "savings",
  "money_market",
  "credit_card",
  "loan",
  "mortgage",
  "brokerage",
  "retirement",
  "crypto",
  "business_checking",
  "protected_duplex",
  "opportunity_reserve",
  "other",
]);
const moneyPattern = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

async function householdId(actor?: Pick<Actor, "householdId">) {
  if (actor) return actor.householdId;
  const active = activeSecurityContext();
  if (active) return active.householdId;
  if (process.env.NODE_ENV === "production") {
    throw new GovernanceError("FORBIDDEN", "An authenticated household context is required for finance data");
  }
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

function assertMoney(value: string | undefined, label: string, { required = false } = {}) {
  if (value === undefined && !required) return;
  if (!value || !moneyPattern.test(value)) {
    throw new GovernanceError("INVALID_STATE", `${label} must be a valid amount with at most two decimal places`);
  }
}

function assertDate(value: string, label: string) {
  if (!datePattern.test(value)) throw new GovernanceError("INVALID_STATE", `${label} must use YYYY-MM-DD format`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GovernanceError("INVALID_STATE", `${label} is not a valid calendar date`);
  }
}

function hashImportIdentity(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `csv-${(hash >>> 0).toString(16)}`;
}

async function auditFinanceMutation(actor: Actor, eventType: string, entity: string, entityId: string, afterState?: Record<string, unknown>, beforeState?: Record<string, unknown>) {
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType,
    actor: actor.userId,
    entity,
    entityId,
    beforeState,
    afterState,
    reason: "Household finance planning record",
    metadata: { source: "household-finance", readOnlyExternal: true },
  });
}

export async function getFinancialAccounts(actor: Actor) {
  const id = await householdId(actor);
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

async function loadFinanceData(actor?: Pick<Actor, "householdId">) {
  const id = await householdId(actor);
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

function currentPeriod(asOf = calendarToday()) {
  const date = new Date(`${asOf}T00:00:00.000Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month + 1, 1));
  const end = endDate.toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysElapsed = Math.min(date.getUTCDate(), daysInMonth);
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
  return { start, end, daysInMonth, daysElapsed, label };
}

function currentPeriodTransactions(data: Awaited<ReturnType<typeof loadFinanceData>>, asOf = calendarToday()) {
  const period = currentPeriod(asOf);
  return data.transactions.filter((transaction) =>
    transaction.transactionDate >= period.start &&
    transaction.transactionDate < period.end &&
    transaction.reviewStatus === "approved"
  );
}

function financeDataConfidence(data: Awaited<ReturnType<typeof loadFinanceData>>) {
  const staleAccounts = data.capitalAccounts.filter((account) => {
    const lastSync = account.lastSuccessfulSync ?? account.lastSync;
    return !lastSync || Date.now() - lastSync.getTime() > 1000 * 60 * 60 * 24 * 45;
  }).length;
  const unreviewedTransactions = data.transactions.filter((transaction) => transaction.reviewStatus !== "approved").length;
  let score = 100;
  if (!data.capitalAccounts.length) score -= 45;
  if (!data.categories.length) score -= 25;
  if (!data.income.length) score -= 15;
  score -= staleAccounts * 10;
  score -= Math.min(unreviewedTransactions * 2, 20);
  return Math.max(0, Math.min(100, score));
}

function transactionWithCategory(
  data: Awaited<ReturnType<typeof loadFinanceData>>,
  transactions = data.transactions,
) {
  return transactions.map((transaction) => {
    const category = data.categories.find((item) => item.id === transaction.categoryId);
    return {
      ...transaction,
      categoryType: category?.categoryType ?? "one_time_expense",
      essentialStatus: category?.essentialStatus ?? "mixed",
    };
  });
}

export async function getBudget(actor?: Actor) {
  const data = await loadFinanceData(actor);
  const period = currentPeriod();
  const performance = calculateBudgetPerformance(
    data.categories.map((category) => ({
      id: category.id,
      name: category.name,
      categoryType: category.categoryType,
      essentialStatus: category.essentialStatus,
      monthlyTarget: category.monthlyTarget,
      warningThreshold: category.warningThreshold,
    })),
    currentPeriodTransactions(data).map((transaction) => ({
      id: transaction.id,
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      excludedFromBudget: transaction.excludedFromBudget,
    })),
    period.daysElapsed,
    period.daysInMonth,
  );
  const totals = performance.reduce((result, category) => {
    result.budgeted += numeric(category.budgeted);
    result.actual += numeric(category.actual);
    return result;
  }, { budgeted: 0, actual: 0 });
  return {
    month: period.label,
    categories: performance,
    totals: {
      budgeted: totals.budgeted.toFixed(2),
      actual: totals.actual.toFixed(2),
      remaining: (totals.budgeted - totals.actual).toFixed(2),
      percentageUsed: totals.budgeted === 0 ? 0 : Number(((totals.actual / totals.budgeted) * 100).toFixed(1)),
    },
    notes: [
      `Current period: ${period.start} through ${calendarToday()}.`,
      "Only approved user-entered or CSV-imported transactions affect budget totals; transfers and credit-card payments are excluded to avoid double counting.",
      "Imported rows remain reviewable until a household member approves them.",
    ],
  };
}

export async function getCashFlow(actor?: Actor) {
  const data = await loadFinanceData(actor);
  const periodTransactions = currentPeriodTransactions(data);
  const cashFlow = calculateCashFlowMetrics(transactionWithCategory(data, periodTransactions));
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
    month: currentPeriod().label,
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

export async function getSafeToDeploy(actor?: Actor) {
  const data = await loadFinanceData(actor);
  const asOf = calendarToday();
  const incomeDate = nextIncomeDate(data.income, asOf);
  const liquid = data.capitalAccounts.filter((account) => ["checking", "savings", "money_market"].includes(account.accountType)).reduce((sum, account) => sum + cents(account.availableBalance ?? account.currentBalance), 0);
  const bills = data.bills
    .filter((bill) => bill.active && (!incomeDate || bill.dueDate < incomeDate))
    .reduce((sum, bill) => sum + cents(bill.expectedAmount), 0);
  const essential = data.categories.filter((category) => category.essentialStatus === "essential" && category.categoryType !== "income").reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
  const reserveTarget = cents(data.reserve?.essentialMonthlyExpenses) * (data.reserve?.targetMonths ?? 3);
  const reserveShortfall = Math.max(0, reserveTarget - cents(data.reserve?.currentAmount));
  const protectedCommitments = data.goalsRows.reduce((sum, goal) => sum + cents(goal.weeklyContribution) * 4, 0);
  const upcoming = data.expenses.filter((expense) => expense.active && expense.required).reduce((sum, expense) => sum + Math.max(0, cents(expense.estimatedAmount) - cents(expense.fundedAmount)), 0);
  return calculateSafeToDeploy({
    liquidAvailableCash: liquid,
    billsDueBeforeNextIncome: bills,
    requiredMonthlyExpenses: essential,
    emergencyReserveShortfall: reserveShortfall,
    protectedGoalCommitments: protectedCommitments,
    knownUpcomingExpenses: upcoming,
    requiredSafetyBuffer: 1000 * 100,
    maximumDeployablePercentage: 0.25,
    dataConfidence: financeDataConfidence(data),
  });
}

export async function getFinanceInsights(actor?: Actor) {
  const data = await loadFinanceData(actor);
  const transactions = transactionWithCategory(data);
  const subscriptions = data.recurring.filter((item) => item.essentialStatus === "discretionary");
  const anomalies = transactions.filter((transaction) => transaction.reviewStatus !== "approved");
  return {
    insights: [
      { type: "positive", title: "Savings rhythm is holding", description: "Protected and opportunity contributions are on their planned monthly pace.", severity: "low" },
      { type: "advisory", title: "Streaming bundle is discretionary", description: `${subscriptions[0]?.merchant ?? "One subscription"} costs ${subscriptions[0]?.annualCost ?? "0.00"} annually and can be reviewed without affecting essential coverage.`, severity: "low" },
      { type: anomalies.length ? "review" : "positive", title: anomalies.length ? "Review imported activity" : "Ledger is reconciled", description: anomalies.length ? `${anomalies.length} transactions need a household review before they affect planning totals.` : "No unapproved transactions are waiting for household review.", severity: anomalies.length ? "medium" : "low" },
    ],
    subscriptions: subscriptions.map((item) => ({ merchant: item.merchant, monthlyAmount: item.averageAmount, annualCost: item.annualCost, essentialStatus: item.essentialStatus })),
    anomalyCount: anomalies.length,
  };
}

export async function getFinanceLists(actor?: Actor) {
  const data = await loadFinanceData(actor);
  return {
    bills: data.bills,
    upcomingExpenses: data.expenses,
    incomeSources: data.income,
    recurring: data.recurring,
  };
}

function planningNotFound(resource: string): never {
  throw new GovernanceError("INVALID_STATE", `${resource} was not found`);
}

export async function createBill(actor: Actor, input: {
  billName: string;
  dueDate: string;
  expectedAmount: string;
  status?: "upcoming" | "due_soon" | "paid" | "overdue" | "estimated" | "skipped";
  essential?: boolean;
  autoPay?: boolean;
}) {
  assertPermission(actor.role, "contribute");
  if (!input.billName.trim()) throw new GovernanceError("INVALID_STATE", "Bill name is required");
  assertDate(input.dueDate, "Bill due date");
  assertMoney(input.expectedAmount, "Bill amount", { required: true });
  const id = await householdId(actor);
  const [bill] = await db.insert(financeBills).values({
    householdId: id,
    billName: input.billName,
    dueDate: input.dueDate,
    expectedAmount: input.expectedAmount,
    status: input.status ?? "upcoming",
    essential: input.essential ?? true,
    autoPay: input.autoPay ?? false,
    active: true,
  }).returning();
  await auditFinanceMutation(actor, "finance_bill_created", "finance_bill", bill.id, { billName: bill.billName, expectedAmount: bill.expectedAmount });
  return bill;
}

export async function updateBill(actor: Actor, billId: string, input: {
  billName?: string;
  dueDate?: string;
  expectedAmount?: string;
  status?: "upcoming" | "due_soon" | "paid" | "overdue" | "estimated" | "skipped";
  essential?: boolean;
  autoPay?: boolean;
}) {
  assertPermission(actor.role, "contribute");
  if (input.dueDate) assertDate(input.dueDate, "Bill due date");
  if (input.expectedAmount !== undefined) assertMoney(input.expectedAmount, "Bill amount", { required: true });
  const id = await householdId(actor);
  const [bill] = await db.update(financeBills)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(financeBills.id, billId), eq(financeBills.householdId, id)))
    .returning();
  if (!bill) return planningNotFound("Bill");
  await auditFinanceMutation(actor, "finance_bill_updated", "finance_bill", bill.id, { ...input });
  return bill;
}

async function setBillActive(actor: Actor, billId: string, active: boolean) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [bill] = await db.update(financeBills)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(financeBills.id, billId), eq(financeBills.householdId, id)))
    .returning();
  if (!bill) return planningNotFound("Bill");
  await auditFinanceMutation(actor, active ? "finance_bill_resumed" : "finance_bill_paused", "finance_bill", bill.id, { active });
  return bill;
}

export const pauseBill = (actor: Actor, billId: string) => setBillActive(actor, billId, false);
export const resumeBill = (actor: Actor, billId: string) => setBillActive(actor, billId, true);

export async function deleteBill(actor: Actor, billId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [bill] = await db.delete(financeBills)
    .where(and(eq(financeBills.id, billId), eq(financeBills.householdId, id)))
    .returning({ id: financeBills.id });
  if (!bill) return planningNotFound("Bill");
  await auditFinanceMutation(actor, "finance_bill_deleted", "finance_bill", bill.id);
}

export async function createUpcomingExpense(actor: Actor, input: {
  name: string;
  estimatedAmount: string;
  expectedDate: string;
  priority?: "low" | "normal" | "high" | "critical";
  required?: boolean;
  fundedAmount?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!input.name.trim()) throw new GovernanceError("INVALID_STATE", "Expense name is required");
  assertDate(input.expectedDate, "Expense date");
  assertMoney(input.estimatedAmount, "Expense amount", { required: true });
  if (input.fundedAmount !== undefined) assertMoney(input.fundedAmount, "Funded amount", { required: true });
  const id = await householdId(actor);
  const [expense] = await db.insert(upcomingExpenses).values({
    householdId: id,
    name: input.name,
    estimatedAmount: input.estimatedAmount,
    expectedDate: input.expectedDate,
    priority: input.priority ?? "normal",
    required: input.required ?? false,
    fundedAmount: input.fundedAmount ?? "0.00",
    active: true,
  }).returning();
  await auditFinanceMutation(actor, "finance_expense_created", "upcoming_expense", expense.id, { name: expense.name, estimatedAmount: expense.estimatedAmount });
  return expense;
}

export async function updateUpcomingExpense(actor: Actor, expenseId: string, input: {
  name?: string;
  estimatedAmount?: string;
  expectedDate?: string;
  priority?: "low" | "normal" | "high" | "critical";
  required?: boolean;
  fundedAmount?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (input.expectedDate) assertDate(input.expectedDate, "Expense date");
  if (input.estimatedAmount !== undefined) assertMoney(input.estimatedAmount, "Expense amount", { required: true });
  if (input.fundedAmount !== undefined) assertMoney(input.fundedAmount, "Funded amount", { required: true });
  const id = await householdId(actor);
  const [expense] = await db.update(upcomingExpenses)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(upcomingExpenses.id, expenseId), eq(upcomingExpenses.householdId, id)))
    .returning();
  if (!expense) return planningNotFound("Upcoming expense");
  await auditFinanceMutation(actor, "finance_expense_updated", "upcoming_expense", expense.id, { ...input });
  return expense;
}

async function setUpcomingExpenseActive(actor: Actor, expenseId: string, active: boolean) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [expense] = await db.update(upcomingExpenses)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(upcomingExpenses.id, expenseId), eq(upcomingExpenses.householdId, id)))
    .returning();
  if (!expense) return planningNotFound("Upcoming expense");
  await auditFinanceMutation(actor, active ? "finance_expense_resumed" : "finance_expense_paused", "upcoming_expense", expense.id, { active });
  return expense;
}

export const pauseUpcomingExpense = (actor: Actor, expenseId: string) => setUpcomingExpenseActive(actor, expenseId, false);
export const resumeUpcomingExpense = (actor: Actor, expenseId: string) => setUpcomingExpenseActive(actor, expenseId, true);

export async function deleteUpcomingExpense(actor: Actor, expenseId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [expense] = await db.delete(upcomingExpenses)
    .where(and(eq(upcomingExpenses.id, expenseId), eq(upcomingExpenses.householdId, id)))
    .returning({ id: upcomingExpenses.id });
  if (!expense) planningNotFound("Upcoming expense");
  await auditFinanceMutation(actor, "finance_expense_deleted", "upcoming_expense", expense.id);
}

export async function createIncomeSource(actor: Actor, input: {
  name: string;
  sourceType: "employment" | "contract" | "business" | "rental" | "investment" | "interest" | "other";
  expectedMonthly: string;
  cadence: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  nextPayDate: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!input.name.trim()) throw new GovernanceError("INVALID_STATE", "Income source name is required");
  assertMoney(input.expectedMonthly, "Expected monthly income", { required: true });
  assertDate(input.nextPayDate, "Next pay date");
  const id = await householdId(actor);
  const [source] = await db.insert(incomeSources).values({
    householdId: id,
    name: input.name,
    sourceType: input.sourceType,
    expectedMonthly: input.expectedMonthly,
    cadence: input.cadence,
    nextPayDate: input.nextPayDate,
    active: true,
  }).returning();
  await auditFinanceMutation(actor, "finance_income_created", "income_source", source.id, { name: source.name, expectedMonthly: source.expectedMonthly });
  return source;
}

export async function updateIncomeSource(actor: Actor, incomeId: string, input: {
  name?: string;
  sourceType?: "employment" | "contract" | "business" | "rental" | "investment" | "interest" | "other";
  expectedMonthly?: string;
  cadence?: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
  nextPayDate?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (input.expectedMonthly !== undefined) assertMoney(input.expectedMonthly, "Expected monthly income", { required: true });
  if (input.nextPayDate) assertDate(input.nextPayDate, "Next pay date");
  const id = await householdId(actor);
  const [source] = await db.update(incomeSources)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(incomeSources.id, incomeId), eq(incomeSources.householdId, id)))
    .returning();
  if (!source) return planningNotFound("Income source");
  await auditFinanceMutation(actor, "finance_income_updated", "income_source", source.id, { ...input });
  return source;
}

async function setIncomeSourceActive(actor: Actor, incomeId: string, active: boolean) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [source] = await db.update(incomeSources)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(incomeSources.id, incomeId), eq(incomeSources.householdId, id)))
    .returning();
  if (!source) return planningNotFound("Income source");
  await auditFinanceMutation(actor, active ? "finance_income_resumed" : "finance_income_paused", "income_source", source.id, { active });
  return source;
}

export const pauseIncomeSource = (actor: Actor, incomeId: string) => setIncomeSourceActive(actor, incomeId, false);
export const resumeIncomeSource = (actor: Actor, incomeId: string) => setIncomeSourceActive(actor, incomeId, true);

export async function deleteIncomeSource(actor: Actor, incomeId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [source] = await db.delete(incomeSources)
    .where(and(eq(incomeSources.id, incomeId), eq(incomeSources.householdId, id)))
    .returning({ id: incomeSources.id });
  if (!source) planningNotFound("Income source");
  await auditFinanceMutation(actor, "finance_income_deleted", "income_source", source.id);
}

export async function createManualFinancialAccount(actor: Actor, input: {
  institution: string;
  nickname: string;
  accountType: string;
  currentBalance?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!input.institution.trim() || !input.nickname.trim()) {
    throw new GovernanceError("INVALID_STATE", "Institution and account nickname are required");
  }
  if (!validFinancialAccountTypes.has(input.accountType)) {
    throw new GovernanceError("INVALID_STATE", "Unsupported financial account type");
  }
  assertMoney(input.currentBalance, "Current balance");
  const id = await householdId(actor);
  const recordedAt = new Date();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`finance-manual-account:${id}`}, 0))`);
    let [connection] = await tx.select().from(bankConnections).where(and(eq(bankConnections.householdId, id), eq(bankConnections.provider, "manual"))).limit(1);
    if (!connection) {
      [connection] = await tx.insert(bankConnections).values({
        householdId: id,
        provider: "manual",
        status: "manual",
        institutionName: input.institution,
        lastSuccessfulSync: recordedAt,
        lastBalanceRefresh: recordedAt,
      }).returning();
    }
    const [account] = await tx.insert(financialAccounts).values({
      householdId: id,
      bankConnectionId: connection.id,
      institution: input.institution,
      nickname: input.nickname,
      accountType: input.accountType as typeof financialAccounts.$inferInsert.accountType,
      currentBalance: input.currentBalance ?? "0.00",
      availableBalance: input.currentBalance ?? "0.00",
      connectionStatus: "manual",
      dataSource: "manual",
      lastSync: recordedAt,
      lastSuccessfulSync: recordedAt,
    }).returning();
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "finance_account_created",
      actor: actor.userId,
      entity: "financial_account",
      entityId: account.id,
      afterState: {
        institution: account.institution,
        nickname: account.nickname,
        accountType: account.accountType,
        dataSource: account.dataSource,
      },
      reason: "Household finance planning record",
      metadata: { source: "household-finance", readOnlyExternal: true },
    });
    return accountVisibility(actor, account);
  });
}

export async function importFinanceCsv(actor: Actor, accountId: string, csv: string) {
  assertPermission(actor.role, "contribute");
  if (!csv.trim()) throw new GovernanceError("INVALID_STATE", "CSV content is required");
  const id = await householdId(actor);
  const account = await db.select().from(financialAccounts).where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.householdId, id))).limit(1);
  if (!account[0]) throw new Error("Financial account was not found");
  const imported = csvImportBankingAdapter.importTransactions(csv);
  if (!imported.length) throw new GovernanceError("INVALID_STATE", "CSV must include a header and at least one transaction row");
  const fallbackIdentityCounts = new Map<string, number>();
  const normalized = imported.map((item) => {
    const transactionDate = item.transactionDate?.trim();
    const description = item.description?.trim();
    const amount = item.amount?.trim();
    if (!transactionDate || !description || !amount) {
      throw new GovernanceError("INVALID_STATE", "Each CSV row requires date, description, and amount");
    }
    assertDate(transactionDate, "CSV transaction date");
    assertMoney(amount, "CSV transaction amount", { required: true });
    const merchant = item.merchant?.trim() || undefined;
    const fallbackIdentity = `${transactionDate}|${description}|${merchant ?? ""}|${amount}`;
    const fallbackOccurrence = (fallbackIdentityCounts.get(fallbackIdentity) ?? 0) + 1;
    fallbackIdentityCounts.set(fallbackIdentity, fallbackOccurrence);
    const externalId = item.externalId?.trim() || `${hashImportIdentity(fallbackIdentity)}-${fallbackOccurrence}`;
    return { ...item, transactionDate, description, amount, merchant, externalId };
  });

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`finance-import:${id}:${accountId}`}, 0))`);
    const existing = await tx.select({ externalId: financeTransactions.externalId }).from(financeTransactions).where(and(
      eq(financeTransactions.accountId, accountId),
      eq(financeTransactions.householdId, id),
    ));
    const existingIds = new Set(existing.map((item) => item.externalId).filter((value): value is string => Boolean(value)));
    const deduplicated = deduplicateImportedTransactions(normalized, existingIds);
    const fresh = deduplicated.fresh;
    if (fresh.length) {
      await tx.insert(financeTransactions).values(fresh.map((item) => ({
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
      const refreshedAt = new Date();
      await tx.update(financialAccounts).set({
        lastSync: refreshedAt,
        lastSuccessfulSync: refreshedAt,
        updatedAt: refreshedAt,
      }).where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.householdId, id)));
      await tx.update(bankConnections).set({
        lastTransactionSync: refreshedAt,
        lastSuccessfulSync: refreshedAt,
        updatedAt: refreshedAt,
      }).where(and(eq(bankConnections.id, account[0].bankConnectionId!), eq(bankConnections.householdId, id)));
    }
    const [audit] = fresh.length
      ? await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "finance_csv_imported",
        actor: actor.userId,
        entity: "financial_account",
        entityId: accountId,
        reason: "Imported rows require household review before planning use",
        metadata: { source: "csv_import", imported: fresh.length, skippedDuplicates: deduplicated.skippedDuplicates, readOnlyExternal: true },
      }).returning({ id: auditEvents.id })
      : [];
    void audit;
    return { imported: fresh.length, skippedDuplicates: deduplicated.skippedDuplicates, readOnly: true };
  });
}

export async function createManualFinanceTransaction(actor: Actor, accountId: string, input: {
  transactionDate: string;
  description: string;
  merchant?: string | null;
  amount: string;
  direction: "inflow" | "outflow";
}) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [account] = await db.select({ id: financialAccounts.id })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.id, accountId), eq(financialAccounts.householdId, id)))
    .limit(1);
  if (!account) return planningNotFound("Financial account");
  if (!input.description.trim()) {
    throw new GovernanceError("INVALID_STATE", "Transaction description is required");
  }
  assertDate(input.transactionDate, "Transaction date");
  assertMoney(input.amount, "Transaction amount", { required: true });
  if (cents(input.amount) === 0) {
    throw new GovernanceError("INVALID_STATE", "Transaction amount must be greater than zero");
  }
  const signedAmount = (input.direction === "outflow" ? -cents(input.amount) : cents(input.amount)) / 100;
  const amount = signedAmount.toFixed(2);
  const originalAmount = cents(input.amount).toFixed(2);
  const merchant = input.merchant?.trim() || null;

  return db.transaction(async (tx) => {
    const [transaction] = await tx.insert(financeTransactions).values({
      householdId: id,
      accountId,
      transactionDate: input.transactionDate,
      description: input.description.trim(),
      merchant,
      originalAmount,
      amount,
      dataSource: "manual",
      reviewStatus: "needs_review",
    }).returning({
      id: financeTransactions.id,
      accountId: financeTransactions.accountId,
      transactionDate: financeTransactions.transactionDate,
      description: financeTransactions.description,
      merchant: financeTransactions.merchant,
      originalAmount: financeTransactions.originalAmount,
      amount: financeTransactions.amount,
      dataSource: financeTransactions.dataSource,
      reviewStatus: financeTransactions.reviewStatus,
    });
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "finance_transaction_created",
      actor: actor.userId,
      entity: "finance_transaction",
      entityId: transaction.id,
      afterState: {
        accountId,
        transactionDate: transaction.transactionDate,
        amount: transaction.amount,
        dataSource: transaction.dataSource,
        reviewStatus: transaction.reviewStatus,
      },
      reason: "Manual household finance entry requires review before planning use",
      metadata: { source: "manual", readOnlyExternal: true },
    });
    return transaction;
  });
}

export async function getFinanceSnapshot(actor?: Actor) {
  const id = await householdId(actor);
  const [snapshot] = await db.select().from(financeSnapshots).where(and(eq(financeSnapshots.householdId, id), eq(financeSnapshots.snapshotDate, nowMonth() + "-01"))).limit(1);
  return snapshot ?? null;
}

export async function getFinanceSnapshots(actor?: Actor) {
  const id = await householdId(actor);
  return db.select().from(financeSnapshots).where(eq(financeSnapshots.householdId, id));
}

export { getBankingStatus };