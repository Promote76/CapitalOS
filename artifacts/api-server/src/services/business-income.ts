import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents,
  businessAdvances,
  businessCashPositions,
  businessEntities,
  businessEscrowMovements,
  businessExpenses,
  businessIncomeAnomalies,
  businessEarningsEvents,
  businessReserves,
  settlementCashMatches,
  settlementDeductionLines,
  settlementMathReconciliations,
  settlementRevenueLines,
  verifiedHouseholdIncomeEvents,
  financeTransactions,
  financialAccounts,
  ownerDrawProposals,
  profitLossDocuments,
  profitLossLines,
  profitLossReconciliationRuns,
  reimbursementMatches,
  settlementDocuments,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import {
  calculateBusinessCashPosition,
  evaluateOwnerDraw,
  matchSettlementCash,
  reconcileBusinessPeriod,
  reconcileSettlementMath,
  verifiedIncomeFromApprovedDraw,
} from "../domain/business-income";
import { centsToMoney, parseMoneyToCents } from "../domain/finance";

const today = () => new Date().toISOString().slice(0, 10);
const dateOnly = (value: string | Date | null | undefined) => value == null ? undefined : value instanceof Date ? value.toISOString().slice(0, 10) : value;

async function assertBusiness(householdId: string, businessId: string) {
  const [business] = await db.select().from(businessEntities).where(and(
    eq(businessEntities.id, businessId),
    eq(businessEntities.householdId, householdId),
  )).limit(1);
  if (!business) throw new GovernanceError("INVALID_STATE", "Business not found");
  return business;
}

function settlementResponse(row: typeof settlementDocuments.$inferSelect, math?: typeof settlementMathReconciliations.$inferSelect | null) {
  const { householdId: _householdId, createdBy: _createdBy, ...document } = row;
  return {
    ...document,
    mathStatus: math?.status ?? "needs_review",
    mathReason: math?.reason ?? "Settlement math has not been run.",
    calculatedNet: math?.calculatedNet ?? row.reportedNet ?? "0.00",
  };
}

function hideHousehold<T extends { householdId: string; createdBy?: string | null }>(row: T) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return response;
}

export async function getBusinessIncomeIntelligence(actor: Actor) {
  const businesses = await db.select().from(businessEntities).where(eq(businessEntities.householdId, actor.householdId)).orderBy(businessEntities.displayName);
  const [settlements, mathRows, pnlDocuments, pnlRuns, cashPositions, ownerDraws, verifiedIncome, anomalies] = await Promise.all([
    db.select().from(settlementDocuments).where(eq(settlementDocuments.householdId, actor.householdId)).orderBy(desc(settlementDocuments.statementPeriodEnd)).limit(30),
    db.select().from(settlementMathReconciliations).where(eq(settlementMathReconciliations.householdId, actor.householdId)),
    db.select().from(profitLossDocuments).where(eq(profitLossDocuments.householdId, actor.householdId)).orderBy(desc(profitLossDocuments.statementPeriodEnd)).limit(20),
    db.select().from(profitLossReconciliationRuns).where(eq(profitLossReconciliationRuns.householdId, actor.householdId)).orderBy(desc(profitLossReconciliationRuns.createdAt)).limit(20),
    db.select().from(businessCashPositions).where(eq(businessCashPositions.householdId, actor.householdId)).orderBy(desc(businessCashPositions.asOf)).limit(20),
    db.select().from(ownerDrawProposals).where(eq(ownerDrawProposals.householdId, actor.householdId)).orderBy(desc(ownerDrawProposals.createdAt)).limit(20),
    db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, actor.householdId)).orderBy(desc(verifiedHouseholdIncomeEvents.incomeDate)).limit(20),
    db.select().from(businessIncomeAnomalies).where(and(eq(businessIncomeAnomalies.householdId, actor.householdId), eq(businessIncomeAnomalies.status, "open"))).orderBy(desc(businessIncomeAnomalies.createdAt)).limit(20),
  ]);
  const mathBySettlement = new Map(mathRows.map((row) => [row.settlementDocumentId, row]));
  const unresolvedCount = anomalies.length;
  const verifiedIncomeCents = verifiedIncome.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0);
  const pendingDrawCents = ownerDraws.filter((row) => row.status !== "rejected" && row.status !== "cancelled").reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0);
  return {
    asOf: today(),
    summary: {
      settlementCount: settlements.length,
      reconciledSettlementCount: settlements.filter((row) => mathBySettlement.get(row.id)?.status === "reconciled").length,
      openAnomalyCount: unresolvedCount,
      pendingOwnerDrawAmount: centsToMoney(pendingDrawCents),
      verifiedHouseholdIncome: centsToMoney(verifiedIncomeCents),
      bankSyncMode: "read_only",
    },
    businesses: businesses.map((business) => hideHousehold(business)),
    settlements: settlements.map((row) => settlementResponse(row, mathBySettlement.get(row.id))),
    profitLossDocuments: pnlDocuments.map((row) => hideHousehold(row)),
    reconciliationRuns: pnlRuns.map((row) => hideHousehold(row)),
    cashPositions: cashPositions.map((row) => hideHousehold(row)),
    ownerDraws: ownerDraws.map((row) => hideHousehold(row)),
    verifiedIncome: verifiedIncome.map((row) => hideHousehold(row)),
    anomalies: anomalies.map((row) => hideHousehold(row)),
  };
}

