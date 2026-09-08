import { and, desc, eq, gte, lte, ne, or, sql } from "drizzle-orm";
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
import { assertPrivateObjectPath, downloadBusinessDocument, requestBusinessDocumentUpload } from "../lib/business-document-storage";
import { parseBusinessPdf } from "./business-document-parser";

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

function reviewLineResponse<T extends { householdId: string }>(row: T) {
  const { householdId: _householdId, ...response } = row;
  return response;
}

function hideHousehold<T extends { householdId: string; createdBy?: string | null }>(row: T) {
  const { householdId: _householdId, createdBy: _createdBy, ...response } = row;
  return response;
}

export async function getBusinessIncomeIntelligence(actor: Actor) {
  const businesses = await db.select().from(businessEntities).where(eq(businessEntities.householdId, actor.householdId)).orderBy(businessEntities.displayName);
  const [settlements, mathRows, settlementRevenue, settlementDeductions, pnlDocuments, pnlLines, pnlRuns, cashPositions, ownerDraws, verifiedIncome, anomalies] = await Promise.all([
    db.select().from(settlementDocuments).where(eq(settlementDocuments.householdId, actor.householdId)).orderBy(desc(settlementDocuments.statementPeriodEnd)).limit(30),
    db.select().from(settlementMathReconciliations).where(eq(settlementMathReconciliations.householdId, actor.householdId)),
    db.select().from(settlementRevenueLines).where(eq(settlementRevenueLines.householdId, actor.householdId)),
    db.select().from(settlementDeductionLines).where(eq(settlementDeductionLines.householdId, actor.householdId)),
    db.select().from(profitLossDocuments).where(eq(profitLossDocuments.householdId, actor.householdId)).orderBy(desc(profitLossDocuments.statementPeriodEnd)).limit(20),
    db.select().from(profitLossLines).where(eq(profitLossLines.householdId, actor.householdId)),
    db.select().from(profitLossReconciliationRuns).where(eq(profitLossReconciliationRuns.householdId, actor.householdId)).orderBy(desc(profitLossReconciliationRuns.createdAt)).limit(20),
    db.select().from(businessCashPositions).where(eq(businessCashPositions.householdId, actor.householdId)).orderBy(desc(businessCashPositions.asOf)).limit(20),
    db.select().from(ownerDrawProposals).where(eq(ownerDrawProposals.householdId, actor.householdId)).orderBy(desc(ownerDrawProposals.createdAt)).limit(20),
    db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, actor.householdId)).orderBy(desc(verifiedHouseholdIncomeEvents.incomeDate)).limit(20),
    db.select().from(businessIncomeAnomalies).where(and(eq(businessIncomeAnomalies.householdId, actor.householdId), eq(businessIncomeAnomalies.status, "open"))).orderBy(desc(businessIncomeAnomalies.createdAt)).limit(20),
  ]);
  const mathBySettlement = new Map(mathRows.map((row) => [row.settlementDocumentId, row]));
  const revenueBySettlement = new Map<string, typeof settlementRevenue>();
  const deductionsBySettlement = new Map<string, typeof settlementDeductions>();
  const linesByPnl = new Map<string, typeof pnlLines>();
  for (const line of settlementRevenue) revenueBySettlement.set(line.settlementDocumentId, [...(revenueBySettlement.get(line.settlementDocumentId) ?? []), line]);
  for (const line of settlementDeductions) deductionsBySettlement.set(line.settlementDocumentId, [...(deductionsBySettlement.get(line.settlementDocumentId) ?? []), line]);
  for (const line of pnlLines) linesByPnl.set(line.profitLossDocumentId, [...(linesByPnl.get(line.profitLossDocumentId) ?? []), line]);
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
    settlements: settlements.map((row) => ({
      ...settlementResponse(row, mathBySettlement.get(row.id)),
      revenueLines: (revenueBySettlement.get(row.id) ?? []).map(reviewLineResponse),
      deductionLines: (deductionsBySettlement.get(row.id) ?? []).map(reviewLineResponse),
    })),
    profitLossDocuments: pnlDocuments.map((row) => ({
      ...hideHousehold(row),
      lines: (linesByPnl.get(row.id) ?? []).map(reviewLineResponse),
    })),
    reconciliationRuns: pnlRuns.map((row) => hideHousehold(row)),
    cashPositions: cashPositions.map((row) => hideHousehold(row)),
    ownerDraws: ownerDraws.map((row) => hideHousehold(row)),
    verifiedIncome: verifiedIncome.map((row) => hideHousehold(row)),
    anomalies: anomalies.map((row) => hideHousehold(row)),
  };
}

