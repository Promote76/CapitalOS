import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getApprovedFamilyOfficeResearchProjection } from "./family-office";
import {
  auditEvents,
  accounts,
  bankConnections,
  bankConnectionCredentials,
  bankSyncRuns,
  bankWebhookEvents,
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  emergencyReserves,
  financeBills,
  financeCategories,
  financeSnapshots,
  financeTransactions,
bankStatementTransactions,
bankStatementDocuments,
financialDocuments,
statementFinancialInclusions,
  financialAccounts,
  goals,
  incomeSources,
  idempotencyKeys,
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
  canonicalManualTransactionAmount,
  canViewFinancialBalance,
  deduplicateImportedTransactions,
  isExcludedFromHouseholdSpending,
  reviewedTransactionBudgetExclusion,
} from "../domain/household-finance";
import {
  BankingProviderError,
  csvImportBankingAdapter,
  getBankingStatus,
  getReadOnlyBankingProvider,
  normalizeImportedAmount,
  type BankSyncSnapshot,
  type ProviderTransactionSnapshot,
} from "../adapters/banking";
import { ensureSeedData } from "./seed";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import { activeSecurityContext } from "../middleware/request-scope";
import { appendAuditEvent } from "./audit";

const DEFAULT_FINANCE_CATEGORY_CATALOG = [
  { name: "Household income", categoryType: "income", essentialStatus: "essential" },
  { name: "Housing", categoryType: "fixed_expense", essentialStatus: "essential" },
  { name: "Food", categoryType: "variable_essential", essentialStatus: "essential" },
  { name: "Transportation", categoryType: "variable_essential", essentialStatus: "essential" },
  { name: "Utilities", categoryType: "fixed_expense", essentialStatus: "essential" },
  { name: "Insurance", categoryType: "fixed_expense", essentialStatus: "essential" },
  { name: "Healthcare", categoryType: "variable_essential", essentialStatus: "essential" },
  { name: "Childcare", categoryType: "variable_essential", essentialStatus: "essential" },
  { name: "Debt payment", categoryType: "debt_payment", essentialStatus: "essential" },
  { name: "Personal", categoryType: "variable_discretionary", essentialStatus: "discretionary" },
  { name: "Entertainment", categoryType: "variable_discretionary", essentialStatus: "discretionary" },
  { name: "Savings", categoryType: "savings", essentialStatus: "mixed" },
  { name: "Investments", categoryType: "investment", essentialStatus: "mixed" },
  { name: "Transfer", categoryType: "transfer", essentialStatus: "mixed" },
  { name: "Credit card payment", categoryType: "transfer", essentialStatus: "mixed" },
  { name: "Other", categoryType: "one_time_expense", essentialStatus: "mixed" },
] as const;

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