type SettlementInput = {
  businessId: string;
  statementPeriodStart: string | Date;
  statementPeriodEnd: string | Date;
  paidDate?: string | Date;
  provider?: string;
  sourceFileName?: string;
  sourceObjectPath?: string;
  sourceSha256?: string;
  reportedGross?: string;
  reportedDeductions?: string;
  reportedNet?: string;
  notes?: string;
  revenueLines: Array<{ description: string; category?: string; amount: string; quantity?: string; unitAmount?: string; serviceDate?: string | Date; sourcePage?: number }>;
  deductionLines: Array<{ description: string; category?: string; amount: string; taxDeduction?: boolean; passThrough?: boolean; ownerDraw?: boolean; reimbursement?: boolean; sourcePage?: number }>;
};

export async function createSettlementDocument(actor: Actor, input: SettlementInput) {
  assertPermission(actor.role, "contribute");
  const business = await assertBusiness(actor.householdId, input.businessId);
  const math = reconcileSettlementMath(input);
  return db.transaction(async (tx) => {
    if (input.sourceSha256) {
      const [existing] = await tx.select().from(settlementDocuments).where(and(
        eq(settlementDocuments.householdId, actor.householdId),
        eq(settlementDocuments.sourceSha256, input.sourceSha256),
      )).limit(1);
      if (existing) throw new GovernanceError("CONFLICT", "This source document was already recorded");
    }
    const [document] = await tx.insert(settlementDocuments).values({
      householdId: actor.householdId,
      businessId: business.id,
      sourceKind: input.sourceObjectPath ? "object_storage" : "manual",
      provider: input.provider,
      statementPeriodStart: dateOnly(input.statementPeriodStart)!,
      statementPeriodEnd: dateOnly(input.statementPeriodEnd)!,
      paidDate: dateOnly(input.paidDate),
      sourceFileName: input.sourceFileName,
      sourceObjectPath: input.sourceObjectPath,
      sourceSha256: input.sourceSha256,
      reportedGross: input.reportedGross ?? centsToMoney(math.revenueLineTotalCents),
      reportedDeductions: input.reportedDeductions ?? centsToMoney(math.deductionLineTotalCents),
      reportedNet: input.reportedNet ?? centsToMoney(math.calculatedNetCents),
      notes: input.notes,
      createdBy: actor.userId,
    }).returning();
    await tx.insert(settlementRevenueLines).values(input.revenueLines.map((line, index) => ({
      householdId: actor.householdId,
      settlementDocumentId: document.id,
      lineNumber: index + 1,
      description: line.description,
      category: line.category ?? "operating_revenue",
      amount: line.amount,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      serviceDate: dateOnly(line.serviceDate),
      sourcePage: line.sourcePage,
    })));
    await tx.insert(settlementDeductionLines).values(input.deductionLines.map((line, index) => ({
      householdId: actor.householdId,
      settlementDocumentId: document.id,
      lineNumber: index + 1,
      description: line.description,
      category: line.category ?? "other_deduction",
      amount: line.amount,
      taxDeduction: line.taxDeduction ?? false,
      passThrough: line.passThrough ?? false,
      ownerDraw: line.ownerDraw ?? false,
      reimbursement: line.reimbursement ?? false,
      sourcePage: line.sourcePage,
    })));
    const [mathRow] = await tx.insert(settlementMathReconciliations).values({
      householdId: actor.householdId,
      settlementDocumentId: document.id,
      revenueLineTotal: centsToMoney(math.revenueLineTotalCents),
      deductionLineTotal: centsToMoney(math.deductionLineTotalCents),
      calculatedNet: centsToMoney(math.calculatedNetCents),
      reportedNet: input.reportedNet ?? centsToMoney(math.calculatedNetCents),
      variance: centsToMoney(math.netVarianceCents),
      status: math.status,
      reason: math.reason,
    }).returning();
    if (math.status !== "reconciled") {
      await tx.insert(businessIncomeAnomalies).values({
        householdId: actor.householdId,
        businessId: business.id,
        anomalyType: "settlement_math_variance",
        severity: "error",
        relatedEntityType: "settlement_document",
        relatedEntityId: document.id,
        message: math.reason,
      });
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_settlement_recorded",
      actor: actor.userId,
      entity: "business_settlement_document",
      entityId: document.id,
      reason: math.reason,
      metadata: { businessId: business.id, mathStatus: math.status, sourceKind: document.sourceKind },
    });
    return settlementResponse(document, mathRow);
  });
}

