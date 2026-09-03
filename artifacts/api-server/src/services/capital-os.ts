import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  accounts,
  aiRecommendations,
  allocationRules,
  auditEvents,
  contributions,
  goals,
  householdMembers,
  householdSettings,
  households,
  ledgerEntries,
  ledgerTransactions,
  propertyGoals,
  propertyMilestones,
  propertyNotes,
  riskStates,
  strategyPerformance,
  strategies,
  type Account,
  type Goal,
  type RiskState,
  type Strategy,
} from "@workspace/db";
import {
  allocationToRecord,
  calculateAllocationImpact,
  calculateGoalMetrics,
  centsToMoney,
  parseMoneyToCents,
  type AllocationCents,
} from "../domain/finance";
import {
  assertAIActionAllowed,
  assertAllocationAllowed,
  assertPermission,
  assertStrategyPromotion,
  GovernanceError,
  type HouseholdRole,
  type StrategyStage,
} from "../domain/governance";
import { chainAdapters, futureCapitalVaultInterface } from "../domain/blockchain";
import { reportDescriptors } from "../domain/reports";
import { ensureSeedData, type SeedContext } from "./seed";
import { canViewFinancialBalance } from "../domain/household-finance";

export type Actor = {
  role: HouseholdRole;
  userId: string;
  householdId: string;
  permissions?: string[];
  source: "development-seed" | "test-seed" | "test-database" | "clerk-session";
};

function weeksBetween(targetDate: string): number {
  const target = new Date(`${targetDate}T00:00:00.000Z`).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((target - now) / (7 * 24 * 60 * 60 * 1000)));
}

function numeric(value: string | null | undefined): number {
  return parseMoneyToCents(value ?? "0");
}

function dateTime(value: Date | string | null | undefined): string {
  return value instanceof Date ? value.toISOString() : value ?? new Date().toISOString();
}

function toAccountSummary(account: Account, role = "owner") {
  return {
    id: account.id,
    name: account.name,
    accountType: account.accountType,
    balance: canViewFinancialBalance(role, account.protected) ? account.balance : "REDACTED",
    protected: account.protected,
    riskClass: account.riskClass,
  };
}

function toGoalSummary(goal: Goal) {
  const metrics = calculateGoalMetrics({
    targetAmountCents: numeric(goal.targetAmount),
    currentAmountCents: numeric(goal.currentAmount),
    weeklyContributionCents: numeric(goal.weeklyContribution),
    weeksRemaining: weeksBetween(goal.targetDate),
  });
  return {
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount,
    currentAmount: goal.currentAmount,
    protectedAmount: goal.protectedAmount,
    weeklyContribution: goal.weeklyContribution,
    ...metrics,
    progressPercent: metrics.progressPercent,
    amountRemaining: centsToMoney(metrics.amountRemainingCents),
    requiredWeeklyContribution: centsToMoney(metrics.requiredWeeklyContributionCents),
    projectedCompletionWeeks: metrics.projectedCompletionWeeks,
    status: metrics.status,
    priority: goal.priority,
    targetDate: goal.targetDate,
  };
}

async function context(): Promise<SeedContext> {
  return ensureSeedData();
}

async function currentAllocation(householdId: string) {
  const [rule] = await db
    .select()
    .from(allocationRules)
    .where(and(eq(allocationRules.householdId, householdId), eq(allocationRules.active, true)))
    .orderBy(desc(allocationRules.createdAt))
    .limit(1);
  if (!rule) throw new Error("Active allocation rule is missing");
  return {
    id: rule.id,
    totalWeekly: rule.totalWeekly,
    duplexReserve: rule.duplexReserve,
    capitalOs: rule.capitalOs,
    opportunityReserve: rule.opportunityReserve,
  };
}

async function accountRows(householdId: string): Promise<Account[]> {
  return db.select().from(accounts).where(and(
    eq(accounts.householdId, householdId),
    eq(accounts.executionOnly, false),
  ));
}

export async function getHousehold(actor: Actor) {
  const ids = await context();
  const [household] = await db.select().from(households).where(eq(households.id, ids.householdId)).limit(1);
  const [settings] = await db.select().from(householdSettings).where(eq(householdSettings.householdId, ids.householdId)).limit(1);
  if (!household) throw new Error("Household was not found");
  return {
    id: household.id,
    name: household.name,
    timezone: household.timezone,
    role: actor.role,
     permissions: actor.permissions ?? Array.from(
       actor.role === "owner"
         ? ["read", "contribute", "transfer", "allocate", "approve", "manage_risk", "execute_micro_live_order"]
         : actor.role === "partner"
           ? ["read", "contribute", "transfer", "allocate"]
           : actor.role === "advisor"
             ? ["read", "recommend"]
             : ["read"],
     ),
    privacy: {
      financeDataPrivate: settings?.settings?.financeDataPrivate !== false,
      shareHealthSummary: settings?.settings?.shareHealthSummary === true,
      credentialsStored: false,
      bankActionsEnabled: false,
    },
  };
}