async function ensureDefaultFinanceCategories(id: string) {
  const defaultNames = DEFAULT_FINANCE_CATEGORY_CATALOG.map(({ name }) => name);
  const existing = await db.select({ name: financeCategories.name })
    .from(financeCategories)
    .where(and(
      eq(financeCategories.householdId, id),
      inArray(financeCategories.name, defaultNames),
    ));
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`finance-category-catalog:${id}`}, 0))`);
    if (existing.length !== DEFAULT_FINANCE_CATEGORY_CATALOG.length) {
      await tx.insert(financeCategories).values(
        DEFAULT_FINANCE_CATEGORY_CATALOG.map((category) => ({
          householdId: id,
          ...category,
          monthlyTarget: "0.00",
          warningThreshold: "1.00",
        })),
      ).onConflictDoNothing({
        target: [financeCategories.householdId, financeCategories.name],
      });
    }
    await tx.execute(sql`
      update finance_transactions as ft
      set
        transfer_group_id = coalesce(ft.transfer_group_id, 'legacy-transfer:' || ft.id::text),
        excluded_from_budget = true,
        updated_at = now()
      where ft.household_id = ${id}
        and (
          ft.external_id = 'seed-debt-aug'
          or exists (
            select 1
            from finance_categories as category
            where category.id = ft.category_id
              and category.household_id = ${id}
              and category.category_type = 'transfer'
          )
        )
        and (
          ft.transfer_group_id is null
          or ft.excluded_from_budget = false
        )
    `);
  });
}

function accountDataMode(account: typeof financialAccounts.$inferSelect, connection?: typeof bankConnections.$inferSelect, credentialPresent = false) {
  if (account.dataSource === "manual" || !connection || connection.provider === "manual") return "MANUAL";
  if (connection.provider === "simulated" || connection.provider === "test") return "SIMULATED_TEST_ONLY";
  // A label such as "Wells Fargo" is never evidence of a live connection.
  if (credentialPresent && connection.consentStatus === "granted" && ["connected", "healthy"].includes(connection.status)) return "LIVE_CONNECTED";
  return "STATEMENT_SUPPORTED";
}

function accountVisibility(actor: Actor, account: typeof financialAccounts.$inferSelect, connection?: typeof bankConnections.$inferSelect, credentialPresent = false) {
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
    dataMode: accountDataMode(account, connection, credentialPresent),
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
  await appendAuditEvent({
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
    accounts: rows.map((account) => {
      const connection = connections.find((candidate) => candidate.id === account.bankConnectionId);
      return accountVisibility(actor, account, connection, Boolean(connection && credentialConnectionIds.has(connection.id)));
    }),
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
  await ensureDefaultFinanceCategories(id);
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

type PlanningCategoryInput = {
  name: string;
  categoryType: "fixed_expense" | "variable_essential" | "variable_discretionary" | "savings" | "investment" | "debt_payment" | "transfer" | "income" | "one_time_expense";
  essentialStatus: "essential" | "discretionary" | "mixed";
  monthlyTarget: string;
  warningThreshold?: string;
  notes?: string | null;
};

function planningMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new GovernanceError("INVALID_STATE", "Planning month must use YYYY-MM");
  assertDate(`${month}-01`, "Planning month");
  return `${month}-01`;
}

function planningSnapshot(row: typeof budgetPlanningCategorySnapshots.$inferSelect) {
  return {
    id: row.id, sourceCategoryId: row.sourceCategoryId, name: row.name, categoryType: row.categoryType,
    essentialStatus: row.essentialStatus, monthlyTarget: row.monthlyTarget ?? "0.00", allocationBasisPoints: row.allocationBasisPoints,
    warningThreshold: row.warningThreshold,
    notes: row.notes, sortOrder: row.sortOrder, archived: row.archived,
  };
}

/** The approved household allocation taxonomy, expressed in basis points. */
export const WEEKLY_GUIDANCE_DEFAULT_ALLOCATION_BPS: Readonly<Record<string, number>> = Object.freeze({
  Housing: 3000, Food: 1200, Transportation: 1000, Utilities: 800, Insurance: 600,
  Healthcare: 500, Childcare: 500, "Debt payment": 800, Personal: 400,
  Entertainment: 300, Savings: 500, Investments: 300, Other: 100,
});

export function formatCents(value: number) {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Allocates cents with deterministic largest-remainder balancing in catalog-name order. */
export function allocateWeeklyGuidanceCents(incomeCents: number, categories: ReadonlyArray<{ id: string; categoryType: string; archived: boolean; allocationBasisPoints?: number | null }>) {
  const eligible = categories.filter((category) => !category.archived && !["income", "transfer"].includes(category.categoryType));
  const configured = eligible.filter((category) => Number.isInteger(category.allocationBasisPoints) && category.allocationBasisPoints! >= 0 && category.allocationBasisPoints! <= 10000);
  const templateTotal = configured.reduce((total, category) => total + category.allocationBasisPoints!, 0);
  const isCompleteTemplate = templateTotal === 10000 && configured.length === eligible.length;
  const allocations = new Map<string, number>();
  if (!isCompleteTemplate || incomeCents <= 0) return { allocations, isCompleteTemplate, templateTotal };
  const rows = configured.map((category) => {
    const numerator = incomeCents * category.allocationBasisPoints!;
    return { id: category.id, base: Math.floor(numerator / 10000), remainder: numerator % 10000 };
  });
  let remaining = incomeCents - rows.reduce((total, row) => total + row.base, 0);
  rows.sort((left, right) => right.remainder - left.remainder || left.id.localeCompare(right.id));
  for (const row of rows) allocations.set(row.id, row.base + (remaining-- > 0 ? 1 : 0));
  return { allocations, isCompleteTemplate, templateTotal };
}

function requireCompleteWeeklyAllocationTemplate(categories: ReadonlyArray<{ id: string; categoryType: string; archived: boolean; allocationBasisPoints?: number | null }>) {
  const template = allocateWeeklyGuidanceCents(1, categories);
  if (!template.isCompleteTemplate) {
    throw new GovernanceError("INVALID_STATE", "The weekly allocation template must include every active allocating category and total exactly 100.00% before approval");
  }
}

export function weeklyGuidanceCents(monthlyCents: number) {
  return Math.round((monthlyCents * 12) / 52);
}

/** Divides unspent monthly guidance over the remaining calendar weeks, never below zero. */
export function remainingWeeklyGuidanceCents(monthlyCents: number, actualCents: number, remainingCalendarWeeks: number) {
  if (remainingCalendarWeeks <= 0) return 0;
  return Math.round(Math.max(0, monthlyCents - actualCents) / remainingCalendarWeeks);
}

type WeeklyGuidanceRow = typeof financeTransactions.$inferSelect;
type WeeklyGuidanceCategory = typeof budgetPlanningCategorySnapshots.$inferSelect;

function weeklyGuidanceForRows(period: typeof budgetPlanningPeriods.$inferSelect, categories: WeeklyGuidanceCategory[], transactions: WeeklyGuidanceRow[]) {
  const calculationDate = calendarToday();
  const selectedMonth = period.month.slice(0, 7);
  const currentMonth = nowMonth();
  const daysInMonth = new Date(Date.UTC(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0)).getUTCDate();
  const elapsedDays = selectedMonth === currentMonth ? Math.min(daysInMonth, Math.max(1, Number(calculationDate.slice(8, 10)))) : selectedMonth < currentMonth ? daysInMonth : 0;
  const snapshotBySource = new Map(categories.filter((category) => !category.archived && category.sourceCategoryId).map((category) => [category.sourceCategoryId!, category]));
  const exclusionCounts: Record<string, number> = { pending: 0, unreviewed: 0, nonHousehold: 0, excluded: 0, transfer: 0, uncategorized: 0, nonIncome: 0 };
  let incomeCents = 0;
  let includedIncomeCount = 0;
  const actualCents = new Map<string, number>();
  let includedOutflowCount = 0;
  for (const transaction of transactions) {
    const category = transaction.categoryId ? snapshotBySource.get(transaction.categoryId) : undefined;
    const exclusionReason = weeklyGuidanceExclusionDecision(transaction, category).reason;
    if (exclusionReason) { exclusionCounts[exclusionReason]++; continue; }
    const amount = cents(transaction.amount);
    if (category!.categoryType === "income") {
      incomeCents += amount;
      includedIncomeCount++;
      continue;
    }
    if (amount !== 0) {
      actualCents.set(category!.id, (actualCents.get(category!.id) ?? 0) - amount);
      includedOutflowCount++;
    }
  }
  const allocation = allocateWeeklyGuidanceCents(incomeCents, categories);
  const available = incomeCents > 0 && allocation.isCompleteTemplate;
  const remainingCalendarWeeks = selectedMonth === currentMonth
    ? Math.ceil((daysInMonth - Number(calculationDate.slice(8, 10)) + 1) / 7)
    : selectedMonth > currentMonth ? Math.ceil(daysInMonth / 7) : 0;
  const categoryResponses = categories.filter((category) => !category.archived).map((category) => {
    const eligible = !category.archived && !["income", "transfer"].includes(category.categoryType);
    const actual = Math.max(0, actualCents.get(category.id) ?? 0);
    const monthly = available && eligible ? allocation.allocations.get(category.id)! : null;
    const prorated = monthly === null ? null : Math.round((monthly * elapsedDays) / daysInMonth);
    const reason = !eligible ? "INELIGIBLE_CATEGORY" : incomeCents <= 0 ? "VERIFIED_INCOME_UNAVAILABLE" : !allocation.isCompleteTemplate ? "TEMPLATE_INCOMPLETE_OR_CUSTOM_CATEGORY" : actual > prorated! ? "OVER_PRORATED_RECOMMENDATION" : "WITHIN_PRORATED_RECOMMENDATION";
    return {
      categoryId: category.id, allocationBasisPoints: eligible ? category.allocationBasisPoints : null,
      recommendedMonthly: monthly === null ? null : formatCents(monthly),
      recommendedWeekly: monthly === null ? null : formatCents(remainingWeeklyGuidanceCents(monthly, actual, remainingCalendarWeeks)),
      eligibleActualSpending: formatCents(actual), remainingRecommendedAmount: monthly === null ? null : formatCents(monthly - actual),
      status: !eligible ? "neutral" : !available || actual > prorated! ? "red" : "green", reason, eligible,
    };
  });
  const fingerprint = createHash("sha256").update(JSON.stringify({ period: period.id, version: period.version, calculationDate, incomeCents, elapsedDays, categories: categoryResponses, exclusions: exclusionCounts })).digest("hex");
  return { periodId: period.id, month: selectedMonth, calculationDate, basis: selectedMonth === currentMonth ? "current_month_as_of_calculation_date" : selectedMonth < currentMonth ? "historical_month" : "future_month", verifiedIncome: formatCents(incomeCents), includedIncomeCount, includedOutflowCount, exclusions: exclusionCounts, fingerprint, affectsOfficialTotals: false as const, categories: categoryResponses };
}

export async function getWeeklyBudgetGuidance(actor: Actor, periodId: string) {
  assertPermission(actor.role, "read");
  const [period] = await db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
  if (!period) return planningNotFound("Budget planning period");
  const categories = await db.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId)).orderBy(budgetPlanningCategorySnapshots.sortOrder);
  const transactions = await db.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, actor.householdId), sql`${financeTransactions.transactionDate} >= ${period.month} and ${financeTransactions.transactionDate} < (${period.month}::date + interval '1 month')::date`));
  return weeklyGuidanceForRows(period, categories, transactions);
}

export async function acceptWeeklyBudgetGuidance(actor: Actor, periodId: string, input: { version: number; categoryIds: string[]; recommendationFingerprint: string }, idempotencyKey: string) {
  assertPermission(actor.role, "approve");
  if (!idempotencyKey?.trim()) throw new GovernanceError("INVALID_STATE", "Idempotency-Key is required");
  const normalizedIds = [...new Set(input.categoryIds)].sort();
  if (normalizedIds.length !== input.categoryIds.length) throw new GovernanceError("INVALID_STATE", "Category IDs must not contain duplicates");
  const idempotencyInput = { periodId, version: input.version, categoryIds: normalizedIds, recommendationFingerprint: input.recommendationFingerprint };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-weekly-guidance:${actor.householdId}:${periodId}`}, 0))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-weekly-guidance-idempotency:${actor.householdId}:${idempotencyKey}`}, 0))`);
    const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, idempotencyKey)));
    if (existing) {
      const stored = existing.responseBody;
      if (existing.operation !== "budget_weekly_guidance_accept" || !stored || stored.fingerprint !== JSON.stringify(idempotencyInput)) {
        throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used with different weekly guidance input");
      }
      return stored.response as { periodId: string; version: number; acceptedCategoryIds: string[]; targets: Record<string, string>; affectsOfficialTotals: false };
    }
    const [period] = await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
    if (!period) return planningNotFound("Budget planning period");
    if (period.status !== "draft") throw new GovernanceError("CONFLICT", "Closed or approved planning periods are immutable");
    if (period.version !== input.version) throw new GovernanceError("CONFLICT", "Planning period version is stale; refresh and retry");
    const categories = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId)).orderBy(budgetPlanningCategorySnapshots.sortOrder);
    const transactions = await tx.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, actor.householdId), sql`${financeTransactions.transactionDate} >= ${period.month} and ${financeTransactions.transactionDate} < (${period.month}::date + interval '1 month')::date`));
    const guidance = weeklyGuidanceForRows(period, categories, transactions);
    if (guidance.fingerprint !== input.recommendationFingerprint) throw new GovernanceError("CONFLICT", "Weekly guidance is stale; refresh and retry");
    if (guidance.verifiedIncome === "0.00") throw new GovernanceError("CONFLICT", "Weekly guidance cannot be accepted without verified income");
    const selected = guidance.categories.filter((category) => normalizedIds.includes(category.categoryId));
    if (selected.length !== normalizedIds.length || selected.some((category) => !category.eligible || category.recommendedMonthly === null)) {
      throw new GovernanceError("INVALID_STATE", "Only currently eligible recommended categories can be accepted");
    }
    const targets: Record<string, string> = {};
    for (const recommendation of selected) {
      const snapshot = categories.find((category) => category.id === recommendation.categoryId);
      if (!snapshot || recommendation.recommendedMonthly === null) throw new GovernanceError("INVALID_STATE", "Weekly guidance category is unavailable");
      targets[recommendation.categoryId] = recommendation.recommendedMonthly;
      await tx.update(budgetPlanningCategorySnapshots).set({ monthlyTarget: recommendation.recommendedMonthly, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(budgetPlanningCategorySnapshots.id, snapshot.id));
    }
    const [updatedPeriod] = await tx.update(budgetPlanningPeriods).set({ version: period.version + 1, updatedAt: new Date() }).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.version, period.version), eq(budgetPlanningPeriods.status, "draft"))).returning();
    if (!updatedPeriod) throw new GovernanceError("CONFLICT", "Planning period is stale or no longer a draft");
    const response = { periodId, version: updatedPeriod.version, acceptedCategoryIds: normalizedIds, targets, affectsOfficialTotals: false as const };
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_weekly_guidance_accepted", actor: actor.userId, entity: "budget_planning_period", entityId: periodId, beforeState: Object.fromEntries(categories.filter((category) => normalizedIds.includes(category.id)).map((category) => [category.id, category.monthlyTarget])), afterState: { ...response, basis: guidance.basis, calculationDate: guidance.calculationDate, verifiedIncome: guidance.verifiedIncome, includedIncomeCount: guidance.includedIncomeCount, includedOutflowCount: guidance.includedOutflowCount, exclusions: guidance.exclusions, recommendationFingerprint: guidance.fingerprint }, reason: "Owner accepted advisory weekly guidance into draft targets" }, tx);
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key: idempotencyKey, operation: "budget_weekly_guidance_accept", responseStatus: 200, responseBody: { fingerprint: JSON.stringify(idempotencyInput), response } });
    return response;
  });
}