export async function requestBusinessIncomeDocumentUploadUrl(actor: Actor, input: {
  name: string;
  size: number;
  contentType: string;
  documentType: "settlement" | "profit_loss";
}) {
  assertPermission(actor.role, "contribute");
  if (input.contentType !== "application/pdf" || !input.name.toLowerCase().endsWith(".pdf")) {
    throw new GovernanceError("INVALID_STATE", "Only PDF business source documents are supported");
  }
  return { ...input, ...(await requestBusinessDocumentUpload()) };
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
  extractionStatus?: string;
  extractionReason?: string;
  verificationStatus?: string;
  sourceContentType?: string;
  sourceSizeBytes?: number;
  sourcePageCount?: number;
  revenueLines: Array<{ description: string; category?: string; amount: string; quantity?: string; unitAmount?: string; serviceDate?: string | Date; sourcePage?: number }>;
  deductionLines: Array<{ description: string; category?: string; amount: string; taxDeduction?: boolean; passThrough?: boolean; ownerDraw?: boolean; reimbursement?: boolean; sourcePage?: number }>;
};

export async function createSettlementDocument(actor: Actor, input: SettlementInput) {
  assertPermission(actor.role, "contribute");
  const business = await assertBusiness(actor.householdId, input.businessId);
  const math = reconcileSettlementMath(input);
  const persistedMathStatus = input.extractionStatus && input.extractionStatus !== "complete" && input.extractionStatus !== "manual"
    ? "needs_review"
    : math.status;
  const persistedMathReason = persistedMathStatus === "needs_review" && persistedMathStatus !== math.status
    ? input.extractionReason ?? "Source extraction requires operator review."
    : math.reason;
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
      sourceContentType: input.sourceContentType,
      sourceSizeBytes: input.sourceSizeBytes,
      sourcePageCount: input.sourcePageCount,
      extractionStatus: input.extractionStatus ?? "manual",
      extractionReason: input.extractionReason,
      verificationStatus: input.verificationStatus ?? (input.sourceObjectPath ? "needs_review" : persistedMathStatus === "reconciled" ? "verified" : "needs_review"),
      reviewDecision: input.sourceObjectPath ? undefined : "approved",
      reviewReason: input.sourceObjectPath ? undefined : "Manual source recorded by an operator.",
      reviewedBy: input.sourceObjectPath ? undefined : actor.userId,
      reviewedAt: input.sourceObjectPath ? undefined : new Date(),
      reportedGross: input.reportedGross ?? centsToMoney(math.revenueLineTotalCents),
      reportedDeductions: input.reportedDeductions ?? centsToMoney(math.deductionLineTotalCents),
      reportedNet: input.reportedNet ?? centsToMoney(math.calculatedNetCents),
      notes: input.notes,
      createdBy: actor.userId,
    }).returning();
    if (input.revenueLines.length > 0) await tx.insert(settlementRevenueLines).values(input.revenueLines.map((line, index) => ({
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
       reviewStatus: input.sourceObjectPath ? "needs_review" : "approved",
    })));
    if (input.deductionLines.length > 0) await tx.insert(settlementDeductionLines).values(input.deductionLines.map((line, index) => ({
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
       reviewStatus: input.sourceObjectPath ? "needs_review" : "approved",
    })));
    const [mathRow] = await tx.insert(settlementMathReconciliations).values({
      householdId: actor.householdId,
      settlementDocumentId: document.id,
      revenueLineTotal: centsToMoney(math.revenueLineTotalCents),
      deductionLineTotal: centsToMoney(math.deductionLineTotalCents),
      calculatedNet: centsToMoney(math.calculatedNetCents),
      reportedNet: input.reportedNet ?? centsToMoney(math.calculatedNetCents),
      variance: centsToMoney(math.netVarianceCents),
       status: persistedMathStatus,
       reason: persistedMathReason,
    }).returning();
     if (persistedMathStatus !== "reconciled") {
      await tx.insert(businessIncomeAnomalies).values({
        householdId: actor.householdId,
        businessId: business.id,
        anomalyType: "settlement_math_variance",
        severity: "error",
        relatedEntityType: "settlement_document",
        relatedEntityId: document.id,
         message: persistedMathReason,
      });
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_settlement_recorded",
      actor: actor.userId,
      entity: "business_settlement_document",
      entityId: document.id,
       reason: persistedMathReason,
       metadata: { businessId: business.id, mathStatus: persistedMathStatus, sourceKind: document.sourceKind, extractionStatus: document.extractionStatus },
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
  sourceKind?: string;
  sourceContentType?: string;
  sourceSizeBytes?: number;
  sourcePageCount?: number;
  extractionStatus?: string;
  extractionReason?: string;
  verificationStatus?: string;
  allowReview?: boolean;
  reportedRevenue: string;
  reportedExpenses: string;
  reportedProfit: string;
   lines: Array<{ description: string; category?: string; lineType?: string; amount: string; sourcePage?: number }>;
};