export async function updatePrivacySettings(actor: Actor, input: { financeDataPrivate: boolean; shareHealthSummary: boolean }) {
  assertPermission(actor.role, "approve");
  const ids = await context();
  const [settings] = await db.select().from(householdSettings).where(eq(householdSettings.householdId, ids.householdId)).limit(1);
  await db.update(householdSettings).set({
    settings: { ...(settings?.settings ?? {}), ...input, credentialsStored: false, bankActionsEnabled: false },
    updatedAt: new Date(),
  }).where(eq(householdSettings.householdId, ids.householdId));
  return getHousehold(actor);
}

export async function getAccounts(actor?: Actor) {
  const ids = await context();
  const rows = await accountRows(ids.householdId);
  return rows
    .filter((account) => account.accountType !== "treasury")
    .map((account) => toAccountSummary(account, actor?.role ?? "owner"));
}

export async function getGoals() {
  const ids = await context();
  const rows = await db.select().from(goals).where(eq(goals.householdId, ids.householdId)).orderBy(desc(goals.priority));
  return rows.map(toGoalSummary);
}

export async function getContributions() {
  const ids = await context();
  const rows = await db
    .select()
    .from(contributions)
    .where(eq(contributions.householdId, ids.householdId))
    .orderBy(desc(contributions.createdAt))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    createdAt: dateTime(row.createdAt),
    idempotencyKey: row.idempotencyKey,
    metadata: row.metadata ?? {},
  }));
}

export async function getPortfolio() {
  const ids = await context();
  const rows = (await accountRows(ids.householdId)).filter((account) => account.accountType !== "treasury");
  const totals = rows.reduce(
    (result, row) => {
      const balance = numeric(row.balance);
      result.total += balance;
      if (row.protected) result.protected += balance;
      if (row.accountType === "active_capital" || row.accountType === "strategy_capital") result.active += balance;
      if (row.accountType === "cash_reserve" || row.accountType === "opportunity_reserve") result.cash += balance;
      return result;
    },
    { total: 0, protected: 0, active: 0, cash: 0 },
  );
  const ledgerRows = await db
    .select({
      transactionId: ledgerTransactions.id,
      debit: ledgerEntries.debit,
      credit: ledgerEntries.credit,
    })
    .from(ledgerTransactions)
    .innerJoin(ledgerEntries, eq(ledgerEntries.transactionId, ledgerTransactions.id))
    .where(and(
      eq(ledgerTransactions.householdId, ids.householdId),
      sql`coalesce(${ledgerTransactions.metadata}->>'executionOnly', 'false') <> 'true'`,
    ));
  const ledgerTotals = new Map<string, { debit: number; credit: number }>();
  for (const row of ledgerRows) {
    const current = ledgerTotals.get(row.transactionId) ?? { debit: 0, credit: 0 };
    current.debit += numeric(row.debit);
    current.credit += numeric(row.credit);
    ledgerTotals.set(row.transactionId, current);
  }
  const ledgerBalanced = Array.from(ledgerTotals.values()).every((value) => value.debit === value.credit);
  return {
    totalCapital: centsToMoney(totals.total),
    protectedCapital: centsToMoney(totals.protected),
    activeCapital: centsToMoney(totals.active),
    cashReserve: centsToMoney(totals.cash),
    ledgerBalanced,
    composition: rows.map((row) => ({
      label: row.name,
      amount: row.balance,
      percent: totals.total === 0 ? 0 : Number(((numeric(row.balance) / totals.total) * 100).toFixed(1)),
    })),
  };
}

export async function getProperty() {
  const ids = await context();
  const [property] = await db
    .select()
    .from(propertyGoals)
    .where(and(
      eq(propertyGoals.id, ids.propertyGoalId),
      eq(propertyGoals.householdId, ids.householdId),
    ))
    .limit(1);
  if (!property) throw new Error("Property goal was not found");
  const milestones = await db
    .select()
    .from(propertyMilestones)
    .where(eq(propertyMilestones.propertyGoalId, property.id))
    .orderBy(propertyMilestones.sortOrder);
  return {
    id: property.id,
    name: property.name,
    targetMarket: property.targetMarket ?? "Not selected",
    targetBudget: property.targetBudget,
    estimatedDownPayment: property.estimatedDownPayment,
    estimatedClosingCosts: property.estimatedClosingCosts,
    readinessScore: Number(property.readinessScore),
    milestones: milestones.map((milestone) => ({
      id: milestone.id,
      name: milestone.name,
      status: milestone.status,
      progress: Number(milestone.progress),
      target: milestone.target ?? "",
      currentState: milestone.currentState ?? "",
      nextAction: milestone.nextAction ?? "",
      dueDate: milestone.dueDate,
    })),
  };
}

