import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("bank statement parent review fails closed and reject cascades only pending evidence", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/financial-documents.ts");
  const budgetService = await import("../services/variable-income.ts");
  const { bankStatementDocuments, bankStatementTransactions, db, financialDocuments, financeTransactions, households, users, verifiedHouseholdIncomeEvents } = database;
  const [user] = await db.insert(users).values({ email: `parent-review-${randomUUID()}@test.invalid`, displayName: "Parent reviewer", status: "active" }).returning();
  const [household] = await db.insert(households).values({ name: `Parent review ${randomUUID()}`, timezone: "UTC" }).returning();
  const actor = { userId: user.id, householdId: household.id, role: "owner" as const, source: "test-database" as const };
  const makeStatement = async (parserErrors: unknown[] = []) => {
    const [document] = await db.insert(financialDocuments).values({
      householdId: household.id, documentType: "BANK_STATEMENT", status: "NEEDS_REVIEW", sourceFileName: "statement.csv",
      mimeType: "text/csv", sourceObjectPath: `/objects/uploads/${randomUUID()}`, documentHash: randomUUID(), uploadedBy: user.id,
      sourceMetadata: { parserErrors },
    }).returning();
    const [statement] = await db.insert(bankStatementDocuments).values({ householdId: household.id, documentId: document.id }).returning();
    return { document, statement };
  };
  const pending = await makeStatement();
  const [pendingChild] = await db.insert(bankStatementTransactions).values({
    householdId: household.id, bankStatementDocumentId: pending.statement.id, description: "pending", amount: "1.00",
    direction: "deposit", evidenceFingerprint: randomUUID(), originalValue: {},
  }).returning();
  await assert.rejects(() => service.reviewFinancialDocument(actor, pending.document.id, { decision: "VERIFIED", reason: "must fail" }), /every child row/);
  await assert.rejects(() => service.reviewBankStatementTransaction(actor, pendingChild.id, { action: "RECLASSIFY", reason: "bad correction", idempotencyKey: randomUUID(), correctedValue: { amount: "1.001" } }), /Corrected amount/);
  await service.reviewBankStatementTransaction(actor, pendingChild.id, { action: "APPROVE", reason: "reviewed", idempotencyKey: randomUUID() });
  await service.reviewFinancialDocument(actor, pending.document.id, { decision: "VERIFIED", reason: "all reviewed" });
  const parseError = await makeStatement(["ambiguous row"]);
  await assert.rejects(() => service.reviewFinancialDocument(actor, parseError.document.id, { decision: "VERIFIED", reason: "must fail" }), /parsing errors/);

  const cascading = await makeStatement();
  const inserted = await db.insert(bankStatementTransactions).values([
    { householdId: household.id, bankStatementDocumentId: cascading.statement.id, description: "still pending", amount: "2.00", direction: "deposit", evidenceFingerprint: randomUUID(), originalValue: {} },
    { householdId: household.id, bankStatementDocumentId: cascading.statement.id, description: "already reviewed", amount: "3.00", direction: "deposit", evidenceFingerprint: randomUUID(), originalValue: {}, reviewStatus: "RESOLVED", lastReviewAction: "APPROVE", reviewedBy: user.id, reviewedAt: new Date() },
  ]).returning();
  const officialBefore = await Promise.all([
    db.select().from(financeTransactions).where(eq(financeTransactions.householdId, household.id)),
    db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, household.id)),
  ]);
  await service.reviewFinancialDocument(actor, cascading.document.id, { decision: "REJECTED", reason: "reject source" });
  const after = await db.select().from(bankStatementTransactions).where(eq(bankStatementTransactions.bankStatementDocumentId, cascading.statement.id));
  assert.equal(after.find((row) => row.id === inserted[0].id)?.reviewStatus, "REJECTED");
  assert.equal(after.find((row) => row.id === inserted[0].id)?.lastReviewAction, "REJECT");
  assert.equal(after.find((row) => row.id === inserted[1].id)?.reviewStatus, "RESOLVED");
  assert.equal(after.find((row) => row.id === inserted[1].id)?.lastReviewAction, "APPROVE");
  const officialAfter = await Promise.all([
    db.select().from(financeTransactions).where(eq(financeTransactions.householdId, household.id)),
    db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, household.id)),
  ]);
  assert.equal(officialAfter[0].length, officialBefore[0].length);
  assert.equal(officialAfter[1].length, officialBefore[1].length);
  const intelligence = await budgetService.getVariableBudgetIntelligence(actor, "2026-02-01");
  assert.equal(intelligence.documentEvidence.affectsOfficialTotals, false);
  // The cascading statement's previously approved $3.00 child is excluded
  // after its parent rejection; only the separately verified $1.00 remains.
  assert.equal(intelligence.documentEvidence.reviewedDeposits, "1.00");
  assert.ok(intelligence.documentEvidence.sourceDocumentIds.includes(cascading.document.id));
  assert.ok(!intelligence.documentEvidence.sourceDocumentIds.includes(randomUUID()));
});