type ProfitLossInput = {
  businessId: string;
  statementPeriodStart: string | Date;
  statementPeriodEnd: string | Date;
  sourceFileName?: string;
  sourceObjectPath?: string;
  sourceSha256?: string;
  reportedRevenue: string;
  reportedExpenses: string;
  reportedProfit: string;
  lines: Array<{ description: string; category?: string; lineType?: string; amount: string }>;
};

export async function createProfitLossDocument(actor: Actor, input: ProfitLossInput) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  const calculated = parseMoneyToCents(input.reportedRevenue) - parseMoneyToCents(input.reportedExpenses);
  if (calculated !== parseMoneyToCents(input.reportedProfit)) {
    throw new Error("Reported P&L revenue minus expenses must equal reported profit");
  }
  return db.transaction(async (tx) => {
    const [document] = await tx.insert(profitLossDocuments).values({
      householdId: actor.householdId,
      businessId: input.businessId,
      statementPeriodStart: dateOnly(input.statementPeriodStart)!,
      statementPeriodEnd: dateOnly(input.statementPeriodEnd)!,
      sourceFileName: input.sourceFileName,
      sourceObjectPath: input.sourceObjectPath,
      sourceSha256: input.sourceSha256,
      reportedRevenue: input.reportedRevenue,
      reportedExpenses: input.reportedExpenses,
      reportedProfit: input.reportedProfit,
      status: "needs_review",
      createdBy: actor.userId,
    }).returning();
    await tx.insert(profitLossLines).values(input.lines.map((line, index) => ({
      householdId: actor.householdId,
      profitLossDocumentId: document.id,
      lineNumber: index + 1,
      description: line.description,
      category: line.category ?? "other",
      lineType: line.lineType ?? "expense",
      amount: line.amount,
    })));
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_profit_loss_recorded",
      actor: actor.userId,
      entity: "business_profit_loss_document",
      entityId: document.id,
      reason: "Business P&L document recorded for reconciliation review",
      metadata: { businessId: input.businessId },
    });
    return hideHousehold(document);
  });
}