function strategySummary(strategy: Strategy, performance?: typeof strategyPerformance.$inferSelect) {
  return {
    id: strategy.id,
    name: strategy.name,
    strategyType: strategy.strategyType,
    stage: strategy.stage,
    allocation: strategy.allocation,
    confidenceScore: Number(strategy.confidenceScore),
    riskLevel: strategy.riskLevel,
    enabled: strategy.enabled,
    graduationEvidence: {
      minimumObservations: Number(performance?.observations ?? 0) >= 100,
      reconciliationAccurate: Number(performance?.reconciliationAccuracy ?? 0) >= 0.999,
      noCriticalErrors: Number(performance?.criticalErrorCount ?? 1) === 0,
    },
  };
}

export async function getStrategies() {
  const ids = await context();
  const rows = await db.select().from(strategies).where(eq(strategies.householdId, ids.householdId));
  const performances = await db
    .select()
    .from(strategyPerformance)
    .where(inArray(strategyPerformance.strategyId, rows.map((row) => row.id)));
  return rows.map((strategy) => strategySummary(strategy, performances.find((item) => item.strategyId === strategy.id)));
}

function riskSummary(risk: RiskState) {
  return {
    state: risk.state,
    protectedCapitalLocked: risk.protectedCapitalLocked,
    emergencyStopActive: risk.emergencyStopActive,
    maxActiveCapital: risk.maxActiveCapital,
    maxStrategyAllocation: risk.maxStrategyAllocation,
    maxWeeklyRisk: risk.maxWeeklyRisk,
    maxDrawdown: risk.maxDrawdown,
    minimumCashReserve: risk.minimumCashReserve,
    safeguards: [
      { name: "Protected capital lock", status: risk.protectedCapitalLocked ? "active" : "review", message: "Protected reserve is isolated from experimental strategies." },
      { name: "Maximum active capital", status: "active", message: `Active capital is capped at ${risk.maxActiveCapital}.` },
      { name: "Strategy allocation limit", status: "active", message: `Strategy allocations are capped at ${risk.maxStrategyAllocation}.` },
      { name: "Emergency stop", status: risk.emergencyStopActive ? "engaged" : "ready", message: risk.emergencyStopActive ? "New capital movement is stopped pending review." : "Available to an authorized owner." },
    ],
  };
}

export async function getRisk() {
  const ids = await context();
  const [risk] = await db.select().from(riskStates).where(and(
    eq(riskStates.id, ids.riskStateId),
    eq(riskStates.householdId, ids.householdId),
  )).limit(1);
  if (!risk) throw new Error("Risk state was not found");
  return riskSummary(risk);
}

export async function getRecommendation() {
  const ids = await context();
  const [recommendation] = await db
    .select()
    .from(aiRecommendations)
    .where(and(
      eq(aiRecommendations.id, ids.recommendationId),
      eq(aiRecommendations.householdId, ids.householdId),
    ))
    .limit(1);
  if (!recommendation) throw new Error("Recommendation was not found");
  return {
    id: recommendation.id,
    recommendation: recommendation.recommendation,
    rationale: recommendation.rationale,
    expectedBenefit: recommendation.expectedBenefit,
    riskImpact: recommendation.riskImpact,
    confidence: Number(recommendation.confidence),
    status: recommendation.status,
    advisoryOnly: true,
  };
}

export async function getAuditEvents() {
  const ids = await context();
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.householdId, ids.householdId))
    .orderBy(desc(auditEvents.timestamp))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    actor: row.actor,
    entity: row.entity,
    entityId: row.entityId,
    timestamp: dateTime(row.timestamp),
    reason: row.reason,
  }));
}

export async function getDashboard(actor: Actor) {
  const ids = await context();
  const [goal, portfolio, property, strategiesList, risk, recommendation, recentActivity, accountsList, allocation] =
    await Promise.all([
      getGoals(),
      getPortfolio(),
      getProperty(),
      getStrategies(),
      getRisk(),
      getRecommendation(),
      getAuditEvents(),
      getAccounts(actor),
      currentAllocation(ids.householdId),
    ]);
  return {
    household: await getHousehold(actor),
    goal: goal[0],
    accounts: accountsList,
    allocation,
    portfolio,
    property,
    strategies: strategiesList,
    risk,
    recommendation,
    recentActivity,
  };
}