export async function createProfitLossDocument(actor: Actor, input: ProfitLossInput) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  const calculated = parseMoneyToCents(input.reportedRevenue) - parseMoneyToCents(input.reportedExpenses);
  if (!input.allowReview && calculated !== parseMoneyToCents(input.reportedProfit)) {
    throw new Error("Reported P&L revenue minus expenses must equal reported profit");
  }
  return db.transaction(async (tx) => {
    if (input.sourceSha256) {
      const [existing] = await tx.select({ id: profitLossDocuments.id }).from(profitLossDocuments).where(and(
        eq(profitLossDocuments.householdId, actor.householdId),
        eq(profitLossDocuments.sourceSha256, input.sourceSha256),
      )).limit(1);
      if (existing) throw new GovernanceError("CONFLICT", "This source document was already recorded");
    }
    const [document] = await tx.insert(profitLossDocuments).values({
      householdId: actor.householdId,
      businessId: input.businessId,
      statementPeriodStart: dateOnly(input.statementPeriodStart)!,
      statementPeriodEnd: dateOnly(input.statementPeriodEnd)!,
      sourceFileName: input.sourceFileName,
      sourceObjectPath: input.sourceObjectPath,
      sourceSha256: input.sourceSha256,
      sourceKind: input.sourceKind ?? (input.sourceObjectPath ? "object_storage" : "manual"),
      sourceContentType: input.sourceContentType,
      sourceSizeBytes: input.sourceSizeBytes,
      sourcePageCount: input.sourcePageCount,
      extractionStatus: input.extractionStatus ?? "manual",
      extractionReason: input.extractionReason,
        verificationStatus: input.sourceObjectPath ? "needs_review" : input.verificationStatus ?? "verified",
      reportedRevenue: input.reportedRevenue,
      reportedExpenses: input.reportedExpenses,
      reportedProfit: input.reportedProfit,
        status: input.sourceObjectPath ? "needs_review" : "reconciled",
        reviewDecision: input.sourceObjectPath ? undefined : "approved",
        reviewReason: input.sourceObjectPath ? undefined : "Manual source recorded by an operator.",
        reviewedBy: input.sourceObjectPath ? undefined : actor.userId,
        reviewedAt: input.sourceObjectPath ? undefined : new Date(),
      createdBy: actor.userId,
    }).returning();
     if (input.lines.length > 0) await tx.insert(profitLossLines).values(input.lines.map((line, index) => ({
      householdId: actor.householdId,
      profitLossDocumentId: document.id,
      lineNumber: index + 1,
      description: line.description,
      category: line.category ?? "other",
      lineType: line.lineType ?? "expense",
       amount: line.amount,
       sourcePage: line.sourcePage,
       reviewStatus: input.sourceObjectPath ? "needs_review" : "approved",
     })));
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_profit_loss_recorded",
      actor: actor.userId,
      entity: "business_profit_loss_document",
      entityId: document.id,
       reason: input.extractionReason ?? "Business P&L document recorded for reconciliation review",
       metadata: { businessId: input.businessId, extractionStatus: document.extractionStatus, verificationStatus: document.verificationStatus },
    });
       if (document.sourceKind === "object_storage" && (document.extractionStatus !== "complete" || document.verificationStatus !== "verified")) {
       await tx.insert(businessIncomeAnomalies).values({
         householdId: actor.householdId,
         businessId: input.businessId,
         anomalyType: "profit_loss_extraction_review",
         severity: "error",
         relatedEntityType: "profit_loss_document",
         relatedEntityId: document.id,
         message: input.extractionReason ?? "P&L source extraction requires review before an owner draw.",
       });
     }
    return hideHousehold(document);
  });
}