export async function updateWeeklyBudgetAllocations(actor: Actor, periodId: string, input: { version: number; allocations: Array<{ categoryId: string; basisPoints: number }> }) {
  assertPermission(actor.role, "approve");
  const ids = input.allocations.map((allocation) => allocation.categoryId);
  if (new Set(ids).size !== ids.length) throw new GovernanceError("INVALID_STATE", "Each allocating category must appear exactly once; duplicate category IDs are not allowed");
  if (input.allocations.some((allocation) => !Number.isInteger(allocation.basisPoints) || allocation.basisPoints < 0 || allocation.basisPoints > 10000)) {
    throw new GovernanceError("INVALID_STATE", "Allocation percentages must be whole basis points between 0 and 10000");
  }
  if (input.allocations.reduce((sum, allocation) => sum + allocation.basisPoints, 0) !== 10000) {
    throw new GovernanceError("INVALID_STATE", "Eligible allocations must total exactly 100.00%");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-allocation-template:${actor.householdId}:${periodId}`}, 0))`);
    const [period] = await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
    if (!period) return planningNotFound("Budget planning period");
    if (period.status !== "draft") throw new GovernanceError("CONFLICT", "Closed or approved planning periods are immutable");
    if (period.version !== input.version) throw new GovernanceError("CONFLICT", "Planning period version is stale; refresh and retry");
    const categories = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId));
    const eligible = categories.filter((category) => !category.archived && !["income", "transfer"].includes(category.categoryType));
    const eligibleIds = new Set(eligible.map((category) => category.id));
    const unknown = ids.filter((id) => !eligibleIds.has(id));
    const missing = eligible.filter((category) => !ids.includes(category.id));
    if (unknown.length || missing.length || input.allocations.length !== eligible.length) {
      throw new GovernanceError("INVALID_STATE", "Allocations must include every active allocating category exactly once; income, transfers, credit-card payments, archived, and unknown categories are not allowed");
    }
    const beforeState = Object.fromEntries(eligible.map((category) => [category.id, category.allocationBasisPoints]));
    for (const allocation of input.allocations) {
      await tx.update(budgetPlanningCategorySnapshots).set({ allocationBasisPoints: allocation.basisPoints, updatedBy: actor.userId, updatedAt: new Date() })
        .where(and(eq(budgetPlanningCategorySnapshots.id, allocation.categoryId), eq(budgetPlanningCategorySnapshots.periodId, periodId), eq(budgetPlanningCategorySnapshots.householdId, actor.householdId)));
    }
    const [updatedPeriod] = await tx.update(budgetPlanningPeriods).set({ version: period.version + 1, updatedAt: new Date() })
      .where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.version, period.version), eq(budgetPlanningPeriods.status, "draft"))).returning();
    if (!updatedPeriod) throw new GovernanceError("CONFLICT", "Planning period is stale or no longer a draft");
    const allocations = Object.fromEntries(input.allocations.map((allocation) => [allocation.categoryId, allocation.basisPoints]));
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_weekly_allocation_template_updated", actor: actor.userId, entity: "budget_planning_period", entityId: periodId, beforeState, afterState: { version: updatedPeriod.version, allocations, totalBasisPoints: 10000 }, reason: "Owner updated the household weekly allocation template for a draft period" }, tx);
    return { periodId, version: updatedPeriod.version, totalBasisPoints: 10000, allocations };
  });
}

type FinalizedPlanningPeriod = { month: string; status: string; createdAt?: Date | string | null };

function finalizedPlanningCreatedAt(period: FinalizedPlanningPeriod) {
  if (!period.createdAt) return 0;
  const value = period.createdAt instanceof Date ? period.createdAt.getTime() : Date.parse(period.createdAt);
  return Number.isFinite(value) ? value : 0;
}

/** Selects exactly one canonical finalized decision per month: the newest created finalized version. */
export function canonicalFinalizedPlanningPeriods<T extends FinalizedPlanningPeriod>(periods: T[]) {
  const byMonth = new Map<string, T>();
  for (const period of periods) {
    if (!["approved", "closed"].includes(period.status)) continue;
    const current = byMonth.get(period.month);
    if (!current || finalizedPlanningCreatedAt(period) > finalizedPlanningCreatedAt(current)) byMonth.set(period.month, period);
  }
  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month));
}

/** Pure selection rule shared by planning bootstraps and regression tests. */
export function latestFinalizedPlanningPeriod<T extends FinalizedPlanningPeriod>(periods: T[], targetMonth: string) {
  return canonicalFinalizedPlanningPeriods(periods)
    .filter((period) => period.month < targetMonth)
    .sort((left, right) => right.month.localeCompare(left.month))[0] ?? null;
}

async function bootstrapPlanningPeriod(actor: Actor, month: string, supersedesPeriodId?: string) {
  const household = await householdId(actor);
  const monthDate = planningMonth(month);
  return db.transaction((tx) => bootstrapPlanningPeriodInTransaction(tx, actor, household, monthDate, supersedesPeriodId));
}

async function bootstrapPlanningPeriodInTransaction(tx: any, actor: Actor, household: string, monthDate: string, supersedesPeriodId?: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-plan:${household}:${monthDate}`}, 0))`);
    const [existing] = await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.householdId, household), eq(budgetPlanningPeriods.month, monthDate), eq(budgetPlanningPeriods.status, "draft")));
    if (existing) {
      if (supersedesPeriodId && existing.supersedesPeriodId !== supersedesPeriodId) throw new GovernanceError("CONFLICT", "This month already has a different draft; review it before creating another correction");
      return { period: existing, created: false, source: "existing" as const };
    }
    assertPermission(actor.role, "contribute");
    if (!supersedesPeriodId) {
      const [sameMonthFinalized] = await tx.select({ id: budgetPlanningPeriods.id }).from(budgetPlanningPeriods)
        .where(and(eq(budgetPlanningPeriods.householdId, household), eq(budgetPlanningPeriods.month, monthDate), inArray(budgetPlanningPeriods.status, ["approved", "closed"]))).limit(1);
      if (sameMonthFinalized) throw new GovernanceError("CONFLICT", "This month already has a finalized plan; create a superseding correction draft instead");
    }
    const prior = supersedesPeriodId
      ? await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, supersedesPeriodId), eq(budgetPlanningPeriods.householdId, household), eq(budgetPlanningPeriods.month, monthDate), inArray(budgetPlanningPeriods.status, ["approved", "closed"]))).limit(1)
      : await tx.select().from(budgetPlanningPeriods)
        .where(and(eq(budgetPlanningPeriods.householdId, household), inArray(budgetPlanningPeriods.status, ["approved", "closed"]), sql`${budgetPlanningPeriods.month} < ${monthDate}`))
        .orderBy(desc(budgetPlanningPeriods.month), desc(budgetPlanningPeriods.createdAt)).limit(1);
    if (supersedesPeriodId && !prior[0]) throw new GovernanceError("INVALID_STATE", "Only an approved or closed plan for this month can be superseded");
    const [period] = await tx.insert(budgetPlanningPeriods).values({ householdId: household, month: monthDate, createdBy: actor.userId, copiedFromPeriodId: prior[0]?.id, supersedesPeriodId: supersedesPeriodId ?? null }).returning();
    let source: "taxonomy" | "prior_finalized" | "empty" = "empty";
    if (prior[0]) {
      const sources = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, prior[0].id));
      if (sources.length) {
        source = "prior_finalized";
        await tx.insert(budgetPlanningCategorySnapshots).values(sources.map((source: typeof budgetPlanningCategorySnapshots.$inferSelect, sortOrder: number) => ({
        householdId: household, periodId: period.id, sourceCategoryId: source.sourceCategoryId, name: source.name, categoryType: source.categoryType, essentialStatus: source.essentialStatus, monthlyTarget: source.monthlyTarget, allocationBasisPoints: source.allocationBasisPoints, warningThreshold: source.warningThreshold, notes: source.notes, sortOrder, archived: source.archived, createdBy: actor.userId, updatedBy: actor.userId,
        })));
      }
    } else {
      const sources = await tx.select().from(financeCategories).where(eq(financeCategories.householdId, household));
      if (sources.length) {
        source = "taxonomy";
        await tx.insert(budgetPlanningCategorySnapshots).values(sources.map((source: typeof financeCategories.$inferSelect, sortOrder: number) => ({
        householdId: household, periodId: period.id, sourceCategoryId: source.id, name: source.name, categoryType: source.categoryType, essentialStatus: source.essentialStatus, monthlyTarget: source.monthlyTarget, allocationBasisPoints: ["income", "transfer"].includes(source.categoryType) ? null : WEEKLY_GUIDANCE_DEFAULT_ALLOCATION_BPS[source.name] ?? null, warningThreshold: source.warningThreshold, sortOrder, archived: !source.active, createdBy: actor.userId, updatedBy: actor.userId,
        })));
      }
    }
    await appendAuditEvent({
      householdId: household,
      eventType: supersedesPeriodId ? "budget_plan_superseding_draft_created" : source === "prior_finalized" ? "budget_plan_copied_forward" : "budget_plan_created",
      actor: actor.userId,
      entity: "budget_planning_period",
      entityId: period.id,
      afterState: { month: monthDate.slice(0, 7), source, copiedFromPeriodId: prior[0]?.id ?? null, supersedesPeriodId: supersedesPeriodId ?? null },
      reason: supersedesPeriodId ? "Reviewable correction draft created without changing the approved plan" : source === "prior_finalized" ? "Planning period copied from latest finalized plan" : "Planning period created from current finance taxonomy",
    }, tx);
    return { period, created: true, source };
}