export async function previewAllocation(input: {
  totalWeekly: string;
  duplexReserve: string;
  capitalOs: string;
  opportunityReserve: string;
}) {
  const ids = await context();
  const currentRule = await currentAllocation(ids.householdId);
  const current: AllocationCents = {
    total: numeric(currentRule.totalWeekly),
    duplexReserve: numeric(currentRule.duplexReserve),
    capitalOs: numeric(currentRule.capitalOs),
    opportunityReserve: numeric(currentRule.opportunityReserve),
  };
  const proposed = {
    duplexReserve: numeric(input.duplexReserve),
    capitalOs: numeric(input.capitalOs),
    opportunityReserve: numeric(input.opportunityReserve),
  };
  const [goal] = await db.select().from(goals).where(and(
    eq(goals.id, ids.goalId),
    eq(goals.householdId, ids.householdId),
  )).limit(1);
  if (!goal) throw new Error("Primary goal was not found");
  const impact = calculateAllocationImpact(current, proposed, {
    amountRemainingCents: Math.max(numeric(goal.targetAmount) - numeric(goal.currentAmount), 0),
    currentDuplexWeeklyCents: current.duplexReserve,
  });
  return {
    current: allocationToRecord(impact.current),
    proposed: allocationToRecord(impact.proposed),
    totalMatches: impact.totalMatches && impact.proposed.total === numeric(input.totalWeekly),
    duplexWeeklyChange: centsToMoney(impact.duplexWeeklyChangeCents),
    projectedDelayWeeks: impact.projectedDelayWeeks,
    protectedSavingsChange: centsToMoney(impact.protectedSavingsChangeCents),
    activeCapitalChange: centsToMoney(impact.activeCapitalChangeCents),
    propertyReadinessImpact: impact.propertyReadinessImpact,
  };
}

export async function updateAllocation(actor: Actor, input: {
  totalWeekly: string;
  duplexReserve: string;
  capitalOs: string;
  opportunityReserve: string;
}) {
  assertPermission(actor.role, "allocate");
  const ids = await context();
  const impact = await previewAllocation(input);
  if (!impact.totalMatches) {
    throw new GovernanceError("INVALID_STATE", "Allocation sleeves must add up to the stated weekly contribution");
  }
  const [updated] = await db.transaction(async (tx) => {
    await tx
      .update(allocationRules)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(allocationRules.householdId, ids.householdId), eq(allocationRules.active, true)));
    return tx
      .insert(allocationRules)
      .values({
        householdId: ids.householdId,
        totalWeekly: input.totalWeekly,
        duplexReserve: input.duplexReserve,
        capitalOs: input.capitalOs,
        opportunityReserve: input.opportunityReserve,
        active: true,
        createdBy: ids.ownerId,
      })
      .returning();
  });
  await db.insert(auditEvents).values({
    householdId: ids.householdId,
    eventType: "allocation_rule_updated",
    actor: ids.ownerId,
    entity: "allocation_rule",
    entityId: updated.id,
    afterState: impact.proposed,
    reason: "Allocation impact reviewed before saving",
  });
  return {
    totalWeekly: updated.totalWeekly,
    duplexReserve: updated.duplexReserve,
    capitalOs: updated.capitalOs,
    opportunityReserve: updated.opportunityReserve,
  };
}

function splitContribution(amountCents: number, rule: AllocationCents) {
  const duplex = Math.floor((amountCents * rule.duplexReserve) / rule.total);
  const capitalOs = Math.floor((amountCents * rule.capitalOs) / rule.total);
  const opportunity = amountCents - duplex - capitalOs;
  return { duplex, capitalOs, opportunity };
}

async function adjustBalance(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], accountId: string, cents: number) {
  const rows = await tx
    .update(accounts)
    .set({ balance: sql`${accounts.balance} + ${centsToMoney(cents)}`, updatedAt: new Date() })
    .where(and(
      eq(accounts.id, accountId),
      cents < 0 ? sql`${accounts.balance} >= ${centsToMoney(Math.abs(cents))}` : sql`true`,
    ))
    .returning({ id: accounts.id });
  if (!rows[0]) {
    throw new GovernanceError(
      "RISK_BLOCKED",
      cents < 0 ? "Source account does not have sufficient available capital" : "Account balance could not be updated",
    );
  }
}

