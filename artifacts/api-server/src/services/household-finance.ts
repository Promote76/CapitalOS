import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents,
  accounts,
  bankConnections,
  bankConnectionCredentials,
  bankSyncRuns,
  bankWebhookEvents,
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
import {
  BankingProviderError,
  csvImportBankingAdapter,
  getBankingStatus,
  getReadOnlyBankingProvider,
  type BankSyncSnapshot,
  type ProviderTransactionSnapshot,
} from "../adapters/banking";
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

function publicBankConnection(connection: typeof bankConnections.$inferSelect, credentialStored = false) {
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status,
    consentStatus: connection.consentStatus,
    institutionName: connection.institutionName,
    credentialStored,
    lastSuccessfulSync: connection.lastSuccessfulSync,
    lastSyncAttempt: connection.lastSyncAttempt,
    providerAsOf: connection.providerAsOf,
    reconciliationStatus: connection.reconciliationStatus,
    reconciliationDifference: connection.reconciliationDifference,
    errorMessage: connection.errorMessage,
  };
}

function providerReviewStatus(transaction: ProviderTransactionSnapshot) {
  if (transaction.reviewHint === "possible_duplicate") return "possible_duplicate" as const;
  if (transaction.reviewHint === "possible_transfer") return "possible_transfer" as const;
  if (transaction.reviewHint === "possible_business") return "possible_business" as const;
  if (transaction.reviewHint === "possible_property") return "possible_property" as const;
  return "needs_review" as const;
}

function parseProviderTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GovernanceError("INVALID_STATE", "The provider returned an invalid freshness timestamp");
  }
  return date;
}

function decimalCents(value: string) {
  const normalized = value.trim();
  if (!moneyPattern.test(normalized)) {
    throw new GovernanceError("INVALID_STATE", "The provider returned an invalid monetary value");
  }
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  const centsValue = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -centsValue : centsValue;
}