export async function findBudgetPlanningPeriod(actor: Actor, month = nowMonth()) {
  assertPermission(actor.role, "read");
  const monthDate = planningMonth(month);
  const [period] = await db.select().from(budgetPlanningPeriods)
    .where(and(eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.month, monthDate)))
    .orderBy(sql`case when ${budgetPlanningPeriods.status} = 'draft' then 0 else 1 end`, desc(budgetPlanningPeriods.createdAt)).limit(1);
  if (!period) return null;
  const categories = await db.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, period.id)).orderBy(budgetPlanningCategorySnapshots.sortOrder);
  const transactions = await db.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, actor.householdId), sql`${financeTransactions.transactionDate} >= ${period.month} and ${financeTransactions.transactionDate} < (${period.month}::date + interval '1 month')::date`));
  const advisoryActual = transactions.filter((transaction) => transaction.reviewStatus === "approved" && !transaction.pending && transaction.businessTag === "household" && !isExcludedFromHouseholdSpending(transaction))
    .reduce((sum, transaction) => sum + numeric(transaction.amount), 0);
  const advisoryTarget = categories.filter((category) => !category.archived && !["income", "transfer"].includes(category.categoryType)).reduce((sum, category) => sum + numeric(category.monthlyTarget), 0);
  return { id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, copiedFromPeriodId: period.copiedFromPeriodId, supersedesPeriodId: period.supersedesPeriodId, createdBy: period.createdBy, createdAt: period.createdAt, updatedAt: period.updatedAt, approvedAt: period.approvedAt, approvedBy: period.approvedBy, closedAt: period.closedAt, closedBy: period.closedBy, categories: categories.map(planningSnapshot), advisory: { projectedExpenseTarget: advisoryTarget.toFixed(2), reviewedHouseholdNetActivity: advisoryActual.toFixed(2), affectsOfficialTotals: false } };
}

export async function getBudgetPlanningPeriod(actor: Actor, month = nowMonth()) {
  const existing = await findBudgetPlanningPeriod(actor, month);
  if (existing) return existing;
  const { period } = await bootstrapPlanningPeriod(actor, month);
  const created = await findBudgetPlanningPeriod(actor, period.month.slice(0, 7));
  if (!created) throw new GovernanceError("INVALID_STATE", "Budget planning period could not be loaded after creation");
  return created;
}

export async function createBudgetPlanningPeriod(actor: Actor, month: string) {
  const { period } = await bootstrapPlanningPeriod(actor, month);
  return getBudgetPlanningPeriod(actor, period.month.slice(0, 7));
}

export async function createSupersedingBudgetPlanningPeriod(actor: Actor, periodId: string, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  return planningIdempotency(actor, idempotencyKey, "budget_plan_supersede", async (tx) => {
    const [requested] = await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
    if (!requested) return planningNotFound("Budget planning period");
    const [canonical] = await tx.select({ id: budgetPlanningPeriods.id }).from(budgetPlanningPeriods)
      .where(and(eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.month, requested.month), inArray(budgetPlanningPeriods.status, ["approved", "closed"])))
      .orderBy(desc(budgetPlanningPeriods.createdAt)).limit(1);
    if (!canonical || canonical.id !== requested.id) throw new GovernanceError("CONFLICT", "Only the current canonical finalized plan can be superseded");
    const { period } = await bootstrapPlanningPeriodInTransaction(tx, actor, actor.householdId, requested.month, requested.id);
    const categories = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, period.id)).orderBy(budgetPlanningCategorySnapshots.sortOrder);
    return { id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, copiedFromPeriodId: period.copiedFromPeriodId, supersedesPeriodId: period.supersedesPeriodId, createdBy: period.createdBy, createdAt: period.createdAt, updatedAt: period.updatedAt, approvedAt: period.approvedAt, approvedBy: period.approvedBy, closedAt: period.closedAt, closedBy: period.closedBy, categories: categories.map(planningSnapshot) };
  });
}

async function requireDraftVersion(actor: Actor, periodId: string, version: number) {
  const [period] = await db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
  if (!period) return planningNotFound("Budget planning period");
  if (period.status !== "draft") throw new GovernanceError("CONFLICT", "Closed or approved planning periods are immutable");
  if (period.version !== version) throw new GovernanceError("CONFLICT", "Planning period version is stale; refresh and retry");
  return period;
}

export async function createBudgetPlanningCategory(actor: Actor, periodId: string, version: number, input: PlanningCategoryInput) {
  assertPermission(actor.role, "contribute"); assertMoney(input.monthlyTarget, "Monthly target", { required: true });
  const [category] = await db.transaction(async (tx) => {
    const [period] = await tx.update(budgetPlanningPeriods).set({ version: version + 1, updatedAt: new Date() })
      .where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.status, "draft"), eq(budgetPlanningPeriods.version, version))).returning();
    if (!period) throw new GovernanceError("CONFLICT", "Planning period is stale or no longer a draft");
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${budgetPlanningCategorySnapshots.sortOrder}), -1)` }).from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, period.id));
    const [created] = await tx.insert(budgetPlanningCategorySnapshots).values({ householdId: actor.householdId, periodId, ...input, warningThreshold: input.warningThreshold ?? "1.00", sortOrder: max + 1, createdBy: actor.userId, updatedBy: actor.userId }).returning();
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_plan_category_created", actor: actor.userId, entity: "budget_planning_category_snapshot", entityId: created.id, afterState: planningSnapshot(created), reason: "Draft budget planning edit" }, tx);
    return [created];
  });
  return { ...planningSnapshot(category), version: version + 1 };
}

export async function updateBudgetPlanningCategory(actor: Actor, periodId: string, categoryId: string, version: number, input: Partial<PlanningCategoryInput> & { archived?: boolean }) {
  assertPermission(actor.role, "contribute"); if (input.monthlyTarget !== undefined) assertMoney(input.monthlyTarget, "Monthly target", { required: true });
  const [category] = await db.transaction(async (tx) => {
    const [period] = await tx.update(budgetPlanningPeriods).set({ version: version + 1, updatedAt: new Date() })
      .where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.status, "draft"), eq(budgetPlanningPeriods.version, version))).returning();
    if (!period) throw new GovernanceError("CONFLICT", "Planning period is stale or no longer a draft");
    const [updated] = await tx.update(budgetPlanningCategorySnapshots).set({ ...input, updatedBy: actor.userId, updatedAt: new Date() })
      .where(and(eq(budgetPlanningCategorySnapshots.id, categoryId), eq(budgetPlanningCategorySnapshots.periodId, periodId), eq(budgetPlanningCategorySnapshots.householdId, actor.householdId))).returning();
    if (!updated) return planningNotFound("Budget planning category");
    await appendAuditEvent({ householdId: actor.householdId, eventType: input.archived ? "budget_plan_category_archived" : "budget_plan_category_updated", actor: actor.userId, entity: "budget_planning_category_snapshot", entityId: updated.id, afterState: planningSnapshot(updated), reason: "Draft budget planning edit" }, tx);
    return [updated];
  });
  return { ...planningSnapshot(category), version: version + 1 };
}

export async function approveBudgetPlanningPeriod(actor: Actor, periodId: string, version: number, idempotencyKey: string) {
  assertPermission(actor.role, "approve"); if (!idempotencyKey?.trim()) throw new GovernanceError("INVALID_STATE", "Idempotency-Key is required");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-plan-idempotency:${actor.householdId}:budget_plan_approve:${idempotencyKey}`}, 0))`);
    const [used] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, idempotencyKey)));
    if (used?.operation !== undefined) { if (used.operation !== "budget_plan_approve") throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another operation"); return used.responseBody; }
    const [currentPeriod] = await tx.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
    if (!currentPeriod) return planningNotFound("Budget planning period");
    if (currentPeriod.status !== "draft") throw new GovernanceError("CONFLICT", "Closed or approved planning periods are immutable");
    if (currentPeriod.version !== version) throw new GovernanceError("CONFLICT", "Planning period version is stale; refresh and retry");
    const categories = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId));
    const active = categories.filter((category) => !category.archived);
    const requiredLayers = {
      income: active.some((category) => category.categoryType === "income" && numeric(category.monthlyTarget) > 0),
      mandatory: active.some((category) => ["fixed_expense", "debt_payment"].includes(category.categoryType) && category.essentialStatus !== "discretionary" && numeric(category.monthlyTarget) > 0),
      essential: active.some((category) => category.categoryType === "variable_essential" && category.essentialStatus !== "discretionary" && numeric(category.monthlyTarget) > 0),
      reserve: active.some((category) => category.categoryType === "savings" && category.essentialStatus !== "discretionary" && numeric(category.monthlyTarget) > 0),
      discretionary: active.some((category) => category.essentialStatus === "discretionary" && numeric(category.monthlyTarget) > 0),
      capitalGoal: active.some((category) => ["investment", "savings"].includes(category.categoryType) && /capital|invest|goal|opportunity/i.test(`${category.name} ${category.notes ?? ""}`) && numeric(category.monthlyTarget) > 0),
    };
    const missingLayers = Object.entries(requiredLayers).filter(([, present]) => !present).map(([layer]) => layer);
    if (missingLayers.length) throw new GovernanceError("INVALID_STATE", `Complete every plan layer before approval. Missing: ${missingLayers.join(", ")}`);
    const incomeTarget = active.filter((category) => category.categoryType === "income").reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
    const plannedOutflow = active.filter((category) => !["income", "transfer"].includes(category.categoryType)).reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
    if (plannedOutflow !== incomeTarget) throw new GovernanceError("INVALID_STATE", "Assign all planned income across obligations, essentials, reserves, discretionary spending, and capital goals before approval");
    requireCompleteWeeklyAllocationTemplate(categories);
    const [period] = await tx.update(budgetPlanningPeriods).set({ status: "approved", approvedAt: new Date(), approvedBy: actor.userId, version: version + 1, updatedAt: new Date() })
      .where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.status, "draft"), eq(budgetPlanningPeriods.version, version))).returning();
    if (!period) throw new GovernanceError("CONFLICT", "Planning period is stale or no longer a draft");
    const response = { id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, approvedAt: period.approvedAt, supersedesPeriodId: period.supersedesPeriodId };
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key: idempotencyKey, operation: "budget_plan_approve", responseStatus: 200, responseBody: response });
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_plan_approved", actor: actor.userId, entity: "budget_planning_period", entityId: period.id, afterState: response, reason: "Owner-approved immutable budget plan" }, tx);
    return response;
  });
}

async function planningIdempotency<T extends Record<string, unknown>>(actor: Actor, key: string, operation: string, work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) {
  if (!key?.trim()) throw new GovernanceError("INVALID_STATE", "Idempotency-Key is required");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`budget-plan-idempotency:${actor.householdId}:${operation}:${key}`}, 0))`);
    const [existing] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.householdId, actor.householdId), eq(idempotencyKeys.key, key)));
    if (existing) {
      if (existing.operation !== operation) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was used for another operation");
      return existing.responseBody as T;
    }
    const response = await work(tx);
    await tx.insert(idempotencyKeys).values({ householdId: actor.householdId, key, operation, responseStatus: 200, responseBody: response });
    return response;
  });
}