async function lockIdempotency(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  householdId: string,
  idempotencyKey: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`capital-movement:${householdId}:${idempotencyKey}`}, 0))`);
}

async function writeMovement(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    householdId: string;
    sourceAccountId: string;
    destinationAccountId: string;
    amountCents: number;
    category: "contribution" | "transfer" | "strategy_allocation";
    createdBy: string;
    idempotencyKey?: string;
    metadata: Record<string, unknown>;
  },
) {
  const amount = centsToMoney(input.amountCents);
  const [source, destination] = await Promise.all([
    tx.select({ id: accounts.id }).from(accounts).where(and(
      eq(accounts.id, input.sourceAccountId),
      eq(accounts.householdId, input.householdId),
      eq(accounts.executionOnly, false),
    )).limit(1),
    tx.select({ id: accounts.id }).from(accounts).where(and(
      eq(accounts.id, input.destinationAccountId),
      eq(accounts.householdId, input.householdId),
      eq(accounts.executionOnly, false),
    )).limit(1),
  ]);
  if (!source[0] || !destination[0]) {
    throw new GovernanceError("INVALID_STATE", "Capital movement accounts are not registered for this household");
  }
  const [transaction] = await tx
    .insert(ledgerTransactions)
    .values({
      householdId: input.householdId,
      sourceAccountId: input.sourceAccountId,
      destinationAccountId: input.destinationAccountId,
      amount,
      category: input.category,
      status: "completed",
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    })
    .returning({ id: ledgerTransactions.id });
  await tx.insert(ledgerEntries).values([
    { transactionId: transaction.id, accountId: input.sourceAccountId, debit: amount, credit: "0.00" },
    { transactionId: transaction.id, accountId: input.destinationAccountId, debit: "0.00", credit: amount },
  ]);
  await adjustBalance(tx, input.sourceAccountId, -input.amountCents);
  await adjustBalance(tx, input.destinationAccountId, input.amountCents);
  return transaction.id;
}

export async function recordContribution(actor: Actor, input: { amount: string; goalId?: string | null; note?: string | null }, idempotencyKey: string) {
  assertPermission(actor.role, "contribute");
  const ids = await context();
  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents <= 0) throw new GovernanceError("INVALID_STATE", "Contribution amount must be greater than zero");
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, ids.householdId, idempotencyKey);
    const existing = await tx
      .select()
      .from(contributions)
      .where(and(eq(contributions.householdId, ids.householdId), eq(contributions.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing[0]) {
      if (numeric(existing[0].amount) !== amountCents) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different amount");
      return {
        id: existing[0].id,
        amount: existing[0].amount,
        status: existing[0].status,
        createdAt: dateTime(existing[0].createdAt),
        idempotencyKey: existing[0].idempotencyKey,
        metadata: existing[0].metadata ?? {},
      };
    }
    const [rule] = await tx
      .select()
      .from(allocationRules)
      .where(and(eq(allocationRules.householdId, ids.householdId), eq(allocationRules.active, true)))
      .orderBy(desc(allocationRules.createdAt))
      .limit(1);
    if (!rule) throw new GovernanceError("INVALID_STATE", "Active allocation rule is missing");
    const allocation: AllocationCents = {
      total: numeric(rule.totalWeekly),
      duplexReserve: numeric(rule.duplexReserve),
      capitalOs: numeric(rule.capitalOs),
      opportunityReserve: numeric(rule.opportunityReserve),
    };
    const split = splitContribution(amountCents, allocation);
    const goalId = input.goalId ?? ids.goalId;
    const [goal] = await tx.select().from(goals).where(and(
      eq(goals.id, goalId),
      eq(goals.householdId, ids.householdId),
    )).limit(1);
    if (!goal) throw new GovernanceError("INVALID_STATE", "Contribution goal was not found");
    const [treasury] = await tx.select().from(accounts).where(and(
      eq(accounts.id, ids.treasuryAccountId),
      eq(accounts.householdId, ids.householdId),
    )).limit(1);
    if (!treasury) throw new GovernanceError("INVALID_STATE", "Treasury account was not found");
    const destinations = [
      [ids.duplexAccountId, split.duplex],
      [ids.capitalOsAccountId, split.capitalOs],
      [ids.opportunityAccountId, split.opportunity],
    ] as const;
    for (const [destinationAccountId, cents] of destinations) {
      if (cents > 0) {
        await writeMovement(tx, {
          householdId: ids.householdId,
          sourceAccountId: treasury.id,
          destinationAccountId,
          amountCents: cents,
          category: "contribution",
          createdBy: actor.userId,
          metadata: { idempotencyKey, note: input.note ?? null },
        });
      }
    }
    const [contribution] = await tx
      .insert(contributions)
      .values({
        householdId: ids.householdId,
        goalId,
        allocationRuleId: rule.id,
        amount: centsToMoney(amountCents),
        status: "completed",
        idempotencyKey,
        createdBy: actor.userId,
        metadata: { split, note: input.note ?? null },
      })
      .returning();
    await tx
      .update(goals)
      .set({
        currentAmount: sql`${goals.currentAmount} + ${centsToMoney(split.duplex)}`,
        protectedAmount: sql`${goals.protectedAmount} + ${centsToMoney(split.duplex)}`,
        updatedAt: new Date(),
      })
      .where(and(eq(goals.id, goalId), eq(goals.householdId, ids.householdId)));
    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "contribution_completed",
      actor: actor.userId,
      entity: "contribution",
      entityId: contribution.id,
      reason: input.note ?? "Contribution recorded",
      metadata: { idempotencyKey, amount: centsToMoney(amountCents), split },
    });
    return {
      id: contribution.id,
      amount: contribution.amount,
      status: contribution.status,
      createdAt: dateTime(contribution.createdAt),
      idempotencyKey: contribution.idempotencyKey,
      metadata: contribution.metadata ?? {},
    };
  });
}

export async function createTransfer(
  actor: Actor,
  input: { sourceAccountId: string; destinationAccountId: string; amount: string; note?: string | null },
  idempotencyKey: string,
) {
  assertPermission(actor.role, "transfer");
  const ids = await context();
  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents <= 0) throw new GovernanceError("INVALID_STATE", "Transfer amount must be greater than zero");
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, ids.householdId, idempotencyKey);
    const existing = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.householdId, ids.householdId), eq(ledgerTransactions.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing[0]) {
      if (numeric(existing[0].amount) !== amountCents) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different amount");
      return {
        id: existing[0].id,
        amount: existing[0].amount,
        category: existing[0].category,
        status: existing[0].status,
        createdAt: dateTime(existing[0].timestamp),
      };
    }
    const [source] = await tx.select().from(accounts).where(and(
      eq(accounts.id, input.sourceAccountId),
      eq(accounts.householdId, ids.householdId),
      eq(accounts.executionOnly, false),
    )).limit(1);
    const [destination] = await tx.select().from(accounts).where(and(
      eq(accounts.id, input.destinationAccountId),
      eq(accounts.householdId, ids.householdId),
      eq(accounts.executionOnly, false),
    )).limit(1);
    if (!source || !destination || source.id === destination.id) throw new GovernanceError("INVALID_STATE", "Transfer accounts are invalid");
    const [risk] = await tx.select().from(riskStates).where(and(
      eq(riskStates.id, ids.riskStateId),
      eq(riskStates.householdId, ids.householdId),
    )).limit(1);
    if (risk?.emergencyStopActive) throw new GovernanceError("RISK_BLOCKED", "Capital movement is stopped by the emergency governor");
    if (source.protected && (destination.riskClass === "experimental" || destination.accountType === "strategy_capital")) {
      assertAllocationAllowed({
        proposedStrategyAllocationCents: amountCents,
        activeCapitalCents: 0,
        protectedCapitalCents: numeric(source.balance),
        maxStrategyAllocationCents: numeric(risk?.maxStrategyAllocation),
        maxActiveCapitalCents: numeric(risk?.maxActiveCapital),
        protectedCapitalLocked: risk?.protectedCapitalLocked ?? true,
        sourceAccountProtected: true,
      });
    }
    const transactionId = await writeMovement(tx, {
      householdId: ids.householdId,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amountCents,
      category: "transfer",
      createdBy: actor.userId,
      idempotencyKey,
      metadata: { idempotencyKey, note: input.note ?? null },
    });
    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "transfer_completed",
      actor: actor.userId,
      entity: "ledger_transaction",
      entityId: transactionId,
      reason: input.note ?? "Internal transfer completed",
      metadata: { idempotencyKey, sourceAccountId: source.id, destinationAccountId: destination.id },
    });
    const [transaction] = await tx.select().from(ledgerTransactions).where(and(
      eq(ledgerTransactions.id, transactionId),
      eq(ledgerTransactions.householdId, ids.householdId),
    )).limit(1);
    return {
      id: transaction.id,
      amount: transaction.amount,
      category: transaction.category,
      status: transaction.status,
      createdAt: dateTime(transaction.timestamp),
    };
  });
}

export async function promoteStrategy(actor: Actor, strategyId: string, input: {
  toStage: string;
  authorizedOverride?: boolean;
  evidence: { minimumObservations: boolean; reconciliationAccurate: boolean; noCriticalErrors: boolean };
}) {
  assertPermission(actor.role, "approve");
  const ids = await context();
  const [strategy] = await db.select().from(strategies).where(and(eq(strategies.id, strategyId), eq(strategies.householdId, ids.householdId))).limit(1);
  if (!strategy) throw new GovernanceError("INVALID_STATE", "Strategy was not found");
  const [performance] = await db
    .select()
    .from(strategyPerformance)
    .where(eq(strategyPerformance.strategyId, strategy.id))
    .orderBy(desc(strategyPerformance.capturedAt))
    .limit(1);
  const computedEvidence = {
    minimumObservations: Number(performance?.observations ?? 0) >= 100,
    reconciliationAccurate: Number(performance?.reconciliationAccuracy ?? 0) >= 0.999,
    noCriticalErrors: Number(performance?.criticalErrorCount ?? 1) === 0,
  };
  assertStrategyPromotion({
    fromStage: strategy.stage as StrategyStage,
    toStage: input.toStage as StrategyStage,
    authorizedOverride: input.authorizedOverride,
    evidence: computedEvidence,
  });
  const [updated] = await db
    .update(strategies)
    .set({ stage: input.toStage as StrategyStage, updatedAt: new Date() })
     .where(and(eq(strategies.id, strategy.id), eq(strategies.householdId, ids.householdId)))
    .returning();
  await db.insert(auditEvents).values({
    householdId: ids.householdId,
    eventType: input.authorizedOverride ? "strategy_stage_override" : "strategy_stage_promoted",
     actor: actor.userId,
    entity: "strategy",
    entityId: strategy.id,
    beforeState: { stage: strategy.stage },
    afterState: { stage: input.toStage },
    reason: input.authorizedOverride ? "Authorized administrative override" : "Evidence-backed stage promotion",
    metadata: { submittedEvidence: input.evidence, computedEvidence },
  });
  return strategySummary(updated, performance);
}

export async function allocateStrategy(
  actor: Actor,
  strategyId: string,
  input: { sourceAccountId: string; amount: string },
  idempotencyKey: string,
) {
  assertPermission(actor.role, "allocate");
  const ids = await context();
  const amountCents = parseMoneyToCents(input.amount);
  if (amountCents <= 0) throw new GovernanceError("INVALID_STATE", "Strategy allocation must be greater than zero");
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, ids.householdId, idempotencyKey);
    const [existing] = await tx
      .select()
      .from(ledgerTransactions)
      .where(and(eq(ledgerTransactions.householdId, ids.householdId), eq(ledgerTransactions.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      if (numeric(existing.amount) !== amountCents) throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different amount");
      return {
        id: existing.id,
        amount: existing.amount,
        category: existing.category,
        status: existing.status,
        createdAt: dateTime(existing.timestamp),
      };
    }
    const [strategy] = await tx
      .select()
      .from(strategies)
      .where(and(eq(strategies.id, strategyId), eq(strategies.householdId, ids.householdId)))
      .limit(1);
    if (!strategy) throw new GovernanceError("INVALID_STATE", "Strategy was not found");
    if (strategy.stage !== "approved" && strategy.stage !== "production") {
      throw new GovernanceError("INVALID_STATE", "Strategy capital requires an approved strategy stage");
    }
    const [source] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, input.sourceAccountId), eq(accounts.householdId, ids.householdId)))
      .limit(1);
    const [destination] = await tx
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, ids.strategyCapitalAccountId), eq(accounts.householdId, ids.householdId)))
      .limit(1);
    const [risk] = await tx.select().from(riskStates).where(and(
      eq(riskStates.id, ids.riskStateId),
      eq(riskStates.householdId, ids.householdId),
    )).limit(1);
    if (!source || !destination || !risk) throw new GovernanceError("INVALID_STATE", "Strategy capital accounts are unavailable");
    const allAccounts = await tx.select().from(accounts).where(eq(accounts.householdId, ids.householdId));
    const activeCapitalCents = allAccounts
      .filter((account) => account.accountType === "active_capital" || account.accountType === "strategy_capital")
      .reduce((sum, account) => sum + numeric(account.balance), 0);
    const protectedCapitalCents = allAccounts
      .filter((account) => account.protected)
      .reduce((sum, account) => sum + numeric(account.balance), 0);
    assertAllocationAllowed({
      proposedStrategyAllocationCents: amountCents,
      activeCapitalCents,
      protectedCapitalCents,
      maxStrategyAllocationCents: numeric(risk.maxStrategyAllocation),
      maxActiveCapitalCents: numeric(risk.maxActiveCapital),
      protectedCapitalLocked: risk.protectedCapitalLocked,
      sourceAccountProtected: source.protected,
    });
    const transactionId = await writeMovement(tx, {
      householdId: ids.householdId,
      sourceAccountId: source.id,
      destinationAccountId: destination.id,
      amountCents,
      category: "strategy_allocation",
      createdBy: actor.userId,
      idempotencyKey,
      metadata: { idempotencyKey, strategyId },
    });
    await tx
      .update(strategies)
      .set({ allocation: sql`${strategies.allocation} + ${centsToMoney(amountCents)}`, updatedAt: new Date() })
      .where(and(eq(strategies.id, strategy.id), eq(strategies.householdId, ids.householdId)));
    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "strategy_allocation_completed",
      actor: actor.userId,
      entity: "strategy",
      entityId: strategy.id,
      reason: "Approved strategy allocation",
      metadata: { transactionId, sourceAccountId: source.id, amount: centsToMoney(amountCents) },
    });
    const [transaction] = await tx.select().from(ledgerTransactions).where(and(
      eq(ledgerTransactions.id, transactionId),
      eq(ledgerTransactions.householdId, ids.householdId),
    )).limit(1);
    return {
      id: transaction.id,
      amount: transaction.amount,
      category: transaction.category,
      status: transaction.status,
      createdAt: dateTime(transaction.timestamp),
    };
  });
}

export async function activateEmergencyStop(actor: Actor, confirmed: boolean, reason: string) {
  assertPermission(actor.role, "manage_risk");
  if (!confirmed) throw new GovernanceError("INVALID_STATE", "Emergency stop must be explicitly confirmed");
  const ids = await context();
  const [updated] = await db
    .update(riskStates)
    .set({ state: "locked", emergencyStopActive: true, updatedAt: new Date() })
    .where(and(eq(riskStates.id, ids.riskStateId), eq(riskStates.householdId, ids.householdId)))
    .returning();
  await db.insert(auditEvents).values({
    householdId: ids.householdId,
    eventType: "emergency_stop_activated",
    actor: actor.userId,
    entity: "risk_state",
    entityId: ids.riskStateId,
    afterState: { state: "locked", emergencyStopActive: true },
    reason,
  });
  return riskSummary(updated);
}

export async function listRecommendations() {
  const ids = await context();
  const rows = await db.select().from(aiRecommendations).where(eq(aiRecommendations.householdId, ids.householdId)).orderBy(desc(aiRecommendations.createdAt));
  return rows.map((recommendation) => ({
    id: recommendation.id,
    recommendation: recommendation.recommendation,
    rationale: recommendation.rationale,
    expectedBenefit: recommendation.expectedBenefit,
    riskImpact: recommendation.riskImpact,
    confidence: Number(recommendation.confidence),
    status: recommendation.status,
    advisoryOnly: true,
  }));
}

export async function decideRecommendation(actor: Actor, recommendationId: string, decision: "approved" | "rejected", reason: string) {
  assertPermission(actor.role, "approve");
  assertAIActionAllowed("move_money");
  const ids = await context();
  const [recommendation] = await db.select().from(aiRecommendations).where(and(eq(aiRecommendations.id, recommendationId), eq(aiRecommendations.householdId, ids.householdId))).limit(1);
  if (!recommendation) throw new GovernanceError("INVALID_STATE", "Recommendation was not found");
  const [updated] = await db.update(aiRecommendations).set({ status: decision, reviewedAt: new Date(), reviewedBy: actor.userId }).where(and(
    eq(aiRecommendations.id, recommendation.id),
    eq(aiRecommendations.householdId, ids.householdId),
  )).returning();
  await db.insert(auditEvents).values({
    householdId: ids.householdId,
    eventType: "recommendation_decided",
    actor: actor.userId,
    entity: "ai_recommendation",
    entityId: recommendation.id,
    beforeState: { status: recommendation.status },
    afterState: { status: decision },
    reason,
    metadata: { advisoryOnly: true },
  });
  return {
    id: updated.id,
    recommendation: updated.recommendation,
    rationale: updated.rationale,
    expectedBenefit: updated.expectedBenefit,
    riskImpact: updated.riskImpact,
    confidence: Number(updated.confidence),
    status: updated.status,
    advisoryOnly: true,
  };
}

export async function addPropertyNote(actor: Actor, propertyGoalId: string, body: string) {
  assertPermission(actor.role, "contribute");
  const ids = await context();
  if (propertyGoalId !== ids.propertyGoalId) throw new GovernanceError("INVALID_STATE", "Property goal was not found");
  const [property] = await db.select({ id: propertyGoals.id }).from(propertyGoals).where(and(
    eq(propertyGoals.id, propertyGoalId),
    eq(propertyGoals.householdId, ids.householdId),
  )).limit(1);
  if (!property) throw new GovernanceError("INVALID_STATE", "Property goal was not found");
  const [note] = await db.insert(propertyNotes).values({ propertyGoalId, body, createdBy: actor.userId }).returning();
  await db.insert(auditEvents).values({
    householdId: ids.householdId,
    eventType: "property_note_created",
    actor: actor.userId,
    entity: "property_note",
    entityId: note.id,
    reason: "Private property research note added",
  });
  return { id: note.id, propertyGoalId: note.propertyGoalId, body: note.body, createdAt: dateTime(note.createdAt) };
}

export function getBlockchainStatus() {
  return {
    enabled: false,
    preferredChain: futureCapitalVaultInterface.preferredChain,
    chains: Object.entries(chainAdapters).map(([name]) => ({
      name,
      chainId: Number(name === "arbitrum" ? 42161 : name === "base" ? 8453 : 1),
      enabled: false,
    })),
    privateDataOffChain: true,
    liveTransactionsEnabled: false,
  };
}

export function getReports() {
  return reportDescriptors;
}