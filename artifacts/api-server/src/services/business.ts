import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  businessDistributions,
  businessEntities,
  businessExpenses,
  businessReserves,
  businessRevenue,
  financialAccounts,
  auditEvents,
  idempotencyKeys,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { ensureSeedData, isDemoHousehold } from "./seed";
import { assertPermission, GovernanceError } from "../domain/governance";
import { calculateBusinessCapital, calculateBusinessHealth, assertDistributionWithinReserve } from "../domain/business";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";

const today = () => new Date().toISOString().slice(0, 10);

function entityResponse(row: typeof businessEntities.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, einReference: _einReference, ...response } = row;
  return response;
}
function revenueResponse(row: typeof businessRevenue.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return response;
}
function expenseResponse(row: typeof businessExpenses.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return response;
}
function reserveResponse(row: typeof businessReserves.$inferSelect) {
  const { id: _id, householdId: _householdId, updatedBy: _updatedBy, ...response } = row;
  return response;
}
function distributionResponse(row: typeof businessDistributions.$inferSelect) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return response;
}

const BUSINESS_DISTRIBUTION_OPERATION = "business_distribution.create";

function serializeIdempotentResponse(response: Record<string, unknown>, input: unknown) {
  return JSON.parse(JSON.stringify({
    response,
    fingerprint: JSON.stringify(input),
  })) as Record<string, unknown>;
}

function replayIdempotentResponse(row: typeof idempotencyKeys.$inferSelect, operation: string, input: unknown) {
  if (row.operation !== operation || !row.responseBody || row.responseBody.fingerprint !== JSON.stringify(input)) {
    throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for a different request");
  }
  return row.responseBody.response as Record<string, unknown>;
}

async function lockIdempotency(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  householdId: string,
  operation: string,
  idempotencyKey: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${operation}:${householdId}:${idempotencyKey}`}, 0))`);
}