function centsToDecimal(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function syncErrorDetails(error: unknown) {
  if (error instanceof BankingProviderError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof GovernanceError) {
    return { code: "INVALID_RESPONSE", message: error.message };
  }
  return { code: "OUTAGE", message: "The bank provider could not be reached" };
}

export async function getFinancialAccounts(actor: Actor) {
  const id = await householdId(actor);
  const [rows, connections, credentials] = await Promise.all([
    db.select().from(financialAccounts).where(eq(financialAccounts.householdId, id)),
    db.select().from(bankConnections).where(eq(bankConnections.householdId, id)),
    db.select({ connectionId: bankConnectionCredentials.connectionId })
      .from(bankConnectionCredentials)
      .where(and(eq(bankConnectionCredentials.householdId, id), sql`${bankConnectionCredentials.revokedAt} is null`)),
  ]);
  const credentialConnectionIds = new Set(credentials.map((credential) => credential.connectionId));
  return {
    readOnly: true,
    accounts: rows.map((account) => accountVisibility(actor, account)),
    connections: connections.map((connection) => ({
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      consentStatus: connection.consentStatus,
      institutionName: connection.institutionName,
      credentialStored: credentialConnectionIds.has(connection.id),
      lastSuccessfulSync: connection.lastSuccessfulSync,
      lastSyncAttempt: connection.lastSyncAttempt,
      providerAsOf: connection.providerAsOf,
      reconciliationStatus: connection.reconciliationStatus,
      reconciliationDifference: connection.reconciliationDifference,
      errorMessage: connection.errorMessage,
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
  let score = 100;
  if (!data.capitalAccounts.length) score -= 45;
  if (!data.categories.length) score -= 25;
  if (!data.income.length) score -= 15;
  score -= staleAccounts * 10;
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

type TransactionReviewStatus = "approved" | "needs_review" | "excluded" | "possible_transfer" | "possible_business";
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
  if (!account[0]) throw new GovernanceError("INVALID_STATE", "Financial account was not found");
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

function reviewMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const review = (metadata as Record<string, unknown>).review;
  if (!review || typeof review !== "object" || Array.isArray(review)) return {};
  return review as Record<string, unknown>;
}

export async function reviewFinancialTransaction(actor: Actor, transactionId: string, input: {
  status: TransactionReviewStatus;
  categoryId?: string | null;
  note?: string | null;
}) {
  assertPermission(actor.role, "approve");
  const id = await householdId(actor);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`finance-review:${id}:${transactionId}`}, 0))`);
    const [transaction] = await tx.select().from(financeTransactions).where(and(
      eq(financeTransactions.id, transactionId),
      eq(financeTransactions.householdId, id),
    )).limit(1);
    if (!transaction) return planningNotFound("Financial transaction");

    const categoryId = input.categoryId !== undefined ? input.categoryId : transaction.categoryId;
    if (categoryId) {
      const [category] = await tx.select({ id: financeCategories.id })
        .from(financeCategories)
        .where(and(eq(financeCategories.id, categoryId), eq(financeCategories.householdId, id), eq(financeCategories.active, true)))
        .limit(1);
      if (!category) throw new GovernanceError("INVALID_STATE", "The selected category is not available in this household");
    }
    if (input.status === "approved" && !categoryId) {
      throw new GovernanceError("INVALID_STATE", "An approved transaction must have a household category");
    }
    const review = reviewMetadata(transaction.metadata);
    const existingNote = typeof review.note === "string" ? review.note : null;
    const nextNote = input.note === undefined ? existingNote : input.note;
    const nextExcluded = input.status !== "approved";
    if (
      transaction.reviewStatus === input.status &&
      transaction.categoryId === categoryId &&
      transaction.excludedFromBudget === nextExcluded &&
      existingNote === nextNote
    ) {
      const [account] = await tx.select({ nickname: financialAccounts.nickname })
        .from(financialAccounts)
        .where(and(eq(financialAccounts.id, transaction.accountId), eq(financialAccounts.householdId, id)))
        .limit(1);
      const [category] = categoryId
        ? await tx.select({ name: financeCategories.name })
          .from(financeCategories)
          .where(and(eq(financeCategories.id, categoryId), eq(financeCategories.householdId, id)))
          .limit(1)
        : [];
      return reviewedTransaction(transaction, account?.nickname ?? "Unknown account", category?.name ?? null);
    }

    const reviewedAt = new Date().toISOString();
    const nextMetadata = {
      ...(transaction.metadata ?? {}),
      review: {
        status: input.status,
        note: nextNote,
        reviewedBy: actor.userId,
        reviewedAt,
      },
    };
    const [updated] = await tx.update(financeTransactions).set({
      categoryId,
      reviewStatus: input.status,
      businessTag: input.status === "possible_business" ? "business" : input.status === "approved" ? "household" : transaction.businessTag,
      excludedFromBudget: nextExcluded,
      metadata: nextMetadata,
      updatedAt: new Date(),
    }).where(and(
      eq(financeTransactions.id, transactionId),
      eq(financeTransactions.householdId, id),
    )).returning();
    if (!updated) return planningNotFound("Imported transaction");
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "finance_transaction_reviewed",
      actor: actor.userId,
      entity: "finance_transaction",
      entityId: transactionId,
      reason: "Household review decision controls whether imported activity enters planning",
      beforeState: {
        reviewStatus: transaction.reviewStatus,
        categoryId: transaction.categoryId,
        excludedFromBudget: transaction.excludedFromBudget,
      },
      afterState: {
        reviewStatus: input.status,
        categoryId,
        excludedFromBudget: nextExcluded,
        note: nextNote,
      },
      metadata: { source: "household-finance-review", idempotent: false },
    });
    const [account] = await tx.select({ nickname: financialAccounts.nickname })
      .from(financialAccounts)
      .where(and(eq(financialAccounts.id, updated.accountId), eq(financialAccounts.householdId, id)))
      .limit(1);
    const [category] = updated.categoryId
      ? await tx.select({ name: financeCategories.name })
        .from(financeCategories)
        .where(and(eq(financeCategories.id, updated.categoryId), eq(financeCategories.householdId, id)))
        .limit(1)
      : [];
    return reviewedTransaction(updated, account?.nickname ?? "Unknown account", category?.name ?? null);
  });
}

export async function getTransactionReviewQueue(actor?: Actor) {
  const id = await householdId(actor);
  const [transactions, accounts, categories] = await Promise.all([
    db.select().from(financeTransactions).where(and(
      eq(financeTransactions.householdId, id),
      inArray(financeTransactions.dataSource, ["manual", "csv_import", "plaid"]),
      ne(financeTransactions.reviewStatus, "approved"),
    )),
    db.select({ id: financialAccounts.id, nickname: financialAccounts.nickname })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, id)),
    db.select({ id: financeCategories.id, name: financeCategories.name })
      .from(financeCategories)
      .where(and(eq(financeCategories.householdId, id), eq(financeCategories.active, true))),
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account.nickname]));
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  return {
    transactions: transactions.map((transaction) => reviewedTransaction(
      transaction,
      accountsById.get(transaction.accountId) ?? "Unknown account",
      transaction.categoryId ? categoriesById.get(transaction.categoryId) ?? null : null,
    )),
    categories,
  };
}

function reviewedTransaction(
  transaction: typeof financeTransactions.$inferSelect,
  accountName: string,
  categoryName: string | null,
) {
  const review = reviewMetadata(transaction.metadata);
  const reviewedAt = typeof review.reviewedAt === "string" ? review.reviewedAt : null;
  const reviewedBy = typeof review.reviewedBy === "string" ? review.reviewedBy : null;
  const reviewNote = typeof review.note === "string" ? review.note : null;
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
    merchant: transaction.merchant,
    amount: transaction.amount,
    originalAmount: transaction.originalAmount,
    categoryId: transaction.categoryId,
    categoryName,
    dataSource: transaction.dataSource,
    reviewStatus: transaction.reviewStatus,
    businessTag: transaction.businessTag,
    excludedFromBudget: transaction.excludedFromBudget,
    pending: transaction.pending,
    reviewNote,
    reviewedBy,
    reviewedAt,
  };
}

export type ReadOnlyBankConnectionInput = {
  provider: string;
  institutionName: string;
  providerConnectionRef: string;
  consent: boolean;
};

export async function createReadOnlyBankConnection(actor: Actor, input: ReadOnlyBankConnectionInput) {
  assertPermission(actor.role, "contribute");
  if (!input.consent) {
    throw new GovernanceError("FORBIDDEN", "A household must explicitly consent before a bank connection is created");
  }
  const provider = input.provider.trim().toLowerCase();
  const institutionName = input.institutionName.trim();
  const providerConnectionRef = input.providerConnectionRef.trim();
  if (!provider || provider.length > 80 || !institutionName || institutionName.length > 160 || !providerConnectionRef || providerConnectionRef.length > 240) {
    throw new GovernanceError("INVALID_STATE", "Provider, institution, and provider connection reference are required");
  }
  if (!getReadOnlyBankingProvider(provider)) {
    throw new GovernanceError("INVALID_STATE", "This banking provider is not configured for read-only synchronization");
  }
  const id = await householdId(actor);
  const credentialRef = `bank-vault:${randomUUID()}`;
  const grantedAt = new Date();
  return db.transaction(async (tx) => {
    const [connection] = await tx.insert(bankConnections).values({
      householdId: id,
      provider,
      status: "connected",
      consentStatus: "granted",
      consentGrantedAt: grantedAt,
      consentActor: actor.userId,
      institutionName,
      providerConnectionRef,
      reconciliationStatus: "not_run",
      lastSyncAttempt: null,
    }).returning();
    await tx.insert(bankConnectionCredentials).values({
      householdId: id,
      connectionId: connection.id,
      provider,
      credentialRef,
    });
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "bank_connection_consented",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      afterState: {
        provider,
        institutionName,
        consentStatus: "granted",
        credentialStoredServerSide: true,
        readOnly: true,
      },
      reason: "Household explicitly consented to read-only bank synchronization",
      metadata: { source: "household-bank-sync", credentialRefStored: true, credentialValueStored: false },
    });
    return publicBankConnection(connection, true);
  });
}

export async function listReadOnlyBankConnections(actor: Actor) {
  const id = await householdId(actor);
  const [connections, credentials] = await Promise.all([
    db.select().from(bankConnections).where(eq(bankConnections.householdId, id)),
    db.select({ connectionId: bankConnectionCredentials.connectionId })
      .from(bankConnectionCredentials)
      .where(and(eq(bankConnectionCredentials.householdId, id), sql`${bankConnectionCredentials.revokedAt} is null`)),
  ]);
  const credentialConnectionIds = new Set(credentials.map((credential) => credential.connectionId));
  return {
    readOnly: true,
    connections: connections.map((connection) => publicBankConnection(connection, credentialConnectionIds.has(connection.id))),
  };
}

export async function reauthorizeReadOnlyBankConnection(actor: Actor, connectionId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const replacementCredentialRef = `bank-vault:${randomUUID()}`;
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(bankConnections).where(and(
      eq(bankConnections.id, connectionId),
      eq(bankConnections.householdId, id),
      eq(bankConnections.consentStatus, "granted"),
    )).limit(1);
    if (!connection) throw new GovernanceError("INVALID_STATE", "Consented bank connection was not found");
    const [credential] = await tx.select().from(bankConnectionCredentials).where(and(
      eq(bankConnectionCredentials.connectionId, connection.id),
      eq(bankConnectionCredentials.householdId, id),
      sql`${bankConnectionCredentials.revokedAt} is null`,
    )).limit(1);
    const provider = getReadOnlyBankingProvider(connection.provider);
    if (!credential || !provider?.reauthorize) {
      throw new GovernanceError("INVALID_STATE", "This provider does not support credential reauthorization");
    }
    await provider.reauthorize({ credentialRef: credential.credentialRef, replacementCredentialRef });
    await tx.update(bankConnectionCredentials).set({ credentialRef: replacementCredentialRef }).where(and(
      eq(bankConnectionCredentials.id, credential.id),
      eq(bankConnectionCredentials.householdId, id),
    ));
    const [updated] = await tx.update(bankConnections).set({
      status: "connected",
      errorMessage: null,
      updatedAt: new Date(),
    }).where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id))).returning();
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "bank_connection_reauthorized",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      afterState: { credentialReferenceReplaced: true, consentStatus: "granted", readOnly: true },
      reason: "Household reauthorized the read-only provider connection",
      metadata: { source: "household-bank-sync", credentialValueStored: false },
    });
    return publicBankConnection(updated, true);
  });
}

export async function processReadOnlyBankWebhook(
  providerName: string,
  headers: Record<string, string | string[] | undefined>,
  body: Buffer,
) {
  const provider = getReadOnlyBankingProvider(providerName);
  if (!provider || (provider.delivery !== "webhook" && provider.delivery !== "polling_and_webhook") || !provider.verifyWebhook) {
    throw new GovernanceError("INVALID_STATE", "The approved webhook provider is not configured");
  }
  const notification = await provider.verifyWebhook({ headers, body });
  if (!notification.eventId || !notification.providerConnectionRef) {
    throw new GovernanceError("INVALID_STATE", "Verified provider webhook is missing its event or connection reference");
  }
  const connections = await db.select().from(bankConnections).where(and(
    eq(bankConnections.provider, providerName),
    eq(bankConnections.providerConnectionRef, notification.providerConnectionRef),
    eq(bankConnections.consentStatus, "granted"),
  )).limit(2);
  if (connections.length !== 1) {
    throw new GovernanceError("INVALID_STATE", "Webhook connection reference did not resolve to exactly one consented household");
  }
  const connection = connections[0];
  const [existing] = await db.select().from(bankWebhookEvents).where(and(
    eq(bankWebhookEvents.provider, providerName),
    eq(bankWebhookEvents.providerEventId, notification.eventId),
  )).limit(1);
  if (existing?.status === "completed" || existing?.status === "processing") {
    return { accepted: true, duplicate: true, eventId: notification.eventId };
  }
  if (existing) {
    await db.update(bankWebhookEvents).set({ status: "processing", errorMessage: null })
      .where(eq(bankWebhookEvents.id, existing.id));
  } else {
    const inserted = await db.insert(bankWebhookEvents).values({
      provider: providerName,
      providerEventId: notification.eventId,
      householdId: connection.householdId,
      connectionId: connection.id,
      status: "processing",
    }).onConflictDoNothing().returning({ id: bankWebhookEvents.id });
    if (!inserted.length) {
      return { accepted: true, duplicate: true, eventId: notification.eventId };
    }
  }
  try {
    const result = await syncReadOnlyBankConnection({
      userId: `bank-webhook:${providerName}`,
      householdId: connection.householdId,
      role: "owner",
      source: "provider-webhook",
    }, connection.id);
    if (!result.applied) {
      throw new Error(("errorMessage" in result ? result.errorMessage : null) ?? `Webhook sync ended in ${result.status}`);
    }
    await db.update(bankWebhookEvents).set({
      status: "completed",
      completedAt: new Date(),
      errorMessage: null,
    }).where(and(
      eq(bankWebhookEvents.provider, providerName),
      eq(bankWebhookEvents.providerEventId, notification.eventId),
      eq(bankWebhookEvents.householdId, connection.householdId),
    ));
    return { accepted: true, duplicate: false, eventId: notification.eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook synchronization failed";
    await db.update(bankWebhookEvents).set({ status: "failed", errorMessage: message }).where(and(
      eq(bankWebhookEvents.provider, providerName),
      eq(bankWebhookEvents.providerEventId, notification.eventId),
      eq(bankWebhookEvents.householdId, connection.householdId),
    ));
    throw error;
  }
}

export async function linkReadOnlyBankAccount(
  actor: Actor,
  connectionId: string,
  accountId: string,
  providerAccountRef: string,
) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const providerRef = providerAccountRef.trim();
  if (!providerRef || providerRef.length > 240) throw new GovernanceError("INVALID_STATE", "Provider account reference is required");
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(bankConnections).where(and(
      eq(bankConnections.id, connectionId),
      eq(bankConnections.householdId, id),
      eq(bankConnections.consentStatus, "granted"),
    )).limit(1);
    if (!connection) throw new GovernanceError("INVALID_STATE", "Consented bank connection was not found");
    const [account] = await tx.select().from(financialAccounts).where(and(
      eq(financialAccounts.id, accountId),
      eq(financialAccounts.householdId, id),
    )).limit(1);
    if (!account) throw new GovernanceError("INVALID_STATE", "Financial account was not found");
    if (account.bankConnectionId && account.bankConnectionId !== connection.id) {
      const [existingConnection] = await tx.select({ provider: bankConnections.provider }).from(bankConnections).where(and(
        eq(bankConnections.id, account.bankConnectionId),
        eq(bankConnections.householdId, id),
      )).limit(1);
      if (existingConnection?.provider !== "manual") {
        throw new GovernanceError("INVALID_STATE", "Financial account is already linked to another bank connection");
      }
    }
    const [duplicateProviderAccount] = await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(
      eq(financialAccounts.householdId, id),
      eq(financialAccounts.bankConnectionId, connection.id),
      eq(financialAccounts.providerAccountRef, providerRef),
      ne(financialAccounts.id, account.id),
    )).limit(1);
    if (duplicateProviderAccount) throw new GovernanceError("INVALID_STATE", "Provider account is already linked in this household");
    const [updated] = await tx.update(financialAccounts).set({
      bankConnectionId: connection.id,
      providerAccountRef: providerRef,
      connectionStatus: "connected",
      dataSource: "plaid",
      updatedAt: new Date(),
    }).where(and(eq(financialAccounts.id, account.id), eq(financialAccounts.householdId, id))).returning();
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "bank_account_linked",
      actor: actor.userId,
      entity: "financial_account",
      entityId: account.id,
      beforeState: { bankConnectionId: account.bankConnectionId, providerAccountRef: account.providerAccountRef },
      afterState: { bankConnectionId: connection.id, providerAccountRef: providerRef, readOnly: true },
      reason: "Household explicitly matched a provider account to a planning account",
      metadata: { source: "household-bank-sync" },
    });
    return accountVisibility(actor, updated);
  });
}

export async function revokeReadOnlyBankConnection(actor: Actor, connectionId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(bankConnections).where(and(
      eq(bankConnections.id, connectionId),
      eq(bankConnections.householdId, id),
    )).limit(1);
    if (!connection) throw new GovernanceError("INVALID_STATE", "Bank connection was not found");
    const revokedAt = new Date();
    const [updated] = await tx.update(bankConnections).set({
      consentStatus: "revoked",
      consentRevokedAt: revokedAt,
      consentActor: actor.userId,
      status: "disconnected",
      reconciliationStatus: "revoked",
      errorMessage: "Household consent was revoked",
      updatedAt: revokedAt,
    }).where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id))).returning();
    await tx.update(bankConnectionCredentials).set({ revokedAt }).where(and(
      eq(bankConnectionCredentials.connectionId, connection.id),
      eq(bankConnectionCredentials.householdId, id),
    ));
    await tx.update(financialAccounts).set({
      connectionStatus: "disconnected",
      updatedAt: revokedAt,
    }).where(and(
      eq(financialAccounts.bankConnectionId, connection.id),
      eq(financialAccounts.householdId, id),
    ));
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "bank_connection_revoked",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      beforeState: { consentStatus: connection.consentStatus, status: connection.status },
      afterState: { consentStatus: "revoked", status: "disconnected", credentialsRevoked: true },
      reason: "Household revoked read-only bank synchronization consent",
      metadata: { source: "household-bank-sync" },
    });
    return publicBankConnection(updated, false);
  });
}

export async function exportReadOnlyBankConnection(actor: Actor, connectionId: string) {
  const id = await householdId(actor);
  const [connection] = await db.select().from(bankConnections).where(and(
    eq(bankConnections.id, connectionId),
    eq(bankConnections.householdId, id),
  )).limit(1);
  if (!connection) throw new GovernanceError("INVALID_STATE", "Bank connection was not found");
  const accounts = await db.select().from(financialAccounts).where(and(
    eq(financialAccounts.bankConnectionId, connection.id),
    eq(financialAccounts.householdId, id),
  ));
  const accountIds = accounts.map((account) => account.id);
  const transactions = accountIds.length
    ? await db.select().from(financeTransactions).where(and(
      eq(financeTransactions.householdId, id),
      inArray(financeTransactions.accountId, accountIds),
      eq(financeTransactions.dataSource, "plaid"),
    ))
    : [];
  return {
    readOnly: true,
    connection: publicBankConnection(connection, false),
    accounts: accounts.map((account) => ({
      id: account.id,
      institution: account.institution,
      nickname: account.nickname,
      accountType: account.accountType,
      providerAccountRef: account.providerAccountRef,
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      externalId: transaction.externalId,
      transactionDate: transaction.transactionDate,
      description: transaction.description,
      merchant: transaction.merchant,
      amount: transaction.amount,
      pending: transaction.pending,
      reviewStatus: transaction.reviewStatus,
    })),
  };
}

export async function deleteReadOnlyBankConnectionData(actor: Actor, connectionId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  return db.transaction(async (tx) => {
    const [connection] = await tx.select().from(bankConnections).where(and(
      eq(bankConnections.id, connectionId),
      eq(bankConnections.householdId, id),
    )).limit(1);
    if (!connection) throw new GovernanceError("INVALID_STATE", "Bank connection was not found");
    const providerAccounts = await tx.select({ id: financialAccounts.id }).from(financialAccounts).where(and(
      eq(financialAccounts.bankConnectionId, connection.id),
      eq(financialAccounts.householdId, id),
      eq(financialAccounts.dataSource, "plaid"),
    ));
    const accountIds = providerAccounts.map((account) => account.id);
    if (accountIds.length) {
      await tx.delete(financeTransactions).where(and(
        eq(financeTransactions.householdId, id),
        inArray(financeTransactions.accountId, accountIds),
        eq(financeTransactions.dataSource, "plaid"),
      ));
      await tx.update(financialAccounts).set({
        bankConnectionId: null,
        providerAccountRef: null,
        connectionStatus: "manual",
        dataSource: "manual",
        updatedAt: new Date(),
      }).where(and(
        eq(financialAccounts.householdId, id),
        inArray(financialAccounts.id, accountIds),
      ));
    }
    await tx.insert(auditEvents).values({
      householdId: id,
      eventType: "bank_connection_data_deleted",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      beforeState: { provider: connection.provider, linkedAccountCount: accountIds.length },
      afterState: { providerDataDeleted: true, credentialsDeleted: true, accountLinksRemoved: accountIds.length },
      reason: "Household requested deletion of provider-derived bank data",
      metadata: { source: "household-bank-sync", rawCredentialsPersisted: false },
    });
    await tx.delete(bankConnectionCredentials).where(and(
      eq(bankConnectionCredentials.connectionId, connection.id),
      eq(bankConnectionCredentials.householdId, id),
    ));
    await tx.delete(bankConnections).where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id)));
    return { deleted: true, readOnly: true, connectionId: connection.id, unlinkedAccounts: accountIds.length };
  });
}

async function completeBankSyncRun(
  runId: string,
  input: {
    status: string;
    connectionStatus: "connected" | "delayed" | "error" | "needs_reauthentication" | "disconnected";
    reconciliationStatus: "matched" | "review" | "stale" | "outage" | "rate_limited" | "revoked";
    errorCode?: string | null;
    errorMessage?: string | null;
    reconciliationDifference?: string;
    providerAsOf?: Date | null;
    syncCursor?: string | null;
    counts?: Partial<Record<"insertedCount" | "updatedCount" | "duplicateCount" | "reviewCount" | "removedCount", number>>;
  },
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [run] = await tx.select({ connectionId: bankSyncRuns.connectionId })
      .from(bankSyncRuns)
      .where(eq(bankSyncRuns.id, runId))
      .limit(1);
    if (!run) return;
    await tx.update(bankSyncRuns).set({
      status: input.status,
      completedAt: now,
      providerAsOf: input.providerAsOf ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      reconciliationDifference: input.reconciliationDifference ?? "0.00",
      ...(input.counts ?? {}),
    }).where(eq(bankSyncRuns.id, runId));
    const connectionUpdates = {
      status: input.connectionStatus,
      reconciliationStatus: input.reconciliationStatus,
      reconciliationDifference: input.reconciliationDifference ?? "0.00",
      providerAsOf: input.providerAsOf ?? null,
      errorMessage: input.errorMessage ?? null,
      ...(input.syncCursor === undefined ? {} : { syncCursor: input.syncCursor }),
      updatedAt: now,
    };
    await tx.update(bankConnections).set(connectionUpdates).where(eq(bankConnections.id, run.connectionId));
  });
}

export async function syncReadOnlyBankConnection(actor: Actor, connectionId: string) {
  assertPermission(actor.role, "contribute");
  const id = await householdId(actor);
  const [connection] = await db.select().from(bankConnections).where(and(
    eq(bankConnections.id, connectionId),
    eq(bankConnections.householdId, id),
  )).limit(1);
  if (!connection) throw new GovernanceError("INVALID_STATE", "Bank connection was not found");
  const [credential] = await db.select().from(bankConnectionCredentials).where(and(
    eq(bankConnectionCredentials.connectionId, connection.id),
    eq(bankConnectionCredentials.householdId, id),
    sql`${bankConnectionCredentials.revokedAt} is null`,
  )).limit(1);
  const run = await db.insert(bankSyncRuns).values({
    householdId: id,
    connectionId: connection.id,
    status: "running",
  }).returning({ id: bankSyncRuns.id });
  const runId = run[0].id;
  const baseResult = {
    connectionId: connection.id,
    readOnly: true,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    reviewCount: 0,
    removed: 0,
    reconciliationDifference: "0.00",
  };
  if (connection.consentStatus !== "granted" || !credential) {
    await completeBankSyncRun(runId, {
      status: "revoked",
      connectionStatus: "disconnected",
      reconciliationStatus: "revoked",
      errorCode: "CONSENT_REQUIRED",
      errorMessage: "Read-only bank synchronization requires active household consent",
    });
    return { ...baseResult, status: "revoked" as const, applied: false, errorMessage: "Read-only bank synchronization requires active household consent" };
  }
  const provider = getReadOnlyBankingProvider(connection.provider);
  if (!provider || provider.readOnly !== true) {
    const errorMessage = "The approved read-only provider is not configured";
    await completeBankSyncRun(runId, {
      status: "outage",
      connectionStatus: "error",
      reconciliationStatus: "outage",
      errorCode: "OUTAGE",
      errorMessage,
    });
    return { ...baseResult, status: "outage" as const, applied: false, errorMessage };
  }
  await db.update(bankConnections).set({ status: "syncing", lastSyncAttempt: new Date(), updatedAt: new Date() })
    .where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id)));
  let snapshot: BankSyncSnapshot;
  try {
    snapshot = await provider.sync({ credentialRef: credential.credentialRef, cursor: connection.syncCursor ?? undefined });
  } catch (error) {
    const details = syncErrorDetails(error);
    const status = details.code === "RATE_LIMITED" ? "rate_limited" : details.code === "UNAUTHENTICATED" ? "revoked" : "outage";
    await completeBankSyncRun(runId, {
      status,
      connectionStatus: details.code === "UNAUTHENTICATED" ? "needs_reauthentication" : details.code === "RATE_LIMITED" ? "delayed" : "error",
      reconciliationStatus: details.code === "RATE_LIMITED" ? "rate_limited" : details.code === "UNAUTHENTICATED" ? "revoked" : "outage",
      errorCode: details.code,
      errorMessage: details.message,
    });
    return { ...baseResult, status: status as "rate_limited" | "revoked" | "outage", applied: false, errorMessage: details.message };
  }
  let providerAsOf: Date;
  try {
    providerAsOf = parseProviderTimestamp(snapshot.providerAsOf);
  } catch (error) {
    const details = syncErrorDetails(error);
    await completeBankSyncRun(runId, {
      status: "outage",
      connectionStatus: "error",
      reconciliationStatus: "outage",
      errorCode: details.code,
      errorMessage: details.message,
    });
    return { ...baseResult, status: "outage" as const, applied: false, errorMessage: details.message };
  }
  if (Date.now() - providerAsOf.getTime() > 36 * 60 * 60 * 1000) {
    const errorMessage = "Provider data is stale; no balances or transactions were applied";
    await completeBankSyncRun(runId, {
      status: "stale",
      connectionStatus: "delayed",
      reconciliationStatus: "stale",
      errorCode: "STALE_DATA",
      errorMessage,
      providerAsOf,
    });
    return { ...baseResult, status: "stale" as const, applied: false, errorMessage };
  }
  const localAccounts = await db.select().from(financialAccounts).where(and(
    eq(financialAccounts.householdId, id),
    eq(financialAccounts.bankConnectionId, connection.id),
  ));
  const localByProviderRef = new Map(localAccounts.filter((account) => account.providerAccountRef).map((account) => [account.providerAccountRef!, account]));
  const unmatched = snapshot.accounts.filter((account) => !localByProviderRef.has(account.providerAccountId));
  let providerTotal = 0n;
  let localTotal = 0n;
  for (const account of snapshot.accounts) providerTotal += decimalCents(account.currentBalance);
  for (const account of snapshot.accounts) localTotal += decimalCents(localByProviderRef.get(account.providerAccountId)?.currentBalance ?? "0");
  const difference = providerTotal - localTotal;
  if (unmatched.length || difference !== 0n || !snapshot.accounts.length) {
    const errorMessage = unmatched.length
      ? "Provider accounts require explicit household matching before synchronization"
      : "Provider balances do not reconcile with tracked account balances";
    const differenceText = centsToDecimal(difference);
    await completeBankSyncRun(runId, {
      status: "review",
      connectionStatus: "delayed",
      reconciliationStatus: "review",
      errorCode: unmatched.length ? "ACCOUNT_MATCH_REQUIRED" : "BALANCE_MISMATCH",
      errorMessage,
      reconciliationDifference: differenceText,
      providerAsOf,
    });
    return { ...baseResult, status: "review" as const, applied: false, reconciliationDifference: differenceText, errorMessage };
  }
  const result = { ...baseResult, status: "matched" as const, applied: true, providerAsOf };
  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      for (const providerAccount of snapshot.accounts) {
        const account = localByProviderRef.get(providerAccount.providerAccountId)!;
        await tx.update(financialAccounts).set({
          currentBalance: providerAccount.currentBalance,
          availableBalance: providerAccount.availableBalance ?? providerAccount.currentBalance,
          lastSync: now,
          lastSuccessfulSync: now,
          connectionStatus: "connected",
          updatedAt: now,
        }).where(and(eq(financialAccounts.id, account.id), eq(financialAccounts.householdId, id)));
      }
      for (const transaction of snapshot.transactions) {
        const account = localByProviderRef.get(transaction.providerAccountId);
        if (!account) throw new GovernanceError("INVALID_STATE", "Provider transaction references an unmatched account");
        assertDate(transaction.transactionDate, "Provider transaction date");
        decimalCents(transaction.amount);
        const reviewStatus = providerReviewStatus(transaction);
        const pending = transaction.pending ?? false;
        const existing = await tx.select().from(financeTransactions).where(and(
          eq(financeTransactions.householdId, id),
          eq(financeTransactions.accountId, account.id),
          eq(financeTransactions.externalId, transaction.providerTransactionId),
        )).limit(1);
        if (existing[0] && existing[0].dataSource !== "plaid") {
          result.duplicates += 1;
          result.reviewCount += 1;
          continue;
        }
        if (existing[0]) {
          await tx.update(financeTransactions).set({
            transactionDate: transaction.transactionDate,
            description: transaction.description,
            merchant: transaction.merchant ?? null,
            originalAmount: transaction.amount,
            amount: transaction.amount,
            pending,
            ...(existing[0].reviewStatus === "approved" ? {} : { reviewStatus }),
            metadata: { ...existing[0].metadata, bankSync: { provider: connection.provider, providerTransactionId: transaction.providerTransactionId, lastSeenAt: now.toISOString() } },
            updatedAt: now,
          }).where(and(eq(financeTransactions.id, existing[0].id), eq(financeTransactions.householdId, id)));
          result.updated += 1;
          if (existing[0].reviewStatus !== "approved") result.reviewCount += 1;
          continue;
        }
        await tx.insert(financeTransactions).values({
          householdId: id,
          accountId: account.id,
          externalId: transaction.providerTransactionId,
          transactionDate: transaction.transactionDate,
          description: transaction.description,
          merchant: transaction.merchant ?? null,
          originalAmount: transaction.amount,
          amount: transaction.amount,
          dataSource: "plaid",
          reviewStatus,
          pending,
          metadata: { bankSync: { provider: connection.provider, providerTransactionId: transaction.providerTransactionId, lastSeenAt: now.toISOString() } },
        });
        result.inserted += 1;
        result.reviewCount += 1;
      }
      if (snapshot.removedTransactionIds?.length) {
        const providerAccountIds = localAccounts.map((account) => account.id);
        const removed = await tx.delete(financeTransactions).where(and(
          eq(financeTransactions.householdId, id),
          eq(financeTransactions.dataSource, "plaid"),
          inArray(financeTransactions.accountId, providerAccountIds),
          inArray(financeTransactions.externalId, snapshot.removedTransactionIds),
        )).returning({ id: financeTransactions.id });
        result.removed += removed.length;
      }
      await tx.update(bankConnections).set({
        status: "connected",
        lastSuccessfulSync: now,
        lastBalanceRefresh: now,
        lastTransactionSync: now,
        providerAsOf,
        syncCursor: snapshot.cursor ?? connection.syncCursor ?? null,
        reconciliationStatus: "matched",
        reconciliationDifference: "0.00",
        errorMessage: null,
        updatedAt: now,
      }).where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id)));
      await tx.insert(auditEvents).values({
        householdId: id,
        eventType: "bank_connection_synced",
        actor: actor.userId,
        entity: "bank_connection",
        entityId: connection.id,
        afterState: { readOnly: true, inserted: result.inserted, updated: result.updated, duplicates: result.duplicates, reviewCount: result.reviewCount, removed: result.removed, reconciliationStatus: "matched" },
        reason: "Read-only provider snapshot passed freshness, account matching, and balance reconciliation gates",
        metadata: { source: "household-bank-sync", provider: connection.provider },
      });
    });
  } catch (error) {
    const details = syncErrorDetails(error);
    await completeBankSyncRun(runId, {
      status: "outage",
      connectionStatus: "error",
      reconciliationStatus: "outage",
      errorCode: details.code,
      errorMessage: details.message,
      providerAsOf,
    });
    return { ...baseResult, status: "outage" as const, applied: false, providerAsOf, errorMessage: details.message };
  }
  await completeBankSyncRun(runId, {
    status: "matched",
    connectionStatus: "connected",
    reconciliationStatus: "matched",
    providerAsOf,
    syncCursor: snapshot.cursor ?? connection.syncCursor ?? null,
    counts: {
      insertedCount: result.inserted,
      updatedCount: result.updated,
      duplicateCount: result.duplicates,
      reviewCount: result.reviewCount,
      removedCount: result.removed,
    },
  });
  return result;
}