export async function copyBudgetPlanningPeriod(actor: Actor, month: string, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  const monthDate = planningMonth(month);
  return planningIdempotency(actor, idempotencyKey, "budget_plan_copy", async (tx) => {
    const bootstrap = await bootstrapPlanningPeriodInTransaction(tx, actor, actor.householdId, monthDate);
    const { period } = bootstrap;
    const categories = await tx.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, period.id)).orderBy(budgetPlanningCategorySnapshots.sortOrder);
    const response = { id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, copiedFromPeriodId: period.copiedFromPeriodId, supersedesPeriodId: period.supersedesPeriodId, createdBy: period.createdBy, createdAt: period.createdAt, updatedAt: period.updatedAt, approvedAt: period.approvedAt, approvedBy: period.approvedBy, closedAt: period.closedAt, closedBy: period.closedBy, categories: categories.map(planningSnapshot) };
    return response;
  });
}

export async function reorderBudgetPlanningCategories(actor: Actor, periodId: string, version: number, categoryIds: string[]) {
  assertPermission(actor.role, "contribute");
  const response = await db.transaction(async (tx) => {
    const [period] = await tx.update(budgetPlanningPeriods).set({ version: version + 1, updatedAt: new Date() }).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.version, version), eq(budgetPlanningPeriods.status, "draft"))).returning();
    if (!period) throw new GovernanceError("CONFLICT", "Planning period version is stale or no longer a draft");
    const rows = await tx.select({ id: budgetPlanningCategorySnapshots.id }).from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId));
    if (rows.length !== categoryIds.length || new Set(categoryIds).size !== categoryIds.length || rows.some((row) => !categoryIds.includes(row.id))) {
      throw new GovernanceError("INVALID_STATE", "Reorder list must contain every category snapshot exactly once");
    }
    await tx.update(budgetPlanningCategorySnapshots).set({ sortOrder: sql`-(${budgetPlanningCategorySnapshots.sortOrder} + 1)`, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(budgetPlanningCategorySnapshots.periodId, periodId));
    for (const [sortOrder, id] of categoryIds.entries()) await tx.update(budgetPlanningCategorySnapshots).set({ sortOrder, updatedAt: new Date(), updatedBy: actor.userId }).where(eq(budgetPlanningCategorySnapshots.id, id));
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_plan_categories_reordered", actor: actor.userId, entity: "budget_planning_period", entityId: periodId, afterState: { categoryIds, version: period.version }, reason: "Draft budget planning edit" }, tx);
    return { version: period.version, categoryIds };
  });
  return response;
}

export async function closeBudgetPlanningPeriod(actor: Actor, periodId: string, version: number, idempotencyKey: string) {
  assertPermission(actor.role, "approve");
  return planningIdempotency(actor, idempotencyKey, "budget_plan_close", async (tx) => {
    const [period] = await tx.update(budgetPlanningPeriods).set({ status: "closed", closedAt: new Date(), closedBy: actor.userId, version: version + 1, updatedAt: new Date() })
      .where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId), eq(budgetPlanningPeriods.status, "approved"), eq(budgetPlanningPeriods.version, version))).returning();
    if (!period) throw new GovernanceError("CONFLICT", "Only a current approved planning period can be closed");
    const response = { id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, closedAt: period.closedAt };
    await appendAuditEvent({ householdId: actor.householdId, eventType: "budget_plan_closed", actor: actor.userId, entity: "budget_planning_period", entityId: period.id, afterState: response, reason: "Owner closed immutable budget plan" }, tx);
    return response;
  });
}

export async function getBudgetPlanningHistory(actor: Actor) {
  const rows = await db.select().from(budgetPlanningPeriods).where(eq(budgetPlanningPeriods.householdId, actor.householdId)).orderBy(desc(budgetPlanningPeriods.month), desc(budgetPlanningPeriods.createdAt));
  return rows.map((period) => ({ id: period.id, month: period.month.slice(0, 7), status: period.status, version: period.version, copiedFromPeriodId: period.copiedFromPeriodId, supersedesPeriodId: period.supersedesPeriodId, createdBy: period.createdBy, createdAt: period.createdAt, updatedAt: period.updatedAt, approvedAt: period.approvedAt, approvedBy: period.approvedBy, closedAt: period.closedAt, closedBy: period.closedBy }));
}

export async function getBudgetPlanningChangeHistory(actor: Actor, periodId: string) {
  const [period] = await db.select({ id: budgetPlanningPeriods.id }).from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
  if (!period) return planningNotFound("Budget planning period");
  const snapshots = await db.select({ id: budgetPlanningCategorySnapshots.id }).from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, periodId));
  const entityIds = [periodId, ...snapshots.map((snapshot) => snapshot.id)];
  const rows = await db.select().from(auditEvents).where(and(eq(auditEvents.householdId, actor.householdId), inArray(auditEvents.entityId, entityIds))).orderBy(desc(auditEvents.timestamp));
  return rows.map((row) => ({ id: row.id, eventType: row.eventType, actor: row.actor, entity: row.entity, entityId: row.entityId, timestamp: row.timestamp.toISOString(), reason: row.reason }));
}

export async function getBudgetPlanningComparison(actor: Actor, month = nowMonth()) {
  const date = planningMonth(month);
  const year = date.slice(0, 4);
  const quarter = Math.floor((Number(date.slice(5, 7)) - 1) / 3);
  const rows = await db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.householdId, actor.householdId), inArray(budgetPlanningPeriods.status, ["approved", "closed"])));
  const snapshotTotals = async (periods: typeof rows) => {
    const ids = periods.map((p) => p.id); if (!ids.length) return "0.00";
    const categories = await db.select().from(budgetPlanningCategorySnapshots).where(inArray(budgetPlanningCategorySnapshots.periodId, ids));
    return categories.filter((c) => !c.archived && c.categoryType !== "income" && c.categoryType !== "transfer").reduce((sum, c) => sum + numeric(c.monthlyTarget), 0).toFixed(2);
  };
  const canonicalRows = canonicalFinalizedPlanningPeriods(rows);
  const monthRows = canonicalRows.filter((p) => p.month === date);
  const quarterRows = canonicalRows.filter((p) => p.month.slice(0, 4) === year && Math.floor((Number(p.month.slice(5, 7)) - 1) / 3) === quarter);
  const yearRows = canonicalRows.filter((p) => p.month.slice(0, 4) === year);
  return { month, monthBudgeted: await snapshotTotals(monthRows), quarterBudgeted: await snapshotTotals(quarterRows), yearBudgeted: await snapshotTotals(yearRows), approvedPeriodCount: canonicalRows.length };
}