export async function reconcileBusinessIncomePeriod(actor: Actor, input: {
  businessId: string;
  statementPeriodStart: string | Date;
  statementPeriodEnd: string | Date;
  reportedProfit?: string;
}) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  const statementPeriodStart = dateOnly(input.statementPeriodStart)!;
  const statementPeriodEnd = dateOnly(input.statementPeriodEnd)!;
  const [settlements, expenses, pnl] = await Promise.all([
    db.select().from(settlementDocuments).where(and(
      eq(settlementDocuments.householdId, actor.householdId),
      eq(settlementDocuments.businessId, input.businessId),
      gte(settlementDocuments.statementPeriodStart, statementPeriodStart),
      lte(settlementDocuments.statementPeriodEnd, statementPeriodEnd),
    )),
    db.select().from(businessExpenses).where(and(
      eq(businessExpenses.householdId, actor.householdId),
      eq(businessExpenses.businessId, input.businessId),
      gte(businessExpenses.expenseDate, statementPeriodStart),
      lte(businessExpenses.expenseDate, statementPeriodEnd),
    )),
    db.select().from(profitLossDocuments).where(and(
      eq(profitLossDocuments.householdId, actor.householdId),
      eq(profitLossDocuments.businessId, input.businessId),
      eq(profitLossDocuments.statementPeriodStart, statementPeriodStart),
      eq(profitLossDocuments.statementPeriodEnd, statementPeriodEnd),
    )).limit(1),
  ]);
  const result = reconcileBusinessPeriod({
    settlementGross: centsToMoney(settlements.reduce((sum, row) => sum + parseMoneyToCents(row.reportedGross), 0)),
    settlementDeductions: centsToMoney(settlements.reduce((sum, row) => sum + parseMoneyToCents(row.reportedDeductions), 0)),
    operatingExpenses: centsToMoney(expenses.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0)),
    reportedProfit: input.reportedProfit ?? pnl[0]?.reportedProfit,
    settlementPeriods: settlements.map((row) => ({ start: row.statementPeriodStart, end: row.statementPeriodEnd })),
    requestedPeriod: { start: statementPeriodStart, end: statementPeriodEnd },
  });
  const [run] = await db.insert(profitLossReconciliationRuns).values({
    householdId: actor.householdId,
    businessId: input.businessId,
    statementPeriodStart,
    statementPeriodEnd,
    settlementGross: centsToMoney(result.settlementGrossCents),
    settlementDeductions: centsToMoney(result.settlementDeductionsCents),
    operatingExpenses: centsToMoney(result.operatingExpensesCents),
    calculatedProfit: centsToMoney(result.calculatedProfitCents),
    reportedProfit: result.reportedProfitCents == null ? undefined : centsToMoney(result.reportedProfitCents),
    variance: centsToMoney(result.varianceCents),
    periodCoverage: result.periodCoverage,
    status: result.status,
    reason: result.reason,
    createdBy: actor.userId,
  }).returning();
  if (result.status !== "reconciled") {
    await db.insert(businessIncomeAnomalies).values({
      householdId: actor.householdId,
      businessId: input.businessId,
      anomalyType: result.periodCoverage === "incomplete" ? "period_coverage_gap" : "profit_variance",
      severity: "warning",
      relatedEntityType: "profit_loss_reconciliation_run",
      relatedEntityId: run.id,
      message: result.reason,
    });
  }
  return hideHousehold(run);
}

export async function matchBusinessSettlementCash(actor: Actor, settlementId: string) {
  assertPermission(actor.role, "approve");
  const [settlement] = await db.select().from(settlementDocuments).where(and(
    eq(settlementDocuments.id, settlementId),
    eq(settlementDocuments.householdId, actor.householdId),
  )).limit(1);
  if (!settlement) throw new GovernanceError("INVALID_STATE", "Settlement document not found");
  const [accounts] = await db.select({ id: financialAccounts.id }).from(financialAccounts).where(and(
    eq(financialAccounts.householdId, actor.householdId),
    eq(financialAccounts.businessEntityId, settlement.businessId),
  )).limit(1);
  const candidates = accounts ? await db.select({
    id: financeTransactions.id,
    transactionDate: financeTransactions.transactionDate,
    amount: financeTransactions.amount,
    description: financeTransactions.description,
  }).from(financeTransactions).where(and(
    eq(financeTransactions.householdId, actor.householdId),
    eq(financeTransactions.accountId, accounts.id),
    sql`${financeTransactions.amount} > 0`,
  )) : [];
  const result = matchSettlementCash({
    settlementNet: settlement.reportedNet ?? "0.00",
    paidDate: settlement.paidDate,
    candidates: candidates.map((candidate) => ({ ...candidate, amount: String(candidate.amount) })),
  });
  const [row] = await db.insert(settlementCashMatches).values({
    householdId: actor.householdId,
    businessId: settlement.businessId,
    settlementDocumentId: settlement.id,
    financeTransactionId: result.transactionId,
    matchedAmount: centsToMoney(result.matchedAmountCents),
    matchStatus: result.status,
    confidence: result.confidence.toFixed(2),
    reason: result.reason,
    reviewedBy: actor.userId,
    reviewedAt: new Date(),
  }).onConflictDoUpdate({
    target: settlementCashMatches.settlementDocumentId,
    set: {
      financeTransactionId: result.transactionId,
      matchedAmount: centsToMoney(result.matchedAmountCents),
      matchStatus: result.status,
      confidence: result.confidence.toFixed(2),
      reason: result.reason,
      reviewedBy: actor.userId,
      reviewedAt: new Date(),
    },
  }).returning();
  return hideHousehold(row);
}