export async function ingestBusinessIncomeDocument(actor: Actor, input: {
  businessId: string;
  documentType: "settlement" | "profit_loss";
  sourceFileName: string;
  sourceObjectPath: string;
  contentType: string;
  sourceSizeBytes: number;
}) {
  assertPermission(actor.role, "contribute");
  await assertBusiness(actor.householdId, input.businessId);
  assertPrivateObjectPath(input.sourceObjectPath);
  const { bytes, sha256 } = await downloadBusinessDocument(input.sourceObjectPath);
  const parsed = await parseBusinessPdf(bytes, input.documentType);
  const start = parsed.statementPeriodStart ?? today();
  const end = parsed.statementPeriodEnd ?? start;
  const metadata = {
    sourceFileName: input.sourceFileName,
    sourceObjectPath: input.sourceObjectPath,
    sourceSha256: sha256,
    sourceContentType: input.contentType,
    sourceSizeBytes: bytes.length,
    sourcePageCount: parsed.pageCount ?? undefined,
    extractionStatus: parsed.extractionStatus,
    extractionReason: parsed.reason,
  };
  if (input.documentType === "settlement") {
    const document = await createSettlementDocument(actor, {
      businessId: input.businessId,
      statementPeriodStart: start,
      statementPeriodEnd: end,
      paidDate: parsed.paidDate ?? end,
      provider: parsed.provider ?? undefined,
      ...metadata,
      reportedGross: parsed.gross ?? "0.00",
      reportedDeductions: parsed.deductions ?? "0.00",
      reportedNet: parsed.net ?? "0.00",
      verificationStatus: parsed.extractionStatus === "complete" ? undefined : "needs_review",
      revenueLines: parsed.revenueLines,
      deductionLines: parsed.deductionLines,
      notes: parsed.reason,
    });
    return {
      documentType: input.documentType,
      documentId: document.id,
      extractionStatus: document.extractionStatus,
      verificationStatus: document.verificationStatus,
      message: parsed.reason,
    };
  }
  const reportedRevenue = parsed.revenue ?? "0.00";
  const reportedExpenses = parsed.expenses ?? "0.00";
  const reportedProfit = parsed.profit ?? "0.00";
  const calculated = parseMoneyToCents(reportedRevenue) - parseMoneyToCents(reportedExpenses);
  const mathMatches = calculated === parseMoneyToCents(reportedProfit);
  const document = await createProfitLossDocument(actor, {
    businessId: input.businessId,
    statementPeriodStart: start,
    statementPeriodEnd: end,
    ...metadata,
    sourceKind: "object_storage",
    reportedRevenue,
    reportedExpenses,
    reportedProfit,
    extractionStatus: parsed.extractionStatus,
    verificationStatus: parsed.extractionStatus === "complete" && mathMatches ? "verified" : "needs_review",
    allowReview: true,
      lines: parsed.lines.map((line) => ({
      description: line.description,
      amount: line.amount,
      lineType: line.lineType,
      category: line.lineType === "expense" ? "operating" : "revenue",
      sourcePage: line.sourcePage,
    })),
  });
  return {
    documentType: input.documentType,
    documentId: document.id,
    extractionStatus: document.extractionStatus,
    verificationStatus: document.verificationStatus,
    message: parsed.extractionStatus === "complete" && mathMatches
      ? parsed.reason
      : `${parsed.reason} P&L revenue minus expenses does not yet verify to profit.`,
  };
}

type IncomeReviewDecision = "approved" | "rejected";

function reviewResult(input: {
  documentType: "settlement" | "profit_loss";
  documentId: string;
  decision: IncomeReviewDecision;
  verificationStatus: string;
  reviewedLineCount: number;
  conflictingLineCount: number;
  reason: string;
}) {
  return input;
}

