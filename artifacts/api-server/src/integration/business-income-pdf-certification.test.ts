import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  ambiguousSettlementPdfFixture,
  profitLossPdfFixture,
  settlementPdfFixture,
} from "../fixtures/business-income-pdfs.ts";
import { parseBusinessPdf } from "../services/business-document-parser.ts";
import type { Actor } from "../services/capital-os.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

test("PDF business-income evidence persists extraction, review, duplicate, and draw-blocking states", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/business-income.ts");
  const {
    businessCashPositions,
    businessEntities,
    businessIncomeAnomalies,
    db,
    householdMembers,
    households,
    ownerDrawProposals,
    profitLossDocuments,
    profitLossLines,
    settlementDeductionLines,
    settlementDocuments,
    settlementMathReconciliations,
    settlementRevenueLines,
    users,
  } = database;
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `business-pdf-${suffix}@capitalos.test`,
    displayName: "Business PDF fixture",
    status: "active",
  }).returning({ id: users.id });
  const [household] = await db.insert(households).values({
    name: `Business PDF fixture ${suffix}`,
    timezone: "America/Chicago",
  }).returning({ id: households.id });
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "owner",
    permissions: ["read", "contribute", "approve"],
    active: true,
  });
  const [business] = await db.insert(businessEntities).values({
    householdId: household.id,
    legalName: `PDF fixture business ${suffix}`,
    displayName: `PDF fixture business ${suffix}`,
    createdBy: user.id,
  }).returning({ id: businessEntities.id });
  const actor: Actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner",
    source: "test-database",
  };

  try {
    const settlement = await parseBusinessPdf(settlementPdfFixture(), "settlement");
    assert.equal(settlement.extractionStatus, "complete");
    const settlementSourceHash = `settlement-${suffix}`;
    const persistedSettlement = await service.createSettlementDocument(actor, {
      businessId: business.id,
      statementPeriodStart: settlement.statementPeriodStart!,
      statementPeriodEnd: settlement.statementPeriodEnd!,
      paidDate: settlement.paidDate!,
      provider: settlement.provider ?? undefined,
      sourceFileName: "august-settlement.pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      sourceSha256: settlementSourceHash,
      sourceContentType: "application/pdf",
      sourceSizeBytes: settlementPdfFixture().length,
      sourcePageCount: settlement.pageCount!,
      extractionStatus: settlement.extractionStatus,
      extractionReason: settlement.reason,
      reportedGross: settlement.gross!,
      reportedDeductions: settlement.deductions!,
      reportedNet: settlement.net!,
      revenueLines: settlement.revenueLines,
      deductionLines: settlement.deductionLines,
    });
    const [settlementRow] = await db.select().from(settlementDocuments).where(eq(settlementDocuments.id, persistedSettlement.id));
    const settlementRevenue = await db.select().from(settlementRevenueLines).where(eq(settlementRevenueLines.settlementDocumentId, persistedSettlement.id));
    const settlementDeductions = await db.select().from(settlementDeductionLines).where(eq(settlementDeductionLines.settlementDocumentId, persistedSettlement.id));
    const [settlementMath] = await db.select().from(settlementMathReconciliations).where(eq(settlementMathReconciliations.settlementDocumentId, persistedSettlement.id));
    assert.equal(settlementRow.extractionStatus, "complete");
    assert.equal(settlementRow.verificationStatus, "needs_review");
    assert.equal(settlementRow.sourcePageCount, 2);
    assert.equal(settlementRow.reportedGross, "1250.00");
    assert.equal(settlementRevenue.length, 2);
    assert.deepEqual(settlementRevenue.map((line) => line.sourcePage), [1, 1]);
    assert.deepEqual(settlementDeductions.map((line) => line.sourcePage), [2, 2]);
    assert.equal(settlementMath.status, "reconciled");

    await assert.rejects(
      service.createSettlementDocument(actor, {
        businessId: business.id,
        statementPeriodStart: settlement.statementPeriodStart!,
        statementPeriodEnd: settlement.statementPeriodEnd!,
        sourceSha256: settlementSourceHash,
        reportedGross: settlement.gross!,
        reportedDeductions: settlement.deductions!,
        reportedNet: settlement.net!,
        revenueLines: settlement.revenueLines,
        deductionLines: settlement.deductionLines,
      }),
      (error: unknown) => error instanceof Error && /already been recorded/i.test(error.message),
    );

    const reviewedSettlement = await service.reviewBusinessIncomeDocument(actor, persistedSettlement.id, {
      decision: "approved",
      reason: "Reviewed against settlement fixture.",
    });
    assert.equal(reviewedSettlement.verificationStatus, "verified");
    const [verifiedSettlement] = await db.select({ verificationStatus: settlementDocuments.verificationStatus }).from(settlementDocuments).where(eq(settlementDocuments.id, persistedSettlement.id));
    assert.equal(verifiedSettlement.verificationStatus, "verified");

    const pnl = await parseBusinessPdf(profitLossPdfFixture(), "profit_loss");
    assert.equal(pnl.extractionStatus, "complete");
    const persistedPnl = await service.createProfitLossDocument(actor, {
      businessId: business.id,
      statementPeriodStart: pnl.statementPeriodStart!,
      statementPeriodEnd: pnl.statementPeriodEnd!,
      sourceFileName: "august-profit-loss.pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      sourceSha256: `pnl-${suffix}`,
      sourceContentType: "application/pdf",
      sourceSizeBytes: profitLossPdfFixture().length,
      sourcePageCount: pnl.pageCount!,
      extractionStatus: pnl.extractionStatus,
      extractionReason: pnl.reason,
      reportedRevenue: pnl.revenue!,
      reportedExpenses: pnl.expenses!,
      reportedProfit: pnl.profit!,
      lines: pnl.lines,
      allowReview: true,
    });
    const [pnlRow] = await db.select().from(profitLossDocuments).where(eq(profitLossDocuments.id, persistedPnl.id));
    const pnlRows = await db.select().from(profitLossLines).where(eq(profitLossLines.profitLossDocumentId, persistedPnl.id));
    assert.equal(pnlRow.extractionStatus, "complete");
    assert.equal(pnlRow.verificationStatus, "needs_review");
    assert.equal(pnlRow.sourcePageCount, 2);
    assert.equal(pnlRows.length, 4);
    assert.deepEqual(pnlRows.map((line) => line.sourcePage), [1, 1, 2, 2]);
    const reviewedPnl = await service.reviewBusinessIncomeDocument(actor, persistedPnl.id, {
      decision: "approved",
      reason: "Reviewed against P&L fixture.",
    });
    assert.equal(reviewedPnl.verificationStatus, "verified");

    const ambiguous = await parseBusinessPdf(ambiguousSettlementPdfFixture(), "settlement");
    assert.equal(ambiguous.extractionStatus, "ambiguous");
    const persistedAmbiguous = await service.createSettlementDocument(actor, {
      businessId: business.id,
      statementPeriodStart: ambiguous.statementPeriodStart!,
      statementPeriodEnd: ambiguous.statementPeriodEnd!,
      sourceFileName: "ambiguous-settlement.pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      sourceSha256: `ambiguous-${suffix}`,
      sourceContentType: "application/pdf",
      sourceSizeBytes: ambiguousSettlementPdfFixture().length,
      sourcePageCount: ambiguous.pageCount!,
      extractionStatus: ambiguous.extractionStatus,
      extractionReason: ambiguous.reason,
      reportedGross: ambiguous.gross ?? "0.00",
      reportedDeductions: ambiguous.deductions ?? "0.00",
      reportedNet: ambiguous.net ?? "0.00",
      revenueLines: ambiguous.revenueLines,
      deductionLines: ambiguous.deductionLines,
    });
    const [ambiguousRow] = await db.select().from(settlementDocuments).where(eq(settlementDocuments.id, persistedAmbiguous.id));
    const [ambiguousMath] = await db.select().from(settlementMathReconciliations).where(eq(settlementMathReconciliations.settlementDocumentId, persistedAmbiguous.id));
    assert.equal(ambiguousRow.extractionStatus, "ambiguous");
    assert.equal(ambiguousRow.verificationStatus, "needs_review");
    assert.equal(ambiguousMath.status, "needs_review");
    assert.ok((await db.select().from(businessIncomeAnomalies).where(and(
      eq(businessIncomeAnomalies.relatedEntityType, "settlement_document"),
      eq(businessIncomeAnomalies.relatedEntityId, persistedAmbiguous.id),
    ))).length > 0);

    const malformed = await parseBusinessPdf(Buffer.from("%PDF-1.4\nnot a valid PDF"), "settlement");
    assert.equal(malformed.extractionStatus, "failed");
    const persistedMalformed = await service.createSettlementDocument(actor, {
      businessId: business.id,
      statementPeriodStart: "2026-08-01",
      statementPeriodEnd: "2026-08-31",
      sourceFileName: "malformed-settlement.pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      sourceSha256: `malformed-${suffix}`,
      sourceContentType: "application/pdf",
      sourceSizeBytes: 25,
      sourcePageCount: malformed.pageCount ?? undefined,
      extractionStatus: malformed.extractionStatus,
      extractionReason: malformed.reason,
      reportedGross: "0.00",
      reportedDeductions: "0.00",
      reportedNet: "0.00",
      revenueLines: malformed.revenueLines,
      deductionLines: malformed.deductionLines,
    });
    const [malformedRow] = await db.select().from(settlementDocuments).where(eq(settlementDocuments.id, persistedMalformed.id));
    assert.equal(malformedRow.extractionStatus, "failed");
    assert.equal(malformedRow.verificationStatus, "needs_review");

    const unsupported = await parseBusinessPdf(Buffer.from("not a PDF"), "profit_loss");
    assert.equal(unsupported.extractionStatus, "failed");
    const persistedUnsupported = await service.createProfitLossDocument(actor, {
      businessId: business.id,
      statementPeriodStart: "2026-08-01",
      statementPeriodEnd: "2026-08-31",
      sourceFileName: "unsupported-profit-loss.pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      sourceSha256: `unsupported-${suffix}`,
      sourceContentType: "text/plain",
      sourceSizeBytes: 9,
      extractionStatus: unsupported.extractionStatus,
      extractionReason: unsupported.reason,
      reportedRevenue: "0.00",
      reportedExpenses: "0.00",
      reportedProfit: "0.00",
      allowReview: true,
      lines: unsupported.lines,
    });
    const [unsupportedRow] = await db.select().from(profitLossDocuments).where(eq(profitLossDocuments.id, persistedUnsupported.id));
    assert.equal(unsupportedRow.extractionStatus, "failed");
    assert.equal(unsupportedRow.verificationStatus, "needs_review");

    await db.insert(businessCashPositions).values({
      householdId: household.id,
      businessId: business.id,
      asOf: "2026-08-31",
      bankCash: "10000.00",
      pendingDeposits: "0.00",
      outstandingAdvances: "0.00",
      escrowHeld: "0.00",
      reimbursementsDue: "0.00",
      reserveFloor: "1000.00",
      safeToDistribute: "9000.00",
      status: "reviewable",
      reason: "Fixture cash position.",
    });
    const blockedDraw = await service.createOwnerDrawProposal(actor, {
      businessId: business.id,
      proposalDate: "2026-08-31",
      amount: "100.00",
      notes: "Must remain blocked while ambiguous source is present.",
    });
    assert.equal(blockedDraw.status, "needs_review");
    assert.ok(blockedDraw.blockedReasons.some((reason) => /review|extraction/i.test(reason)));
    const [persistedDraw] = await db.select().from(ownerDrawProposals).where(eq(ownerDrawProposals.id, blockedDraw.id));
    assert.equal(persistedDraw.status, "needs_review");
  } finally {
    await db.delete(businessEntities).where(eq(businessEntities.id, business.id));
  }
});