export async function createBusinessCashPosition(actor: Actor, input: { businessId: string; asOf: string | Date }) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  const asOf = dateOnly(input.asOf)!;
  const [accounts, advances, escrow, reimbursements, reserve] = await Promise.all([
    db.select().from(financialAccounts).where(and(eq(financialAccounts.householdId, actor.householdId), eq(financialAccounts.businessEntityId, input.businessId))),
    db.select().from(businessAdvances).where(and(eq(businessAdvances.householdId, actor.householdId), eq(businessAdvances.businessId, input.businessId), eq(businessAdvances.status, "open"))),
    db.select().from(businessEscrowMovements).where(and(eq(businessEscrowMovements.householdId, actor.householdId), eq(businessEscrowMovements.businessId, input.businessId), lte(businessEscrowMovements.movementDate, asOf))),
    db.select().from(reimbursementMatches).where(and(eq(reimbursementMatches.householdId, actor.householdId), eq(reimbursementMatches.businessId, input.businessId), eq(reimbursementMatches.status, "needs_review"))),
    db.select().from(businessReserves).where(and(eq(businessReserves.householdId, actor.householdId), eq(businessReserves.businessId, input.businessId))).limit(1),
  ]);
  const escrowHeld = escrow.reduce((sum, row) => sum + (row.direction === "in" ? parseMoneyToCents(row.amount) : -parseMoneyToCents(row.amount)), 0);
  const advanceBalance = advances.reduce((sum, row) => sum + parseMoneyToCents(row.amount) - parseMoneyToCents(row.recoveredAmount), 0);
  const position = calculateBusinessCashPosition({
    bankCash: centsToMoney(accounts.reduce((sum, row) => sum + parseMoneyToCents(row.currentBalance), 0)),
    pendingDeposits: "0.00",
    outstandingAdvances: centsToMoney(advanceBalance),
    escrowHeld: centsToMoney(Math.max(0, escrowHeld)),
    reimbursementsDue: centsToMoney(reimbursements.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0)),
    reserveFloor: centsToMoney(parseMoneyToCents(reserve[0]?.targetAmount) + parseMoneyToCents(reserve[0]?.taxReserve) + parseMoneyToCents(reserve[0]?.safetyBuffer)),
  });
  const [row] = await db.insert(businessCashPositions).values({
    householdId: actor.householdId,
    businessId: input.businessId,
    asOf,
    bankCash: centsToMoney(position.bankCashCents),
    pendingDeposits: centsToMoney(position.pendingDepositsCents),
    outstandingAdvances: centsToMoney(position.outstandingAdvancesCents),
    escrowHeld: centsToMoney(position.escrowHeldCents),
    reimbursementsDue: centsToMoney(position.reimbursementsDueCents),
    reserveFloor: centsToMoney(position.reserveFloorCents),
    safeToDistribute: centsToMoney(position.safeToDistributeCents),
    status: position.status,
    reason: position.reason,
  }).onConflictDoUpdate({
    target: [businessCashPositions.businessId, businessCashPositions.asOf],
    set: {
      bankCash: centsToMoney(position.bankCashCents),
      pendingDeposits: centsToMoney(position.pendingDepositsCents),
      outstandingAdvances: centsToMoney(position.outstandingAdvancesCents),
      escrowHeld: centsToMoney(position.escrowHeldCents),
      reimbursementsDue: centsToMoney(position.reimbursementsDueCents),
      reserveFloor: centsToMoney(position.reserveFloorCents),
      safeToDistribute: centsToMoney(position.safeToDistributeCents),
      status: position.status,
      reason: position.reason,
    },
  }).returning();
  return hideHousehold(row);
}