export async function reviewBusinessIncomeDocument(actor: Actor, documentId: string, input: {
  decision: IncomeReviewDecision;
  reason: string;
}) {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    const [settlement] = await tx.select().from(settlementDocuments).where(and(
      eq(settlementDocuments.id, documentId),
      eq(settlementDocuments.householdId, actor.householdId),
    )).limit(1);
    if (settlement) {
      const revenue = await tx.select().from(settlementRevenueLines).where(and(
        eq(settlementRevenueLines.settlementDocumentId, documentId),
        eq(settlementRevenueLines.householdId, actor.householdId),
      ));
      const deductions = await tx.select().from(settlementDeductionLines).where(and(
        eq(settlementDeductionLines.settlementDocumentId, documentId),
        eq(settlementDeductionLines.householdId, actor.householdId),
      ));
      const reviewedAt = new Date();
      await tx.update(settlementRevenueLines).set({
        reviewStatus: input.decision,
        reviewDecision: input.decision,
        reviewReason: input.reason,
        reviewedBy: actor.userId,
        reviewedAt,
      }).where(and(eq(settlementRevenueLines.settlementDocumentId, documentId), eq(settlementRevenueLines.householdId, actor.householdId)));
      await tx.update(settlementDeductionLines).set({
        reviewStatus: input.decision,
        reviewDecision: input.decision,
        reviewReason: input.reason,
        reviewedBy: actor.userId,
        reviewedAt,
      }).where(and(eq(settlementDeductionLines.settlementDocumentId, documentId), eq(settlementDeductionLines.householdId, actor.householdId)));
      const math = reconcileSettlementMath({
        revenueLines: revenue,
        deductionLines: deductions,
        reportedGross: settlement.reportedGross,
        reportedDeductions: settlement.reportedDeductions,
        reportedNet: settlement.reportedNet,
      });
      const verified = input.decision === "approved" && math.status === "reconciled" &&
        (settlement.extractionStatus === "complete" || settlement.extractionStatus === "manual");
      const reason = verified ? "All extracted settlement line items were approved and the totals reconcile." : input.reason;
      await tx.update(settlementMathReconciliations).set({
        revenueLineTotal: centsToMoney(math.revenueLineTotalCents),
        deductionLineTotal: centsToMoney(math.deductionLineTotalCents),
        calculatedNet: centsToMoney(math.calculatedNetCents),
        variance: centsToMoney(math.netVarianceCents),
        status: verified ? "reconciled" : "needs_review",
        reason,
      }).where(and(eq(settlementMathReconciliations.settlementDocumentId, documentId), eq(settlementMathReconciliations.householdId, actor.householdId)));
      await tx.update(settlementDocuments).set({
        verificationStatus: verified ? "verified" : "needs_review",
        reviewDecision: input.decision,
        reviewReason: input.reason,
        reviewedBy: actor.userId,
        reviewedAt,
        updatedAt: reviewedAt,
      }).where(and(eq(settlementDocuments.id, documentId), eq(settlementDocuments.householdId, actor.householdId)));
      const openAnomaly = await tx.select({ id: businessIncomeAnomalies.id }).from(businessIncomeAnomalies).where(and(
        eq(businessIncomeAnomalies.householdId, actor.householdId),
        eq(businessIncomeAnomalies.relatedEntityType, "settlement_document"),
        eq(businessIncomeAnomalies.relatedEntityId, documentId),
        eq(businessIncomeAnomalies.status, "open"),
      )).limit(1);
      if (verified) {
        await tx.update(businessIncomeAnomalies).set({ status: "resolved", resolvedAt: reviewedAt, resolvedBy: actor.userId }).where(and(
          eq(businessIncomeAnomalies.householdId, actor.householdId),
          eq(businessIncomeAnomalies.relatedEntityType, "settlement_document"),
          eq(businessIncomeAnomalies.relatedEntityId, documentId),
          eq(businessIncomeAnomalies.status, "open"),
        ));
      } else if (openAnomaly.length === 0) {
        await tx.insert(businessIncomeAnomalies).values({
          householdId: actor.householdId,
          businessId: settlement.businessId,
          anomalyType: "settlement_line_review",
          severity: "error",
          relatedEntityType: "settlement_document",
          relatedEntityId: documentId,
          message: input.reason,
        });
      }
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "business_income_document_reviewed",
        actor: actor.userId,
        entity: "business_settlement_document",
        entityId: documentId,
        reason: input.reason,
        metadata: { documentType: "settlement", decision: input.decision, reviewedLineCount: revenue.length + deductions.length, verificationStatus: verified ? "verified" : "needs_review" },
      });
      return reviewResult({
        documentType: "settlement",
        documentId,
        decision: input.decision,
        verificationStatus: verified ? "verified" : "needs_review",
        reviewedLineCount: revenue.length + deductions.length,
        conflictingLineCount: input.decision === "rejected" ? revenue.length + deductions.length : 0,
        reason,
      });
    }

    const [pnl] = await tx.select().from(profitLossDocuments).where(and(
      eq(profitLossDocuments.id, documentId),
      eq(profitLossDocuments.householdId, actor.householdId),
    )).limit(1);
    if (!pnl) throw new GovernanceError("INVALID_STATE", "Income document not found");
    const lines = await tx.select().from(profitLossLines).where(and(
      eq(profitLossLines.profitLossDocumentId, documentId),
      eq(profitLossLines.householdId, actor.householdId),
    ));
    const reviewedAt = new Date();
    await tx.update(profitLossLines).set({
      reviewStatus: input.decision,
      reviewDecision: input.decision,
      reviewReason: input.reason,
      reviewedBy: actor.userId,
      reviewedAt,
    }).where(and(eq(profitLossLines.profitLossDocumentId, documentId), eq(profitLossLines.householdId, actor.householdId)));
    const lineRevenue = lines.filter((line) => line.lineType === "revenue").reduce((sum, line) => sum + parseMoneyToCents(line.amount), 0);
    const lineExpenses = lines.filter((line) => line.lineType === "expense").reduce((sum, line) => sum + parseMoneyToCents(line.amount), 0);
    const lineMathMatches = lineRevenue === parseMoneyToCents(pnl.reportedRevenue) &&
      lineExpenses === parseMoneyToCents(pnl.reportedExpenses) &&
      lineRevenue - lineExpenses === parseMoneyToCents(pnl.reportedProfit ?? "0");
    const verified = input.decision === "approved" && lineMathMatches &&
      (pnl.extractionStatus === "complete" || pnl.extractionStatus === "manual");
    const reason = verified ? "All extracted P&L line items were approved and the totals reconcile." : input.reason;
    await tx.update(profitLossDocuments).set({
      verificationStatus: verified ? "verified" : "needs_review",
      status: verified ? "reconciled" : "needs_review",
      reviewDecision: input.decision,
      reviewReason: input.reason,
      reviewedBy: actor.userId,
      reviewedAt,
    }).where(and(eq(profitLossDocuments.id, documentId), eq(profitLossDocuments.householdId, actor.householdId)));
    const openAnomaly = await tx.select({ id: businessIncomeAnomalies.id }).from(businessIncomeAnomalies).where(and(
      eq(businessIncomeAnomalies.householdId, actor.householdId),
      eq(businessIncomeAnomalies.relatedEntityType, "profit_loss_document"),
      eq(businessIncomeAnomalies.relatedEntityId, documentId),
      eq(businessIncomeAnomalies.status, "open"),
    )).limit(1);
    if (verified) {
      await tx.update(businessIncomeAnomalies).set({ status: "resolved", resolvedAt: reviewedAt, resolvedBy: actor.userId }).where(and(
        eq(businessIncomeAnomalies.householdId, actor.householdId),
        eq(businessIncomeAnomalies.relatedEntityType, "profit_loss_document"),
        eq(businessIncomeAnomalies.relatedEntityId, documentId),
        eq(businessIncomeAnomalies.status, "open"),
      ));
    } else if (openAnomaly.length === 0) {
      await tx.insert(businessIncomeAnomalies).values({
        householdId: actor.householdId,
        businessId: pnl.businessId,
        anomalyType: "profit_loss_line_review",
        severity: "error",
        relatedEntityType: "profit_loss_document",
        relatedEntityId: documentId,
        message: reason,
      });
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_income_document_reviewed",
      actor: actor.userId,
      entity: "business_profit_loss_document",
      entityId: documentId,
      reason: input.reason,
      metadata: { documentType: "profit_loss", decision: input.decision, reviewedLineCount: lines.length, verificationStatus: verified ? "verified" : "needs_review" },
    });
    return reviewResult({
      documentType: "profit_loss",
      documentId,
      decision: input.decision,
      verificationStatus: verified ? "verified" : "needs_review",
      reviewedLineCount: lines.length,
      conflictingLineCount: input.decision === "rejected" ? lines.length : 0,
      reason,
    });
  });
}