export async function getBudgetPlanningCategoryContributionDetail(actor: Actor, periodId: string, categoryId: string) {
  const [period] = await db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, actor.householdId)));
  if (!period) return planningNotFound("Budget planning period");
  const [snapshot] = await db.select().from(budgetPlanningCategorySnapshots).where(and(eq(budgetPlanningCategorySnapshots.id, categoryId), eq(budgetPlanningCategorySnapshots.periodId, periodId)));
  if (!snapshot) return planningNotFound("Budget planning category");
  const transactions = await db.select().from(financeTransactions).where(and(eq(financeTransactions.householdId, actor.householdId), sql`${financeTransactions.transactionDate} >= ${period.month} and ${financeTransactions.transactionDate} < (${period.month}::date + interval '1 month')::date`));
  const relevant = transactions.filter((t) => t.categoryId === snapshot.sourceCategoryId);
  const included = relevant.filter((t) => t.reviewStatus === "approved" && !t.pending && t.businessTag === "household" && !isExcludedFromHouseholdSpending(t, snapshot.categoryType));
  const excluded = relevant.filter((t) => !included.includes(t));
  return { category: planningSnapshot(snapshot), includedReviewedHouseholdTransactions: included, includedActual: Math.max(0, -included.reduce((sum, t) => sum + numeric(t.amount), 0)).toFixed(2), exclusions: {
    uncategorized: transactions.filter((t) => !t.categoryId).length,
    excluded: excluded.filter((t) => t.excludedFromBudget || t.reviewStatus === "excluded").length,
    business: excluded.filter((t) => t.businessTag !== "household").length,
    transfers: excluded.filter((t) => Boolean(t.transferGroupId) || snapshot.categoryType === "transfer").length,
    unreviewed: excluded.filter((t) => t.reviewStatus !== "approved").length,
    rows: excluded,
  } };
}

function currentPeriodTransactions(data: Awaited<ReturnType<typeof loadFinanceData>>, asOf = calendarToday()) {
  const period = currentPeriod(asOf);
  const categoryTypes = new Map(data.categories.map((category) => [category.id, category.categoryType]));
  return data.transactions.filter((transaction) =>
    transaction.transactionDate >= period.start &&
    transaction.transactionDate < period.end &&
    transaction.reviewStatus === "approved" &&
    !transaction.pending &&
    !isExcludedFromHouseholdSpending(
      transaction,
      categoryTypes.get(transaction.categoryId ?? ""),
    )
  );
}

async function currentApprovedPlanningCategories(household: string, asOf = calendarToday()) {
  const month = `${asOf.slice(0, 7)}-01`;
  const [period] = await db.select().from(budgetPlanningPeriods).where(and(
    eq(budgetPlanningPeriods.householdId, household),
    eq(budgetPlanningPeriods.month, month),
    inArray(budgetPlanningPeriods.status, ["approved", "closed"]),
  )).orderBy(desc(budgetPlanningPeriods.createdAt)).limit(1);
  if (!period) return null;
  const categories = await db.select().from(budgetPlanningCategorySnapshots)
    .where(and(eq(budgetPlanningCategorySnapshots.periodId, period.id), eq(budgetPlanningCategorySnapshots.archived, false)))
    .orderBy(budgetPlanningCategorySnapshots.sortOrder);
  return { period, categories };
}

function financeDataConfidence(data: Awaited<ReturnType<typeof loadFinanceData>>) {
  const staleAccounts = data.capitalAccounts.filter((account) => {
    const lastSync = account.lastSuccessfulSync ?? account.lastSync;
    return !lastSync || Date.now() - lastSync.getTime() > 1000 * 60 * 60 * 24 * 45;
  }).length;
  let score = 100;
  if (!data.capitalAccounts.length) score -= 45;
  if (!data.categories.some((category) => numeric(category.monthlyTarget) > 0)) score -= 25;
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
  const approvedPlan = await currentApprovedPlanningCategories(data.id);
  // Drafts never enter this path: Budget is an official view and only frozen
  // reviewed snapshots may establish its targets.  The additive finance
  // taxonomy is still rendered before the first approval, with zeroed
  // targets, so a newly created or evolved household never receives an empty
  // Budget response or has unreviewed category targets treated as official.
  const categories = approvedPlan?.categories ?? data.categories.map((category) => ({
    ...category,
    sourceCategoryId: category.id,
    monthlyTarget: "0.00",
  }));
  const performance = calculateBudgetPerformance(
    categories.map((category) => ({
      id: category.sourceCategoryId ?? category.id,
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
      transferGroupId: transaction.transferGroupId,
    })),
    period.daysElapsed,
    period.daysInMonth,
  );
const pendingRows = await db.select({
    amount: bankStatementTransactions.amount,
    correctedValue: bankStatementTransactions.correctedValue,
    categoryId: bankStatementTransactions.selectedCategoryId,
    status: statementFinancialInclusions.status
  })
    .from(bankStatementTransactions)
    .innerJoin(bankStatementDocuments, eq(bankStatementDocuments.id, bankStatementTransactions.bankStatementDocumentId))
    .innerJoin(financialDocuments, eq(financialDocuments.id, bankStatementDocuments.documentId))
    .leftJoin(statementFinancialInclusions, eq(statementFinancialInclusions.statementRowId, bankStatementTransactions.id))
    .where(and(
      eq(financialDocuments.householdId, data.id),
      eq(bankStatementDocuments.householdId, data.id),
      eq(bankStatementTransactions.householdId, data.id),
      sql`${bankStatementTransactions.postedDate} >= ${period.start}::date`,
      sql`${bankStatementTransactions.postedDate} <= ${period.end}::date`,
      eq(financialDocuments.status, "VERIFIED"),
      inArray(bankStatementTransactions.lastReviewAction, ["APPROVE", "RECLASSIFY"]),
      eq(bankStatementTransactions.economicClassification, "HOUSEHOLD")
    ));

  const sourceCoverageMap = new Map<string, { officialCount: number, pendingCount: number, pendingAmount: number }>();
  for (const row of pendingRows) {
    if (!row.categoryId) continue;
    const stats = sourceCoverageMap.get(row.categoryId) ?? { officialCount: 0, pendingCount: 0, pendingAmount: 0 };
    if (row.status === "IMPORTED_NEW" || row.status === "LINKED_EXISTING") {
      stats.officialCount++;
    } else if (row.status !== "EXCLUDED_TRANSFER" && row.status !== "EXCLUDED_SETTLEMENT" && row.status !== "EXCLUDED_DUPLICATE" && row.status !== "REJECTED") {
      stats.pendingCount++;
      const val = row.correctedValue ? (row.correctedValue as any).amount : row.amount;
      stats.pendingAmount += cents(val as string);
    }
    sourceCoverageMap.set(row.categoryId, stats);
  }

  const performanceWithCoverage = performance.map((c) => {
    const stats = sourceCoverageMap.get(c.id) ?? { officialCount: 0, pendingCount: 0, pendingAmount: 0 };
    const actualPending = Math.max(0, c.categoryType === "income" ? stats.pendingAmount : -stats.pendingAmount);
    return {
      ...c,
      pendingEvidence: (actualPending / 100).toFixed(2),
      sourceCoverage: `${stats.officialCount} official, ${stats.pendingCount} pending`
    };
  });

  const totals = performanceWithCoverage.reduce((result, category) => {
    if (category.categoryType === "income" || category.categoryType === "transfer") return result;
    result.budgeted += numeric(category.budgeted);
    result.actual += numeric(category.actual);
    result.pendingEvidence += numeric(category.pendingEvidence);
    return result;
  }, { budgeted: 0, actual: 0, pendingEvidence: 0 });

  return {
    month: period.label,
    categories: performanceWithCoverage,
    totals: {
      budgeted: totals.budgeted.toFixed(2),
      actual: totals.actual.toFixed(2),
      pendingEvidence: totals.pendingEvidence.toFixed(2),
      remaining: (totals.budgeted - totals.actual).toFixed(2),
      percentageUsed: totals.budgeted === 0 ? 0 : Number(((totals.actual / totals.budgeted) * 100).toFixed(1)),
    },
    notes: [
      `Current period: ${period.start} through ${calendarToday()}.`,
      ...(approvedPlan ? [`Official targets are from approved plan ${approvedPlan.period.month.slice(0, 7)}.`] : ["No approved plan exists for this month; official Budget targets fail closed until an owner approves one."]),
      "Approved income appears by category; the Transfer and Credit card payment categories, plus linked transfer pairs, are excluded from Budget Performance and expense totals to avoid double counting.",
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
  const approvedPlan = await currentApprovedPlanningCategories(data.id);
  const asOf = calendarToday();
  const incomeDate = nextIncomeDate(data.income, asOf);
  const approvedManualActivity = currentPeriodTransactions(data, asOf)
    .filter((transaction) => transaction.dataSource === "manual")
    .reduce((sum, transaction) => sum + cents(transaction.amount), 0);
  const liquid = data.capitalAccounts
    .filter((account) => ["checking", "savings", "money_market"].includes(account.accountType))
    .reduce((sum, account) => sum + cents(account.availableBalance ?? account.currentBalance), 0) + approvedManualActivity;
  const bills = data.bills
    .filter((bill) => bill.active && (!incomeDate || bill.dueDate < incomeDate))
    .reduce((sum, bill) => sum + cents(bill.expectedAmount), 0);
  const essential = approvedPlan
    ? approvedPlan.categories.filter((category) => category.essentialStatus === "essential" && category.categoryType !== "income").reduce((sum, category) => sum + cents(category.monthlyTarget), 0)
    : liquid; // fail closed on first use: no reviewed plan means no deployable surplus.
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

export async function getFinanceInsights(actor: Actor) {
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
    researchContext: await getApprovedFamilyOfficeResearchProjection(actor),
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
      dataMode: "manual",
      lastSync: recordedAt,
      lastSuccessfulSync: recordedAt,
    }).returning();
    await appendAuditEvent({
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
    }, tx);
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
    const audit = fresh.length
      ? await appendAuditEvent({
        householdId: actor.householdId,
        eventType: "finance_csv_imported",
        actor: actor.userId,
        entity: "financial_account",
        entityId: accountId,
        reason: "Imported rows require household review before planning use",
        metadata: { source: "csv_import", imported: fresh.length, skippedDuplicates: deduplicated.skippedDuplicates, readOnlyExternal: true },
      }, tx)
      : null;
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
  const amount = canonicalManualTransactionAmount(input.amount, input.direction);
  const originalAmount = (cents(input.amount) / 100).toFixed(2);
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
    await appendAuditEvent({
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
    }, tx);
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
    if (transaction.dataSource !== "csv_import" && transaction.dataSource !== "plaid" && transaction.dataSource !== "manual") {
      throw new GovernanceError("INVALID_STATE", "This transaction source cannot be reviewed here");
    }

    const categoryId = input.categoryId !== undefined ? input.categoryId : transaction.categoryId;
    let categoryType: string | null = null;
    if (categoryId) {
      const [category] = await tx.select({ id: financeCategories.id, categoryType: financeCategories.categoryType })
        .from(financeCategories)
        .where(and(eq(financeCategories.id, categoryId), eq(financeCategories.householdId, id), eq(financeCategories.active, true)))
        .limit(1);
      if (!category) throw new GovernanceError("INVALID_STATE", "The selected category is not available in this household");
      categoryType = category.categoryType;
    }
    let priorCategoryType: string | null = categoryType;
    if (transaction.categoryId && transaction.categoryId !== categoryId) {
      const [priorCategory] = await tx.select({ categoryType: financeCategories.categoryType })
        .from(financeCategories)
        .where(and(
          eq(financeCategories.id, transaction.categoryId),
          eq(financeCategories.householdId, id),
        ))
        .limit(1);
      priorCategoryType = priorCategory?.categoryType ?? null;
    }
    if (input.status === "approved" && !categoryId) {
      throw new GovernanceError("INVALID_STATE", "An approved transaction must have a household category");
    }
    const review = reviewMetadata(transaction.metadata);
    const existingNote = typeof review.note === "string" ? review.note : null;
    const nextNote = input.note === undefined ? existingNote : input.note;
    const nextTransferGroupId =
      transaction.transferGroupId ??
      (
        categoryType === "transfer" ||
        priorCategoryType === "transfer" ||
        transaction.reviewStatus === "possible_transfer"
          ? `reviewed-transfer:${transaction.id}`
          : null
      );
    const nextExcluded = reviewedTransactionBudgetExclusion(
      input.status,
      categoryType,
      nextTransferGroupId,
    );
    if (
      transaction.reviewStatus === input.status &&
      transaction.categoryId === categoryId &&
      transaction.excludedFromBudget === nextExcluded &&
      transaction.transferGroupId === nextTransferGroupId &&
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
      transferGroupId: nextTransferGroupId,
      metadata: nextMetadata,
      updatedAt: new Date(),
    }).where(and(
      eq(financeTransactions.id, transactionId),
      eq(financeTransactions.householdId, id),
    )).returning();
    if (!updated) return planningNotFound("Financial transaction");
    await appendAuditEvent({
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
        transferGroupId: transaction.transferGroupId,
      },
      afterState: {
        reviewStatus: input.status,
        categoryId,
        excludedFromBudget: nextExcluded,
        transferGroupId: nextTransferGroupId,
        note: nextNote,
      },
      metadata: { source: "household-finance-review", idempotent: false },
    }, tx);
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