async function ensureBusinessSeed(householdId: string, ownerId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`business-seed:${householdId}`}))`);
    const [existing] = await tx.select().from(businessEntities).where(eq(businessEntities.householdId, householdId)).limit(1);
    if (existing) return;
    const [business] = await tx.insert(businessEntities).values({
      householdId,
      legalName: "Morgan Digital Works LLC",
      displayName: "Morgan Digital Works",
      entityType: "single_member_llc",
      ownershipPercentage: "100.000",
      taxClassification: "disregarded_entity",
      industry: "Professional services",
      status: "active",
      formationDate: "2024-02-12",
      state: "Illinois",
      notes: "Operating business tracked separately from household cash.",
      createdBy: ownerId,
    }).returning();
    await tx.insert(financialAccounts).values({
      householdId,
      institution: "Manual business ledger",
      nickname: "Business operating",
      accountType: "business_checking",
      currentBalance: "18500.00",
      availableBalance: "18500.00",
      includedInBudget: false,
      includedInNetWorth: true,
      businessEntityId: business.id,
      connectionStatus: "manual",
      dataSource: "manual",
      lastSync: new Date(),
      lastSuccessfulSync: new Date(),
    });
    await tx.insert(businessRevenue).values([
      { householdId, businessId: business.id, revenueDate: "2026-09-01", category: "services", amount: "12500.00", customer: "Northstar", description: "September retainer", recurring: true, createdBy: ownerId },
      { householdId, businessId: business.id, revenueDate: "2026-09-01", category: "services", amount: "7000.00", customer: "Cedar Labs", description: "Product advisory", recurring: true, createdBy: ownerId },
      { householdId, businessId: business.id, revenueDate: "2026-09-01", category: "project", amount: "3000.00", customer: "Fieldstone", description: "Implementation milestone", recurring: false, createdBy: ownerId },
    ]);
    await tx.insert(businessExpenses).values([
      { householdId, businessId: business.id, expenseDate: "2026-09-01", category: "contractors", amount: "7200.00", description: "Contract delivery support", createdBy: ownerId },
      { householdId, businessId: business.id, expenseDate: "2026-09-01", category: "software", amount: "1450.00", description: "Operating software", createdBy: ownerId },
      { householdId, businessId: business.id, expenseDate: "2026-09-01", category: "insurance", amount: "650.00", description: "Business insurance", createdBy: ownerId },
    ]);
    await tx.insert(businessReserves).values({
      householdId,
      businessId: business.id,
      targetMethod: "three_months_fixed",
      targetAmount: "12000.00",
      taxReserve: "2000.00",
      safetyBuffer: "1000.00",
      updatedBy: ownerId,
    });
    await tx.insert(businessDistributions).values([
      { householdId, businessId: business.id, distributionDate: "2026-08-15", amount: "1200.00", status: "completed", notes: "Recorded owner distribution", createdBy: ownerId },
      { householdId, businessId: business.id, distributionDate: "2026-09-01", amount: "800.00", status: "proposed", notes: "Awaiting owner review", createdBy: ownerId },
    ]);
  });
}

async function loadBusinessData() {
  const ids = await ensureSeedData();
  if (await isDemoHousehold(ids.householdId)) {
    await ensureBusinessSeed(ids.householdId, ids.ownerId);
  }
  const [businesses, revenue, expenses, reserves, distributions, accounts] = await Promise.all([
    db.select().from(businessEntities).where(eq(businessEntities.householdId, ids.householdId)).orderBy(businessEntities.displayName),
    db.select().from(businessRevenue).where(eq(businessRevenue.householdId, ids.householdId)).orderBy(desc(businessRevenue.revenueDate)),
    db.select().from(businessExpenses).where(eq(businessExpenses.householdId, ids.householdId)).orderBy(desc(businessExpenses.expenseDate)),
    db.select().from(businessReserves).where(eq(businessReserves.householdId, ids.householdId)),
    db.select().from(businessDistributions).where(eq(businessDistributions.householdId, ids.householdId)).orderBy(desc(businessDistributions.distributionDate)),
    db.select().from(financialAccounts).where(and(eq(financialAccounts.householdId, ids.householdId), sql`${financialAccounts.businessEntityId} is not null`)),
  ]);
  return { ids, businesses, revenue, expenses, reserves, distributions, accounts };
}

export async function getBusinessOverview(_actor: Actor) {
  const data = await loadBusinessData();
  const month = today().slice(0, 7);
  let totalRevenue = 0, totalExpenses = 0, totalDistributions = 0, businessCash = 0, ownedEquity = 0, safeToDistribute = 0;
  for (const business of data.businesses) {
    const revenue = data.revenue.filter((row) => row.businessId === business.id);
    const expenses = data.expenses.filter((row) => row.businessId === business.id);
    const distributions = data.distributions.filter((row) => row.businessId === business.id);
    const reserve = data.reserves.find((row) => row.businessId === business.id);
    const cash = data.accounts.filter((row) => row.businessEntityId === business.id).reduce((sum, row) => sum + parseMoneyToCents(row.currentBalance), 0);
    const result = calculateBusinessCapital({
      revenue,
      expenses,
      distributions,
      businessCash: centsToMoney(cash),
      reserveTarget: reserve?.targetAmount ?? "0.00",
      taxReserve: reserve?.taxReserve ?? "0.00",
      safetyBuffer: reserve?.safetyBuffer ?? "0.00",
      ownershipPercentage: business.ownershipPercentage,
    });
    totalRevenue += result.revenueCents;
    totalExpenses += result.expenseCents;
    totalDistributions += result.distributionCents;
    businessCash += cash;
    ownedEquity += result.ownedEquityCents;
    safeToDistribute += result.safeToDistributeCents;
  }
  const completedOwnerPay = data.distributions.filter((row) => row.status === "completed").reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0);
  const monthlyExpenses = totalExpenses / Math.max(1, new Set(data.expenses.map((row) => row.expenseDate.slice(0, 7))).size);
  const reserveTotal = data.reserves.reduce((sum, row) => sum + parseMoneyToCents(row.targetAmount) + parseMoneyToCents(row.taxReserve) + parseMoneyToCents(row.safetyBuffer), 0);
  const customerTotals = new Map<string, number>();
  for (const row of data.revenue) customerTotals.set(row.customer ?? "Other", (customerTotals.get(row.customer ?? "Other") ?? 0) + parseMoneyToCents(row.amount));
  const concentration = totalRevenue > 0 ? Math.max(0, ...customerTotals.values()) / totalRevenue * 100 : 0;
  const profit = totalRevenue - totalExpenses;
  const reserveCoverageMonths = monthlyExpenses > 0 ? reserveTotal / monthlyExpenses : 0;
  return {
    asOf: today(),
    totals: {
      totalRevenue: centsToMoney(totalRevenue),
      businessProfit: centsToMoney(profit),
      ownerDistributions: centsToMoney(totalDistributions),
      businessCash: centsToMoney(businessCash),
      businessLiabilities: "0.00",
      estimatedBusinessEquity: centsToMoney(ownedEquity),
      activeBusinesses: data.businesses.filter((row) => row.status === "active").length,
      revenueThisMonth: centsToMoney(data.revenue.filter((row) => row.revenueDate.startsWith(month)).reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0)),
      profitMargin: totalRevenue > 0 ? Math.round(profit / totalRevenue * 1000) / 10 : 0,
      ownerPay: centsToMoney(completedOwnerPay),
      reserveCoverageMonths: Math.round(reserveCoverageMonths * 10) / 10,
      householdIncomeContribution: centsToMoney(completedOwnerPay),
      incomeConcentration: Math.round(concentration * 10) / 10,
      safeToDistribute: centsToMoney(safeToDistribute),
    },
    health: calculateBusinessHealth({ profitCents: profit, revenueCents: totalRevenue, reserveCoverageMonths, concentrationPercent: concentration }),
    businesses: data.businesses.map(entityResponse),
    recentRevenue: data.revenue.slice(0, 8).map(revenueResponse),
    recentExpenses: data.expenses.slice(0, 8).map(expenseResponse),
    distributions: data.distributions.slice(0, 8).map(distributionResponse),
  };
}

export async function listBusinessEntities(_actor: Actor) {
  const data = await loadBusinessData();
  return data.businesses.map(entityResponse);
}

type BusinessEntityInput = {
  legalName: string; displayName: string; entityType: string; ownershipPercentage: string;
  taxClassification?: string; industry?: string; status?: string; formationDate?: Date; state?: string; notes?: string;
};
type BusinessEntityUpdate = Partial<Omit<BusinessEntityInput, "legalName">>;
type RevenueInput = { businessId: string; revenueDate: Date; category: string; amount: string; customer?: string; description: string; recurring?: boolean };
type ExpenseInput = { businessId: string; expenseDate: Date; category: string; amount: string; description: string; expenseType?: string; classification?: string };
type DistributionInput = { businessId: string; distributionDate: Date; amount: string; householdDestination?: string; notes?: string };

export async function createBusinessEntity(actor: Actor, input: BusinessEntityInput) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureSeedData();
  if (Number(input.ownershipPercentage) <= 0 || Number(input.ownershipPercentage) > 100) throw new Error("Ownership percentage must be greater than 0 and no more than 100");
  const [row] = await db.insert(businessEntities).values({ ...input, formationDate: input.formationDate?.toISOString().slice(0, 10), householdId: ids.householdId, createdBy: actor.userId }).returning();
  await db.insert(businessReserves).values({ householdId: ids.householdId, businessId: row.id, updatedBy: actor.userId });
  return entityResponse(row);
}

export async function updateBusinessEntity(actor: Actor, businessId: string, input: BusinessEntityUpdate) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureSeedData();
  if (input.ownershipPercentage != null && (Number(input.ownershipPercentage) <= 0 || Number(input.ownershipPercentage) > 100)) throw new Error("Ownership percentage must be greater than 0 and no more than 100");
  const [row] = await db.update(businessEntities).set({
    displayName: input.displayName,
    entityType: input.entityType,
    ownershipPercentage: input.ownershipPercentage,
    taxClassification: input.taxClassification,
    industry: input.industry,
    status: input.status,
    formationDate: input.formationDate?.toISOString().slice(0, 10),
    state: input.state,
    notes: input.notes,
    updatedAt: new Date(),
  }).where(and(eq(businessEntities.id, businessId), eq(businessEntities.householdId, ids.householdId))).returning();
  if (!row) throw new Error("Business not found");
  return entityResponse(row);
}

async function assertBusiness(householdId: string, businessId: string) {
  const [row] = await db.select({ id: businessEntities.id }).from(businessEntities).where(and(eq(businessEntities.id, businessId), eq(businessEntities.householdId, householdId))).limit(1);
  if (!row) throw new Error("Business not found");
}

export async function createBusinessRevenue(actor: Actor, input: RevenueInput) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureSeedData();
  await assertBusiness(ids.householdId, input.businessId);
  if (["owner_contribution", "intercompany_transfer"].includes(input.category ?? "")) throw new Error("Owner contributions and intercompany transfers cannot be recorded as revenue");
  const [row] = await db.insert(businessRevenue).values({ ...input, revenueDate: input.revenueDate.toISOString().slice(0, 10), householdId: ids.householdId, createdBy: actor.userId }).returning();
  return revenueResponse(row);
}

export async function createBusinessExpense(actor: Actor, input: ExpenseInput) {
  assertPermission(actor.role, "contribute");
  const ids = await ensureSeedData();
  await assertBusiness(ids.householdId, input.businessId);
  if (input.classification === "owner_distribution") throw new Error("Owner distributions must use the distribution review flow");
  const [row] = await db.insert(businessExpenses).values({ ...input, expenseDate: input.expenseDate.toISOString().slice(0, 10), householdId: ids.householdId, createdBy: actor.userId }).returning();
  return expenseResponse(row);
}

export async function createBusinessDistribution(actor: Actor, input: DistributionInput, idempotencyKey: string) {
  assertPermission(actor.role, "approve");
  const ids = await ensureSeedData();
  return db.transaction(async (tx) => {
    await lockIdempotency(tx, ids.householdId, BUSINESS_DISTRIBUTION_OPERATION, idempotencyKey);
    const [existing] = await tx.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, ids.householdId),
      eq(idempotencyKeys.key, idempotencyKey),
    )).limit(1);
    if (existing) return replayIdempotentResponse(existing, BUSINESS_DISTRIBUTION_OPERATION, input);
    const overview = await getBusinessOverview(actor);
    await assertBusiness(ids.householdId, input.businessId);
    assertDistributionWithinReserve(input.amount, parseMoneyToCents(overview.totals.safeToDistribute));
    const [row] = await tx.insert(businessDistributions).values({
      ...input,
      distributionDate: input.distributionDate.toISOString().slice(0, 10),
      householdId: ids.householdId,
      createdBy: actor.userId,
      status: "proposed",
    }).returning();
    await tx.insert(auditEvents).values({
      householdId: ids.householdId,
      eventType: "business_distribution_proposed",
      actor: actor.userId,
      entity: "business_distribution",
      entityId: row.id,
      reason: input.notes ?? "Business distribution proposed",
      metadata: {
        idempotencyKey,
        amount: row.amount,
        businessId: row.businessId,
      },
    });
    const response = distributionResponse(row);
    await tx.insert(idempotencyKeys).values({
      householdId: ids.householdId,
      key: idempotencyKey,
      operation: BUSINESS_DISTRIBUTION_OPERATION,
      responseStatus: 201,
      responseBody: serializeIdempotentResponse(response, input),
    });
    return response;
  });
}

export async function updateBusinessReserve(actor: Actor, businessId: string, input: Partial<typeof businessReserves.$inferInsert>) {
  assertPermission(actor.role, "approve");
  const ids = await ensureSeedData();
  await assertBusiness(ids.householdId, businessId);
  const [existing] = await db.select().from(businessReserves).where(and(eq(businessReserves.businessId, businessId), eq(businessReserves.householdId, ids.householdId))).limit(1);
  const reserveValues = {
    targetMethod: input.targetMethod,
    targetAmount: input.targetAmount,
    taxReserve: input.taxReserve,
    safetyBuffer: input.safetyBuffer,
  };
  const [row] = existing
    ? await db.update(businessReserves).set({ ...reserveValues, updatedBy: actor.userId, updatedAt: new Date() }).where(and(
      eq(businessReserves.id, existing.id),
      eq(businessReserves.householdId, ids.householdId),
      eq(businessReserves.businessId, businessId),
    )).returning()
    : await db.insert(businessReserves).values({ ...reserveValues, householdId: ids.householdId, businessId, updatedBy: actor.userId }).returning();
  return reserveResponse(row);
}