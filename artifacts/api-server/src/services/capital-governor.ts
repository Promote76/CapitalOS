import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  auditEvents,
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  businessCashPositions,
  capitalEncumbrances,
  capitalGovernorInputSnapshots,
  capitalGovernorPolicies,
  capitalWaterfallRuns,
  emergencyReserves,
  financeBills,
  financeTransactions,
  financialAccounts,
  bankStatementTransactions,
  bankStatementDocuments,
  financialDocuments,
  goals,
  idempotencyKeys,
  protectedCapitalRegistry,
  riskStates,
  treasuryBuckets,
  treasuryPolicies,
  upcomingExpenses,
  verifiedHouseholdIncomeEvents,
} from "@workspace/db";
import { db } from "@workspace/db";
import { assertPermission, GovernanceError } from "../domain/governance";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";
import { calculateCapitalGovernorV2, CAPITAL_WATERFALL_BUCKETS, hasUnresolvedUploadedStatement, type CapitalGovernorInput, type CapitalWaterfallBucket } from "../domain/capital-governor";
import { calculateVariableIncomeProfile } from "../domain/variable-income";
import type { Actor } from "./capital-os";
import { ensureTenantCore } from "./seed";

const today = () => new Date().toISOString().slice(0, 10);
const cents = (value: string | number | null | undefined) => parseMoneyToCents(String(value ?? "0"));
const addDays = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (left: string, right: string) =>
  Math.max(0, Math.floor((Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / 86_400_000));

function policyResponse(row: typeof capitalGovernorPolicies.$inferSelect | undefined, treasury: typeof treasuryPolicies.$inferSelect | undefined) {
  return {
    version: row?.version ?? "2",
    householdCashBufferCents: cents(row?.householdCashBuffer ?? treasury?.minimumOperatingCash),
    medicalReserveCents: cents(row?.medicalReserve),
    vehicleReserveMonths: row?.vehicleReserveMonths ?? 3,
    annualObligationMonths: row?.annualObligationMonths ?? 1,
    maximumInvestmentPercent: Number(row?.maximumInvestmentPercent ?? treasury?.maximumStrategyPercent ?? "15"),
    waterfall: (row?.waterfall?.length ? row.waterfall : [...CAPITAL_WATERFALL_BUCKETS]) as CapitalWaterfallBucket[],
  };
}

function responseShape(result: ReturnType<typeof calculateCapitalGovernorV2>, snapshotId: string | null, waterfallRunId: string | null) {
  return { ...result, inputSnapshotId: snapshotId, waterfallRunId };
}

export async function buildCapitalGovernorInput(actor: Actor, asOf = today()): Promise<CapitalGovernorInput> {
  assertPermission(actor.role, "read");
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const [accounts, bills, upcoming, emergencyRows, goalsRows, periods, incomeEvents, transactions, treasury, treasuryPolicyRows, governorPolicyRows, encumbrances, protectedEntries, riskRows, businessCashRows, statementEvidenceRows, statementDocuments, bankEvidenceDocuments] = await Promise.all([
    db.select().from(financialAccounts).where(eq(financialAccounts.householdId, ids.householdId)),
    db.select().from(financeBills).where(and(eq(financeBills.householdId, ids.householdId), eq(financeBills.active, true))),
    db.select().from(upcomingExpenses).where(and(eq(upcomingExpenses.householdId, ids.householdId), eq(upcomingExpenses.active, true))),
    db.select().from(emergencyReserves).where(eq(emergencyReserves.householdId, ids.householdId)).limit(1),
    db.select().from(goals).where(eq(goals.householdId, ids.householdId)),
    db.select().from(budgetPlanningPeriods).where(and(eq(budgetPlanningPeriods.householdId, ids.householdId), eq(budgetPlanningPeriods.month, monthStart), sql`${budgetPlanningPeriods.status} in ('approved', 'closed')`)).limit(1),
    db.select().from(verifiedHouseholdIncomeEvents).where(and(eq(verifiedHouseholdIncomeEvents.householdId, ids.householdId), eq(verifiedHouseholdIncomeEvents.verificationStatus, "verified"))).orderBy(desc(verifiedHouseholdIncomeEvents.incomeDate)),
    db.select().from(financeTransactions).where(eq(financeTransactions.householdId, ids.householdId)),
    db.select().from(treasuryBuckets).where(eq(treasuryBuckets.householdId, ids.householdId)).orderBy(asc(treasuryBuckets.priority)),
    db.select().from(treasuryPolicies).where(eq(treasuryPolicies.householdId, ids.householdId)).limit(1),
    db.select().from(capitalGovernorPolicies).where(eq(capitalGovernorPolicies.householdId, ids.householdId)).limit(1),
    db.select().from(capitalEncumbrances).where(and(eq(capitalEncumbrances.householdId, ids.householdId), eq(capitalEncumbrances.status, "active"))),
    db.select().from(protectedCapitalRegistry).where(and(eq(protectedCapitalRegistry.householdId, ids.householdId), eq(protectedCapitalRegistry.locked, 1))),
    db.select({ protectedCapitalLocked: riskStates.protectedCapitalLocked }).from(riskStates).where(and(eq(riskStates.id, ids.riskStateId), eq(riskStates.householdId, ids.householdId))).limit(1),
    db.select().from(businessCashPositions).where(eq(businessCashPositions.householdId, ids.householdId)),
    db.select({ reviewStatus: bankStatementTransactions.reviewStatus }).from(bankStatementTransactions)
      .where(eq(bankStatementTransactions.householdId, ids.householdId)),
    db.select({ documentId: bankStatementDocuments.documentId, status: bankStatementDocuments.status }).from(bankStatementDocuments)
      .where(eq(bankStatementDocuments.householdId, ids.householdId)),
    db.select({ id: financialDocuments.id, status: financialDocuments.status, sourceMetadata: financialDocuments.sourceMetadata }).from(financialDocuments)
      .where(and(eq(financialDocuments.householdId, ids.householdId), eq(financialDocuments.documentType, "BANK_STATEMENT"))),
  ]);
  const [period] = periods;
  const [emergency] = emergencyRows;
  const [treasuryPolicy] = treasuryPolicyRows;
  const [governorPolicy] = governorPolicyRows;
  const policy = policyResponse(governorPolicy, treasuryPolicy);
  const categories = period
    ? await db.select().from(budgetPlanningCategorySnapshots).where(and(eq(budgetPlanningCategorySnapshots.periodId, period.id), eq(budgetPlanningCategorySnapshots.archived, false)))
    : [];
  const monthly = (predicate: (category: typeof categories[number]) => boolean) =>
    categories.filter(predicate).reduce((sum, category) => sum + cents(category.monthlyTarget), 0);
  const mandatoryMonthlyCents = monthly((category) => category.essentialStatus === "essential" && ["fixed_expense", "debt_payment"].includes(category.categoryType));
  const essentialMonthlyCents = monthly((category) => category.essentialStatus === "essential" && category.categoryType === "variable_essential");
  const discretionaryCents = monthly((category) => category.categoryType === "variable_discretionary" || category.essentialStatus === "discretionary");
  const next30DayObligationsCents = bills
    .filter((bill) => bill.essential && bill.dueDate >= asOf && bill.dueDate <= addDays(asOf, 30))
    .reduce((sum, bill) => sum + cents(bill.expectedAmount), 0)
    + upcoming
      .filter((expense) => expense.required && expense.expectedDate >= asOf && expense.expectedDate <= addDays(asOf, 30))
      .reduce((sum, expense) => sum + Math.max(0, cents(expense.estimatedAmount) - cents(expense.fundedAmount)), 0);
  const reserveMonthlyCents = emergency?.targetMonths ? Math.ceil(Math.max(0, cents(emergency.essentialMonthlyExpenses) * emergency.targetMonths - cents(emergency.currentAmount)) / emergency.targetMonths) : 0;
  const operatingBufferCents = policy.householdCashBufferCents || Math.ceil((mandatoryMonthlyCents + essentialMonthlyCents) * 14 / 30);
  const householdAccounts = accounts.filter((account) => !account.businessEntityId);
  const liquidAccounts = householdAccounts.filter((account) => ["checking", "savings", "money_market"].includes(account.accountType) && account.includedInNetWorth);
  const householdCashCents = liquidAccounts.reduce((sum, account) => sum + cents(account.currentBalance), 0);
  const availableBankCashCents = liquidAccounts.reduce((sum, account) => sum + cents(account.availableBalance ?? account.currentBalance), 0);
  const businessCashCents = accounts.filter((account) => Boolean(account.businessEntityId)).reduce((sum, account) => sum + cents(account.currentBalance), 0)
    + businessCashRows.reduce((sum, row) => sum + cents(row.bankCash), 0);
  const unclassifiedCashCents = householdAccounts.filter((account) => !account.includedInBudget).reduce((sum, account) => sum + cents(account.currentBalance), 0);
  const unreconciledCashCents = householdAccounts.filter((account) => account.connectionStatus === "error").reduce((sum, account) => sum + cents(account.currentBalance), 0);
  const pendingCashCents = 0;
  const reserveGaps: CapitalGovernorInput["reserveGaps"] = [];
  const emergencyTargetCents = cents(emergency?.essentialMonthlyExpenses) * (emergency?.targetMonths ?? 0);
  reserveGaps.push({ bucket: "EMERGENCY_RESERVE", amountCents: Math.max(0, emergencyTargetCents - cents(emergency?.currentAmount)), provenance: ["emergency_reserves"] });
  const bucketFor = (name: string) => treasury.find((bucket) => bucket.name.toLowerCase().includes(name.toLowerCase()));
  const vehicle = bucketFor("vehicle");
  const annual = bucketFor("annual");
  const capitalOs = bucketFor("capital os");
  const opportunity = treasury.find((bucket) => bucket.bucketType === "OPPORTUNITY");
  reserveGaps.push({ bucket: "VEHICLE_RESERVE", amountCents: Math.max(0, cents(vehicle?.targetAmount) - cents(vehicle?.currentBalance)), provenance: vehicle ? [`treasury_bucket:${vehicle.id}`] : ["vehicle_reserve_policy"] });
  reserveGaps.push({ bucket: "ANNUAL_OBLIGATION_RESERVE", amountCents: Math.max(0, cents(annual?.targetAmount) - cents(annual?.currentBalance)), provenance: annual ? [`treasury_bucket:${annual.id}`] : ["annual_obligation_policy"] });
  reserveGaps.push({ bucket: "CAPITAL_OS_RESERVE", amountCents: Math.max(0, cents(capitalOs?.targetAmount) - cents(capitalOs?.currentBalance)), provenance: capitalOs ? [`treasury_bucket:${capitalOs.id}`] : ["capital_os_policy"] });
  reserveGaps.push({ bucket: "OPPORTUNITY_RESERVE", amountCents: Math.max(0, cents(opportunity?.targetAmount) - cents(opportunity?.currentBalance)), provenance: opportunity ? [`treasury_bucket:${opportunity.id}`] : ["opportunity_policy"] });
  const protectedCommitmentsCents = goalsRows.filter((goal) => goal.status !== "completed").reduce((sum, goal) => sum + cents(goal.weeklyContribution) * 4, 0);
  const encumbrancesCents = encumbrances.reduce((sum, row) => sum + cents(row.amount), 0);
  const profile = calculateVariableIncomeProfile(incomeEvents, asOf);
  const floorOperatingSurplusCents = profile.incomeFloorCents - mandatoryMonthlyCents - essentialMonthlyCents - reserveMonthlyCents - discretionaryCents;
  const baseOperatingSurplusCents = profile.baseIncomeCents - mandatoryMonthlyCents - essentialMonthlyCents - reserveMonthlyCents - discretionaryCents;
  const strongOperatingSurplusCents = profile.strongMonthIncomeCents - mandatoryMonthlyCents - essentialMonthlyCents - reserveMonthlyCents - discretionaryCents;
  const forecastShortfallCents = Math.max(0, -floorOperatingSurplusCents);
  const sourceDates = accounts.map((account) => account.lastSuccessfulSync ?? account.lastSync).filter(Boolean).map((value) => new Date(value as Date).toISOString().slice(0, 10));
  const freshnessDays = sourceDates.length ? Math.max(...sourceDates.map((date) => daysBetween(date, asOf))) : null;
  const hasUnreviewedTransactions = transactions.some((transaction) => transaction.reviewStatus !== "approved" && transaction.dataSource !== "manual");
  // Evidence is never added to cash. Pending uploaded evidence is only a
  // conservative readiness signal when it actually exists.
  const hasPendingStatementEvidence = statementEvidenceRows.some((row) => !["RESOLVED", "REJECTED"].includes(row.reviewStatus.toUpperCase()));
  const statementHeadersByDocument = new Map(statementDocuments.map((statement) => [statement.documentId, statement]));
  const hasUnresolvedStatementDocument = bankEvidenceDocuments.some((document) => {
    const header = statementHeadersByDocument.get(document.id);
    const parserErrors = Array.isArray(document.sourceMetadata?.parserErrors) && document.sourceMetadata.parserErrors.length > 0;
    return hasUnresolvedUploadedStatement(document.status, header?.status ?? null, parserErrors);
  });
  const dataReadiness: CapitalGovernorInput["dataReadiness"] = !period || profile.recentMonthCount < 3
    ? "INCOMPLETE_DATA"
    : unreconciledCashCents > 0 || hasUnreviewedTransactions || hasPendingStatementEvidence || hasUnresolvedStatementDocument
      ? "UNRECONCILED"
      : freshnessDays !== null && freshnessDays > 30
        ? "STALE"
        : "READY";
  const duplex = treasury.find((bucket) => bucket.bucketType === "PROTECTED_GOAL" || bucket.bucketType === "PROPERTY");
  const buckets = [
    ...liquidAccounts.map((account) => ({
      key: account.protected ? "PROTECTED_ACCOUNT" : "HOUSEHOLD_OPERATING_CASH",
      label: account.nickname,
      currentCents: cents(account.currentBalance),
      targetCents: account.protected ? cents(account.currentBalance) : operatingBufferCents,
      protected: account.protected,
      liquid: true,
      physicalAccountIds: [account.id],
      provenance: [`financial_account:${account.id}`],
    })),
    ...(duplex ? [{
      key: "DUPLEX_RESERVE",
      label: duplex.name,
      currentCents: cents(duplex.currentBalance),
      targetCents: cents(duplex.targetAmount),
      protected: true,
      liquid: duplex.liquid,
      physicalAccountIds: [],
      provenance: [`treasury_bucket:${duplex.id}`, ...protectedEntries.filter((entry) => entry.bucketKey === "DUPLEX_RESERVE").map((entry) => `registry:${entry.id}`)],
    }] : []),
  ];
  return {
    asOf,
    policyVersion: policy.version,
    householdCashCents,
    availableBankCashCents,
    unclassifiedCashCents,
    pendingCashCents,
    unreconciledCashCents,
    businessCashCents,
    next30DayObligationsCents,
    essentialMonthlyCents,
    operatingBufferCents,
    reserveGaps,
    protectedCommitmentsCents,
    encumbrancesCents,
    forecastShortfallCents,
    capitalGovernorLocked: riskRows[0]?.protectedCapitalLocked ?? false,
    dataReadiness,
    freshnessDays,
    duplicateSubtractionDetected: false,
    obligationsAreDisjoint: true,
    incomeFloorCents: profile.incomeFloorCents,
    baseIncomeCents: profile.baseIncomeCents,
    strongIncomeCents: profile.strongMonthIncomeCents,
    floorOperatingSurplusCents,
    baseOperatingSurplusCents,
    strongOperatingSurplusCents,
    buckets,
    waterfallOrder: policy.waterfall,
    maximumInvestmentPercent: policy.maximumInvestmentPercent,
  };
}

export async function getCapitalGovernorV2(actor: Actor, asOf = today()) {
  const input = await buildCapitalGovernorInput(actor, asOf);
  const result = calculateCapitalGovernorV2(input);
  const fingerprint = createHash("sha256").update(JSON.stringify({ input, result })).digest("hex");
  const [snapshot] = await db.insert(capitalGovernorInputSnapshots).values({
    householdId: actor.householdId,
    asOf,
    policyVersion: input.policyVersion,
    fingerprint,
    dataReadiness: input.dataReadiness,
    sourceProvenance: {
      householdCash: "household_financial_accounts",
      verifiedIncome: "verified_household_income_events",
      obligations: ["finance_bills", "upcoming_expenses"],
      protectedCapital: "protected_capital_registry",
    },
    input: input as unknown as Record<string, unknown>,
    result: result as unknown as Record<string, unknown>,
  }).returning({ id: capitalGovernorInputSnapshots.id });
  return responseShape(result, snapshot.id, null);
}

export async function runCapitalWaterfall(actor: Actor, input: { asOf?: string; scenario?: "floor" | "base" | "strong" }, idempotencyKey: string) {
  assertPermission(actor.role, "approve");
  if (!idempotencyKey?.trim()) throw new GovernanceError("INVALID_STATE", "Idempotency-Key is required");
  const asOf = input.asOf ?? today();
  const scenario = input.scenario ?? "base";
  const ids = await ensureTenantCore(actor.householdId, actor.userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`capital-waterfall:${ids.householdId}:${idempotencyKey}`}, 0))`);
    const [existing] = await tx.select().from(capitalWaterfallRuns).where(and(eq(capitalWaterfallRuns.householdId, ids.householdId), eq(capitalWaterfallRuns.idempotencyKey, idempotencyKey))).limit(1);
    if (existing) {
      return responseShape(existing.decision as ReturnType<typeof calculateCapitalGovernorV2>, existing.inputSnapshotId, existing.id);
    }
    const built = await buildCapitalGovernorInput(actor, asOf);
    const result = calculateCapitalGovernorV2({
      ...built,
      ...(scenario === "floor" ? { strongIncomeCents: built.incomeFloorCents, baseIncomeCents: built.incomeFloorCents } : {}),
      ...(scenario === "strong" ? { floorOperatingSurplusCents: built.strongOperatingSurplusCents } : {}),
    });
    const fingerprint = createHash("sha256").update(JSON.stringify({ built, result, scenario })).digest("hex");
    const [snapshot] = await tx.insert(capitalGovernorInputSnapshots).values({
      householdId: ids.householdId,
      asOf,
      policyVersion: built.policyVersion,
      fingerprint,
      dataReadiness: built.dataReadiness,
      sourceProvenance: { scenario, authority: "capital_governor_v2" },
      input: built as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
    }).returning({ id: capitalGovernorInputSnapshots.id });
    const [run] = await tx.insert(capitalWaterfallRuns).values({
      householdId: ids.householdId,
      inputSnapshotId: snapshot.id,
      scenario,
      policyVersion: built.policyVersion,
      status: result.status,
       // Database column is non-null for historical run compatibility; the API
       // response remains null/amount-not-calculated when a gate is blocked.
       safeToDeploy: result.safeToDeploy === "NOT_CALCULATED" ? "0.00" : result.safeToDeploy,
      allocations: result.waterfall.allocations,
      decision: result as unknown as Record<string, unknown>,
      idempotencyKey,
      createdBy: actor.userId,
    }).returning();
    for (const allocation of result.waterfall.allocations) {
      if (parseMoneyToCents(allocation.amount) <= 0) continue;
      await tx.insert(auditEvents).values({
        householdId: ids.householdId,
        eventType: "capital_waterfall_recommended",
        actor: actor.userId,
        entity: "capital_waterfall_run",
        entityId: run.id,
        reason: `Advisory ${scenario} waterfall recommendation`,
        metadata: { bucket: allocation.bucket, amount: allocation.amount, physicalMovementAuthorized: false, fingerprint },
      });
    }
    await tx.insert(idempotencyKeys).values({
      householdId: ids.householdId,
      key: idempotencyKey,
      operation: "capital_waterfall_run",
      responseStatus: 201,
      responseBody: { response: responseShape(result, snapshot.id, run.id), fingerprint: JSON.stringify({ asOf, scenario }) },
    });
    return responseShape(result, snapshot.id, run.id);
  });
}