export async function reviewBusinessIncomeLineItem(actor: Actor, documentId: string, lineId: string, input: {
  decision: IncomeReviewDecision;
  reason: string;
  correctedDescription?: string;
  correctedAmount?: string;
}) {
  assertPermission(actor.role, "approve");
  return db.transaction(async (tx) => {
    const reviewedAt = new Date();
    const [settlement] = await tx.select().from(settlementDocuments).where(and(eq(settlementDocuments.id, documentId), eq(settlementDocuments.householdId, actor.householdId))).limit(1);
    if (settlement) {
      const [revenueLine] = await tx.select().from(settlementRevenueLines).where(and(eq(settlementRevenueLines.id, lineId), eq(settlementRevenueLines.settlementDocumentId, documentId), eq(settlementRevenueLines.householdId, actor.householdId))).limit(1);
      const [deductionLine] = revenueLine ? [null] : await tx.select().from(settlementDeductionLines).where(and(eq(settlementDeductionLines.id, lineId), eq(settlementDeductionLines.settlementDocumentId, documentId), eq(settlementDeductionLines.householdId, actor.householdId))).limit(1);
      if (!revenueLine && !deductionLine) throw new GovernanceError("INVALID_STATE", "Income line item not found");
      const table = revenueLine ? settlementRevenueLines : settlementDeductionLines;
      const existing = revenueLine ?? deductionLine!;
      await tx.update(table).set({
        description: input.correctedDescription ?? existing.description,
        amount: input.correctedAmount ?? existing.amount,
        reviewStatus: input.decision,
        reviewDecision: input.decision,
        reviewReason: input.reason,
        reviewedBy: actor.userId,
        reviewedAt,
      }).where(and(eq(table.id, lineId), eq(table.householdId, actor.householdId)));
      const revenue = await tx.select().from(settlementRevenueLines).where(and(eq(settlementRevenueLines.settlementDocumentId, documentId), eq(settlementRevenueLines.householdId, actor.householdId)));
      const deductions = await tx.select().from(settlementDeductionLines).where(and(eq(settlementDeductionLines.settlementDocumentId, documentId), eq(settlementDeductionLines.householdId, actor.householdId)));
      const math = reconcileSettlementMath({ revenueLines: revenue, deductionLines: deductions, reportedGross: settlement.reportedGross, reportedDeductions: settlement.reportedDeductions, reportedNet: settlement.reportedNet });
      const allApproved = [...revenue, ...deductions].every((line) => line.id === lineId ? input.decision === "approved" : line.reviewStatus === "approved");
      const verified = allApproved && math.status === "reconciled" && (settlement.extractionStatus === "complete" || settlement.extractionStatus === "manual");
      await tx.update(settlementMathReconciliations).set({
        revenueLineTotal: centsToMoney(math.revenueLineTotalCents),
        deductionLineTotal: centsToMoney(math.deductionLineTotalCents),
        calculatedNet: centsToMoney(math.calculatedNetCents),
        variance: centsToMoney(math.netVarianceCents),
        status: verified ? "reconciled" : "needs_review",
        reason: verified ? "All settlement line items are approved and totals reconcile." : input.reason,
      }).where(and(eq(settlementMathReconciliations.settlementDocumentId, documentId), eq(settlementMathReconciliations.householdId, actor.householdId)));
      await tx.update(settlementDocuments).set({
        verificationStatus: verified ? "verified" : "needs_review",
        reviewDecision: verified ? "approved" : null,
        reviewReason: verified ? "All extracted settlement line items are approved." : input.reason,
        reviewedBy: actor.userId,
        reviewedAt,
        updatedAt: reviewedAt,
      }).where(and(eq(settlementDocuments.id, documentId), eq(settlementDocuments.householdId, actor.householdId)));
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "business_income_line_reviewed",
        actor: actor.userId,
        entity: revenueLine ? "business_settlement_revenue_line" : "business_settlement_deduction_line",
        entityId: lineId,
        reason: input.reason,
        metadata: { documentId, decision: input.decision, corrected: Boolean(input.correctedDescription || input.correctedAmount), correctedAmount: input.correctedAmount },
      });
      return reviewResult({
        documentType: "settlement",
        documentId,
        decision: input.decision,
        verificationStatus: verified ? "verified" : "needs_review",
        reviewedLineCount: [...revenue, ...deductions].filter((line) => line.id === lineId ? input.decision !== "rejected" : line.reviewStatus === "approved").length,
        conflictingLineCount: [...revenue, ...deductions].filter((line) => line.id === lineId ? input.decision === "rejected" : line.reviewStatus === "rejected").length,
        reason: verified ? "All settlement line items are approved and totals reconcile." : input.reason,
      });
    }

    const [pnl] = await tx.select().from(profitLossDocuments).where(and(eq(profitLossDocuments.id, documentId), eq(profitLossDocuments.householdId, actor.householdId))).limit(1);
    if (!pnl) throw new GovernanceError("INVALID_STATE", "Income document not found");
    const [line] = await tx.select().from(profitLossLines).where(and(eq(profitLossLines.id, lineId), eq(profitLossLines.profitLossDocumentId, documentId), eq(profitLossLines.householdId, actor.householdId))).limit(1);
    if (!line) throw new GovernanceError("INVALID_STATE", "Income line item not found");
    await tx.update(profitLossLines).set({
      description: input.correctedDescription ?? line.description,
      amount: input.correctedAmount ?? line.amount,
      reviewStatus: input.decision,
      reviewDecision: input.decision,
      reviewReason: input.reason,
      reviewedBy: actor.userId,
      reviewedAt,
    }).where(and(eq(profitLossLines.id, lineId), eq(profitLossLines.householdId, actor.householdId)));
    const lines = await tx.select().from(profitLossLines).where(and(eq(profitLossLines.profitLossDocumentId, documentId), eq(profitLossLines.householdId, actor.householdId)));
    const lineRevenue = lines.filter((item) => item.lineType === "revenue").reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
    const lineExpenses = lines.filter((item) => item.lineType === "expense").reduce((sum, item) => sum + parseMoneyToCents(item.amount), 0);
    const allApproved = lines.every((item) => item.id === lineId ? input.decision === "approved" : item.reviewStatus === "approved");
    const verified = allApproved && lineRevenue === parseMoneyToCents(pnl.reportedRevenue) && lineExpenses === parseMoneyToCents(pnl.reportedExpenses) &&
      lineRevenue - lineExpenses === parseMoneyToCents(pnl.reportedProfit ?? "0") && (pnl.extractionStatus === "complete" || pnl.extractionStatus === "manual");
    await tx.update(profitLossDocuments).set({
      verificationStatus: verified ? "verified" : "needs_review",
      status: verified ? "reconciled" : "needs_review",
      reviewDecision: verified ? "approved" : null,
      reviewReason: verified ? "All extracted P&L line items are approved." : input.reason,
      reviewedBy: actor.userId,
      reviewedAt,
    }).where(and(eq(profitLossDocuments.id, documentId), eq(profitLossDocuments.householdId, actor.householdId)));
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "business_income_line_reviewed",
      actor: actor.userId,
      entity: "business_profit_loss_line",
      entityId: lineId,
      reason: input.reason,
      metadata: { documentId, decision: input.decision, corrected: Boolean(input.correctedDescription || input.correctedAmount), correctedAmount: input.correctedAmount },
    });
    return reviewResult({
      documentType: "profit_loss",
      documentId,
      decision: input.decision,
      verificationStatus: verified ? "verified" : "needs_review",
      reviewedLineCount: lines.filter((item) => item.id === lineId ? input.decision !== "rejected" : item.reviewStatus === "approved").length,
      conflictingLineCount: lines.filter((item) => item.id === lineId ? input.decision === "rejected" : item.reviewStatus === "rejected").length,
      reason: verified ? "All P&L line items are approved and totals reconcile." : input.reason,
    });
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
  const [settlements, expenses, pnl, settlementRevenue, settlementDeductions, pnlLines] = await Promise.all([
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
    db.select().from(settlementRevenueLines).where(eq(settlementRevenueLines.householdId, actor.householdId)),
    db.select().from(settlementDeductionLines).where(eq(settlementDeductionLines.householdId, actor.householdId)),
    db.select().from(profitLossLines).where(eq(profitLossLines.householdId, actor.householdId)),
  ]);
  const result = reconcileBusinessPeriod({
    settlementGross: centsToMoney(settlements.reduce((sum, row) => sum + parseMoneyToCents(row.reportedGross), 0)),
    settlementDeductions: centsToMoney(settlements.reduce((sum, row) => sum + parseMoneyToCents(row.reportedDeductions), 0)),
    operatingExpenses: centsToMoney(expenses.reduce((sum, row) => sum + parseMoneyToCents(row.amount), 0)),
    reportedProfit: input.reportedProfit ?? pnl[0]?.reportedProfit,
    settlementPeriods: settlements.map((row) => ({ start: row.statementPeriodStart, end: row.statementPeriodEnd })),
    requestedPeriod: { start: statementPeriodStart, end: statementPeriodEnd },
  });
  const settlementIds = new Set(settlements.map((settlement) => settlement.id));
  const pnlIds = new Set(pnl.map((document) => document.id));
  const reviewBlocked = settlements.some((document) => document.verificationStatus !== "verified") ||
    pnl.some((document) => document.verificationStatus !== "verified") ||
    settlementRevenue.some((line) => settlementIds.has(line.settlementDocumentId) && line.reviewStatus !== "approved") ||
    settlementDeductions.some((line) => settlementIds.has(line.settlementDocumentId) && line.reviewStatus !== "approved") ||
    pnlLines.some((line) => pnlIds.has(line.profitLossDocumentId) && line.reviewStatus !== "approved");
  const reconciliationStatus = reviewBlocked ? "needs_review" : result.status;
  const reconciliationReason = reviewBlocked
    ? "Extracted business line items and source decisions must be reviewed before period reconciliation."
    : result.reason;
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
    status: reconciliationStatus,
    reason: reconciliationReason,
    createdBy: actor.userId,
  }).returning();
  if (reconciliationStatus !== "reconciled") {
    await db.insert(businessIncomeAnomalies).values({
      householdId: actor.householdId,
      businessId: input.businessId,
      anomalyType: reviewBlocked ? "line_item_review_required" : result.periodCoverage === "incomplete" ? "period_coverage_gap" : "profit_variance",
      severity: "warning",
      relatedEntityType: "profit_loss_reconciliation_run",
      relatedEntityId: run.id,
      message: reconciliationReason,
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
  const [uploadedReview] = await db.select({ id: settlementDocuments.id }).from(settlementDocuments).where(and(
    eq(settlementDocuments.householdId, actor.householdId),
    eq(settlementDocuments.businessId, input.businessId),
    eq(settlementDocuments.sourceKind, "object_storage"),
    or(
      ne(settlementDocuments.extractionStatus, "complete"),
      ne(settlementDocuments.verificationStatus, "verified"),
    ),
  )).limit(1);
  const [unreviewedSettlementLine] = await db.select({ id: settlementRevenueLines.id }).from(settlementRevenueLines)
    .innerJoin(settlementDocuments, eq(settlementDocuments.id, settlementRevenueLines.settlementDocumentId))
    .where(and(
      eq(settlementRevenueLines.householdId, actor.householdId),
      eq(settlementDocuments.householdId, actor.householdId),
      eq(settlementDocuments.businessId, input.businessId),
      ne(settlementRevenueLines.reviewStatus, "approved"),
    )).limit(1);
  const [unreviewedDeductionLine] = await db.select({ id: settlementDeductionLines.id }).from(settlementDeductionLines)
    .innerJoin(settlementDocuments, eq(settlementDocuments.id, settlementDeductionLines.settlementDocumentId))
    .where(and(
      eq(settlementDeductionLines.householdId, actor.householdId),
      eq(settlementDocuments.householdId, actor.householdId),
      eq(settlementDocuments.businessId, input.businessId),
      ne(settlementDeductionLines.reviewStatus, "approved"),
    )).limit(1);
  const [unreviewedPnlLine] = await db.select({ id: profitLossLines.id }).from(profitLossLines)
    .innerJoin(profitLossDocuments, eq(profitLossDocuments.id, profitLossLines.profitLossDocumentId))
    .where(and(
      eq(profitLossLines.householdId, actor.householdId),
      eq(profitLossDocuments.householdId, actor.householdId),
      eq(profitLossDocuments.businessId, input.businessId),
      ne(profitLossLines.reviewStatus, "approved"),
    )).limit(1);
  const [unverifiedPnl] = await db.select({ id: profitLossDocuments.id }).from(profitLossDocuments).where(and(
    eq(profitLossDocuments.householdId, actor.householdId),
    eq(profitLossDocuments.businessId, input.businessId),
    eq(profitLossDocuments.sourceKind, "object_storage"),
    ne(profitLossDocuments.verificationStatus, "verified"),
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
    settlementMathStatus: math || uploadedReview || unreviewedSettlementLine || unreviewedDeductionLine || unreviewedPnlLine || unverifiedPnl ? "needs_review" : "not_required",
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
      proposalStatus: "approved",
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