// hint: Structural change (rename/retype). Check callers of this entity.
type WeeklyGuidanceExclusionReason = "uncategorized" | "pending" | "excluded" | "unreviewed" | "nonHousehold" | "transfer" | "nonIncome";

export function weeklyGuidanceExclusionDecision(
  transaction: Pick<typeof financeTransactions.$inferSelect, "categoryId" | "pending" | "reviewStatus" | "excludedFromBudget" | "businessTag" | "transferGroupId" | "amount">,
  category: Pick<WeeklyGuidanceCategory, "categoryType"> | undefined,
  liveCategoryType?: string,
): { reason: WeeklyGuidanceExclusionReason | null; actionable: boolean } {
  let reason: WeeklyGuidanceExclusionReason | null = null;
  if (!transaction.categoryId || !category) reason = "uncategorized";
  else if (transaction.pending) reason = "pending";
  else if (transaction.reviewStatus === "excluded" || transaction.excludedFromBudget) reason = "excluded";
  else if (transaction.reviewStatus !== "approved") reason = "unreviewed";
  else if (transaction.businessTag !== "household") reason = "nonHousehold";
  else if (transaction.transferGroupId || category.categoryType === "transfer") reason = "transfer";
  else if (category.categoryType === "income" && cents(transaction.amount) <= 0) reason = "nonIncome";
  const transferIdentity = Boolean(transaction.transferGroupId) || (category?.categoryType ?? liveCategoryType) === "transfer";
  const actionable = (reason === "uncategorized" || reason === "unreviewed")
    && !transaction.pending
    && transaction.reviewStatus !== "excluded"
    && !transaction.excludedFromBudget
    && transaction.businessTag === "household"
    && !transferIdentity;
  return { reason, actionable };
}

function weeklyGuidanceExclusionExplanation(reason: WeeklyGuidanceExclusionReason) {
  return {
    uncategorized: "This row has no category in this monthly plan, so weekly guidance cannot assign it safely.",
    pending: "This row is still pending at its source and remains outside weekly guidance until it settles.",
    excluded: "This row was explicitly excluded from household budget calculations.",
    unreviewed: "This row has not been approved by the household and remains outside weekly guidance.",
    nonHousehold: "This row is business or property activity, not household activity.",
    transfer: "This row is a transfer and is excluded to avoid counting money moving between accounts as income or spending.",
    nonIncome: "This income-category row is not a positive inflow, so it cannot support weekly guidance.",
  }[reason];
}

export async function getTransactionReviewQueue(actor?: Actor, periodId?: string) {
  const id = await householdId(actor);
  await ensureDefaultFinanceCategories(id);
  const [period] = periodId
    ? await db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.id, periodId), eq(budgetPlanningPeriods.householdId, id)))
    : [];
  if (periodId && !period) return planningNotFound("Budget planning period");
  const snapshots = period
    ? await db.select().from(budgetPlanningCategorySnapshots).where(eq(budgetPlanningCategorySnapshots.periodId, period.id))
    : [];
  const snapshotsBySource = new Map(snapshots.filter((category) => !category.archived && category.sourceCategoryId).map((category) => [category.sourceCategoryId!, category]));
  const transactionWhere = period
    ? and(
      eq(financeTransactions.householdId, id),
      sql`${financeTransactions.transactionDate} >= ${period.month} and ${financeTransactions.transactionDate} < (${period.month}::date + interval '1 month')::date`,
    )
    : and(
      eq(financeTransactions.householdId, id),
      inArray(financeTransactions.dataSource, ["manual", "csv_import", "plaid"]),
      ne(financeTransactions.reviewStatus, "approved"),
    );
  const [allTransactions, accounts, categories] = await Promise.all([
    db.select().from(financeTransactions).where(transactionWhere),
    db.select({ id: financialAccounts.id, nickname: financialAccounts.nickname })
      .from(financialAccounts)
      .where(eq(financialAccounts.householdId, id)),
    db.select({ id: financeCategories.id, name: financeCategories.name, categoryType: financeCategories.categoryType })
      .from(financeCategories)
      .where(and(eq(financeCategories.householdId, id), eq(financeCategories.active, true))),
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account.nickname]));
  const categoriesById = new Map(categories.map((category) => [category.id, category.name]));
  const categoryTypesById = new Map(categories.map((category) => [category.id, category.categoryType]));
  const transactions = period
    ? allTransactions.flatMap((transaction) => {
      const decision = weeklyGuidanceExclusionDecision(
        transaction,
        transaction.categoryId ? snapshotsBySource.get(transaction.categoryId) : undefined,
        transaction.categoryId ? categoryTypesById.get(transaction.categoryId) : undefined,
      );
      return decision.reason ? [{ transaction, ...decision }] : [];
    })
    : allTransactions.map((transaction) => ({ transaction, reason: null, actionable: true }));
  return {
    transactions: transactions.map(({ transaction, reason, actionable }) => reviewedTransaction(
      transaction,
      accountsById.get(transaction.accountId) ?? "Unknown account",
      transaction.categoryId ? categoriesById.get(transaction.categoryId) ?? null : null,
      reason,
      actionable,
    )),
    categories: categories.map(({ id: categoryId, name }) => ({ id: categoryId, name })),
  };
}