export async function createOwnerDrawProposal(actor: Actor, input: { businessId: string; proposalDate: string | Date; amount: string; notes?: string }) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  const [cash] = await db.select().from(businessCashPositions).where(and(
    eq(businessCashPositions.householdId, actor.householdId),
    eq(businessCashPositions.businessId, input.businessId),
  )).orderBy(desc(businessCashPositions.asOf)).limit(1);
  const [math] = await db.select({ math: settlementMathReconciliations }).from(settlementMathReconciliations)
    .innerJoin(settlementDocuments, eq(settlementDocuments.id, settlementMathReconciliations.settlementDocumentId))
    .where(and(
      eq(settlementMathReconciliations.householdId, actor.householdId),
      eq(settlementDocuments.businessId, input.businessId),
      eq(settlementMathReconciliations.status, "needs_review"),
    )).limit(1);
  const [cashMatch] = await db.select().from(settlementCashMatches).where(and(
    eq(settlementCashMatches.householdId, actor.householdId),
    eq(settlementCashMatches.businessId, input.businessId),
    eq(settlementCashMatches.matchStatus, "needs_review"),
  )).limit(1);
  const unresolved = await db.select({ id: businessIncomeAnomalies.id }).from(businessIncomeAnomalies).where(and(eq(businessIncomeAnomalies.householdId, actor.householdId), eq(businessIncomeAnomalies.businessId, input.businessId), eq(businessIncomeAnomalies.status, "open")));
  const evaluated = evaluateOwnerDraw({
    requestedAmount: input.amount,
    safeToDistribute: cash?.safeToDistribute ?? "0.00",
    unresolvedAnomalies: unresolved.length,
    cashMatchStatus: cashMatch ? "needs_review" : "not_required",
    settlementMathStatus: math ? "needs_review" : "not_required",
  });
  const [row] = await db.insert(ownerDrawProposals).values({
    householdId: actor.householdId,
    businessId: input.businessId,
    proposalDate: dateOnly(input.proposalDate)!,
    amount: input.amount,
    status: evaluated.status,
    eligibleAmount: centsToMoney(evaluated.eligibleAmountCents),
    blockedReasons: evaluated.blockedReasons,
    notes: input.notes,
    createdBy: actor.userId,
  }).returning();
  return hideHousehold(row);
}

export async function approveOwnerDrawProposal(actor: Actor, proposalId: string, input: { approvedAmount: string; notes?: string }) {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    const [proposal] = await tx.select().from(ownerDrawProposals).where(and(eq(ownerDrawProposals.id, proposalId), eq(ownerDrawProposals.householdId, actor.householdId))).limit(1);
    if (!proposal) throw new GovernanceError("INVALID_STATE", "Owner draw proposal not found");
    if (proposal.status !== "eligible") throw new GovernanceError("CONFLICT", "Owner draw proposal is no longer eligible for approval");
    const approvedCents = verifiedIncomeFromApprovedDraw({
      proposalStatus: proposal.status,
      approvedAmount: input.approvedAmount,
      requestedAmount: proposal.amount,
      blockedReasons: proposal.blockedReasons,
    });
    const [updated] = await tx.update(ownerDrawProposals).set({
      status: "approved",
      eligibleAmount: centsToMoney(approvedCents),
      approvedBy: actor.userId,
      approvedAt: new Date(),
      notes: input.notes ?? proposal.notes,
    }).where(and(eq(ownerDrawProposals.id, proposal.id), eq(ownerDrawProposals.householdId, actor.householdId), eq(ownerDrawProposals.status, "eligible"))).returning();
    if (!updated) throw new GovernanceError("CONFLICT", "Owner draw proposal is no longer eligible for approval");
    const [income] = await tx.insert(verifiedHouseholdIncomeEvents).values({
      householdId: actor.householdId,
      businessId: proposal.businessId,
      ownerDrawProposalId: proposal.id,
      incomeDate: proposal.proposalDate,
      amount: centsToMoney(approvedCents),
      createdBy: actor.userId,
    }).returning();
    await tx.insert(businessEarningsEvents).values({
      householdId: actor.householdId,
      businessId: proposal.businessId,
      eventDate: proposal.proposalDate,
      eventType: "verified_owner_draw",
      householdIncomeAmount: centsToMoney(approvedCents),
      classification: "verified_household_income",
      notes: input.notes,
      createdBy: actor.userId,
    });
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_owner_draw_approved",
      actor: actor.userId,
      entity: "business_owner_draw_proposal",
      entityId: proposal.id,
      reason: "Human-approved owner draw became verified household income",
      metadata: { businessId: proposal.businessId, amount: centsToMoney(approvedCents), verifiedIncomeId: income.id },
    });
    return { proposal: hideHousehold(updated), verifiedIncome: hideHousehold(income) };
  });
}