function reviewedTransaction(
  transaction: typeof financeTransactions.$inferSelect,
  accountName: string,
  categoryName: string | null,
  weeklyGuidanceExclusionReason: WeeklyGuidanceExclusionReason | null = null,
  weeklyGuidanceActionable = true,
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
    weeklyGuidanceExclusionReason,
    weeklyGuidanceActionable,
    reviewReason: weeklyGuidanceExclusionReason
      ? weeklyGuidanceExclusionExplanation(weeklyGuidanceExclusionReason)
      : "This row stays outside planning until the household reviews and approves it.",
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
    await appendAuditEvent({
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
    }, tx);
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
    await appendAuditEvent({
      householdId: id,
      eventType: "bank_connection_reauthorized",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      afterState: { credentialReferenceReplaced: true, consentStatus: "granted", readOnly: true },
      reason: "Household reauthorized the read-only provider connection",
      metadata: { source: "household-bank-sync", credentialValueStored: false },
    }, tx);
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
    await appendAuditEvent({
      householdId: id,
      eventType: "bank_account_linked",
      actor: actor.userId,
      entity: "financial_account",
      entityId: account.id,
      beforeState: { bankConnectionId: account.bankConnectionId, providerAccountRef: account.providerAccountRef },
      afterState: { bankConnectionId: connection.id, providerAccountRef: providerRef, readOnly: true },
      reason: "Household explicitly matched a provider account to a planning account",
      metadata: { source: "household-bank-sync" },
    }, tx);
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
    await appendAuditEvent({
      householdId: id,
      eventType: "bank_connection_revoked",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      beforeState: { consentStatus: connection.consentStatus, status: connection.status },
      afterState: { consentStatus: "revoked", status: "disconnected", credentialsRevoked: true },
      reason: "Household revoked read-only bank synchronization consent",
      metadata: { source: "household-bank-sync" },
    }, tx);
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
    await appendAuditEvent({
      householdId: id,
      eventType: "bank_connection_data_deleted",
      actor: actor.userId,
      entity: "bank_connection",
      entityId: connection.id,
      beforeState: { provider: connection.provider, linkedAccountCount: accountIds.length },
      afterState: { providerDataDeleted: true, credentialsDeleted: true, accountLinksRemoved: accountIds.length },
      reason: "Household requested deletion of provider-derived bank data",
      metadata: { source: "household-bank-sync", rawCredentialsPersisted: false },
    }, tx);
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

function providerTransferGroupId(
  connectionId: string,
  transaction: ProviderTransactionSnapshot,
) {
  if (transaction.reviewHint !== "possible_transfer" && !transaction.transferGroupId) return null;
  const providerGroupId = transaction.transferGroupId?.trim() || `unpaired:${transaction.providerTransactionId}`;
  return `provider-transfer:${connectionId}:${providerGroupId}`;
}

function transferReconciliation(count: number) {
  if (count === 2) {
    return {
      status: "matched" as const,
      reason: "Provider transfer group has exactly two counterpart rows",
    };
  }
  if (count < 2) {
    return {
      status: "incomplete" as const,
      reason: "Provider transfer group is missing its counterpart row",
    };
  }
  return {
    status: "ambiguous" as const,
    reason: `Provider transfer group has ${count} rows; expected exactly two counterparts`,
  };
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
  const result: typeof baseResult & {
    status: "matched" | "review";
    applied: true;
    providerAsOf: Date;
    transferReconciliationIssues: number;
  } = {
    ...baseResult,
    status: "matched",
    applied: true,
    providerAsOf,
    transferReconciliationIssues: 0,
  };
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
        const amount = normalizeImportedAmount(transaction.amount, provider.transactionAmountConvention);
        const reviewStatus = providerReviewStatus(transaction);
        const transferGroupId = providerTransferGroupId(connection.id, transaction);
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
          const existingMetadata = existing[0].metadata as {
            bankSync?: { canonicalSignContract?: string };
          } | null;
          const signContractApplied = existingMetadata?.bankSync?.canonicalSignContract === "positive_inflow_v1";
          const stableProviderTransferGroupSupplied = Boolean(transaction.transferGroupId?.trim());
          const existingProviderTransferGroup = existing[0].transferGroupId?.startsWith(
            `provider-transfer:${connection.id}:`,
          ) ?? false;
          const nextTransferGroupId = stableProviderTransferGroupSupplied && existingProviderTransferGroup
            ? transferGroupId
            : existing[0].transferGroupId ?? transferGroupId;
          await tx.update(financeTransactions).set({
            transactionDate: transaction.transactionDate,
            description: transaction.description,
            merchant: transaction.merchant ?? null,
            ...(signContractApplied ? { originalAmount: transaction.amount, amount } : {}),
            pending,
            ...(existing[0].reviewStatus === "approved" ? {} : { reviewStatus }),
            transferGroupId: nextTransferGroupId,
            excludedFromBudget: existing[0].excludedFromBudget || Boolean(nextTransferGroupId),
            metadata: {
              ...existing[0].metadata,
              bankSync: {
                ...existingMetadata?.bankSync,
                provider: connection.provider,
                providerTransactionId: transaction.providerTransactionId,
                lastSeenAt: now.toISOString(),
              },
            },
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
          amount,
          dataSource: "plaid",
          reviewStatus,
          transferGroupId,
          excludedFromBudget: Boolean(transferGroupId),
          pending,
          metadata: {
            bankSync: {
              provider: connection.provider,
              providerTransactionId: transaction.providerTransactionId,
              lastSeenAt: now.toISOString(),
              canonicalSignContract: "positive_inflow_v1",
            },
          },
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
      const providerAccountIds = localAccounts.map((account) => account.id);
      const transferRows = providerAccountIds.length
        ? await tx.select().from(financeTransactions).where(and(
            eq(financeTransactions.householdId, id),
            eq(financeTransactions.dataSource, "plaid"),
            inArray(financeTransactions.accountId, providerAccountIds),
            sql`${financeTransactions.transferGroupId} like ${`provider-transfer:${connection.id}:%`}`,
          ))
        : [];
      const rowsByTransferGroup = new Map<string, typeof transferRows>();
      for (const row of transferRows) {
        if (!row.transferGroupId) continue;
        const grouped = rowsByTransferGroup.get(row.transferGroupId) ?? [];
        grouped.push(row);
        rowsByTransferGroup.set(row.transferGroupId, grouped);
      }
      for (const [transferGroupId, rows] of rowsByTransferGroup) {
        const reconciliation = transferReconciliation(rows.length);
        if (reconciliation.status !== "matched") result.transferReconciliationIssues += 1;
        for (const row of rows) {
          const metadata = row.metadata as { bankSync?: Record<string, unknown> } | null;
          await tx.update(financeTransactions).set({
            excludedFromBudget: true,
            ...(reconciliation.status === "matched" || row.reviewStatus === "possible_transfer"
              ? {}
              : { reviewStatus: "possible_transfer" as const }),
            metadata: {
              ...metadata,
              bankSync: {
                ...metadata?.bankSync,
                transferReconciliationStatus: reconciliation.status,
                transferReconciliationReason: reconciliation.reason,
                transferGroupId,
                transferGroupRowCount: rows.length,
                transferReconciledAt: now.toISOString(),
              },
            },
            updatedAt: now,
          }).where(and(eq(financeTransactions.id, row.id), eq(financeTransactions.householdId, id)));
        }
      }
      if (result.transferReconciliationIssues > 0) result.status = "review";
      const transferErrorMessage = result.transferReconciliationIssues > 0
        ? `${result.transferReconciliationIssues} provider transfer group(s) are missing or have duplicate counterparts; affected rows remain excluded from spending and require review`
        : null;
      await tx.update(bankConnections).set({
        status: result.status === "review" ? "delayed" : "connected",
        lastSuccessfulSync: now,
        lastBalanceRefresh: now,
        lastTransactionSync: now,
        providerAsOf,
        syncCursor: snapshot.cursor ?? connection.syncCursor ?? null,
        reconciliationStatus: result.status,
        reconciliationDifference: "0.00",
        errorMessage: transferErrorMessage,
        updatedAt: now,
      }).where(and(eq(bankConnections.id, connection.id), eq(bankConnections.householdId, id)));
      await appendAuditEvent({
        householdId: id,
        eventType: "bank_connection_synced",
        actor: actor.userId,
        entity: "bank_connection",
        entityId: connection.id,
        afterState: { readOnly: true, inserted: result.inserted, updated: result.updated, duplicates: result.duplicates, reviewCount: result.reviewCount, removed: result.removed, reconciliationStatus: result.status, transferReconciliationIssues: result.transferReconciliationIssues },
        reason: transferErrorMessage ?? "Read-only provider snapshot passed freshness, account matching, balance, and transfer-pair reconciliation gates",
        metadata: { source: "household-bank-sync", provider: connection.provider },
      }, tx);
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
    status: result.status,
    connectionStatus: result.status === "review" ? "delayed" : "connected",
    reconciliationStatus: result.status,
    errorCode: result.status === "review" ? "TRANSFER_PAIR_REVIEW_REQUIRED" : null,
    errorMessage: result.status === "review"
      ? `${result.transferReconciliationIssues} provider transfer group(s) are missing or have duplicate counterparts; affected rows remain excluded from spending and require review`
      : null,
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
