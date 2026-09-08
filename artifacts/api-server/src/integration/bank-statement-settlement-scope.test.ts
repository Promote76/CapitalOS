import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("statement settlement links cannot cross household scope", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/financial-documents.ts");
  const { bankStatementDocuments, bankStatementTransactions, businessEntities, db, financialDocuments, households, settlementDocuments, users } = database;
  const makeHousehold = async () => {
    const [user] = await db.insert(users).values({ email: `statement-scope-${randomUUID()}@test.invalid`, displayName: "Scope test", status: "active" }).returning();
    const [household] = await db.insert(households).values({ name: `Statement scope ${randomUUID()}`, timezone: "UTC" }).returning();
    return { user, household, actor: { userId: user.id, householdId: household.id, role: "owner" as const, source: "test-database" as const } };
  };
  const primary = await makeHousehold(); const foreign = await makeHousehold();
  const [statementDocument] = await db.insert(financialDocuments).values({ householdId: primary.household.id, documentType: "BANK_STATEMENT", status: "NEEDS_REVIEW", sourceFileName: "scope.csv", mimeType: "text/csv", sourceObjectPath: `/objects/uploads/${randomUUID()}`, documentHash: randomUUID(), uploadedBy: primary.user.id }).returning();
  const [statement] = await db.insert(bankStatementDocuments).values({ householdId: primary.household.id, documentId: statementDocument.id }).returning();
  const [evidence] = await db.insert(bankStatementTransactions).values({ householdId: primary.household.id, bankStatementDocumentId: statement.id, description: "Deposit", amount: "1.00", direction: "deposit", evidenceFingerprint: randomUUID(), originalValue: { text: "Deposit" } }).returning();
  const [business] = await db.insert(businessEntities).values({ householdId: primary.household.id, legalName: "Primary LLC", displayName: `Primary ${randomUUID()}`, createdBy: primary.user.id }).returning();
  const [foreignBusiness] = await db.insert(businessEntities).values({ householdId: foreign.household.id, legalName: "Foreign LLC", displayName: `Foreign ${randomUUID()}`, createdBy: foreign.user.id }).returning();
  const [localSettlement] = await db.insert(settlementDocuments).values({ householdId: primary.household.id, businessId: business.id, statementPeriodStart: "2026-01-01", statementPeriodEnd: "2026-01-07", createdBy: primary.user.id }).returning();
  const [foreignSettlement] = await db.insert(settlementDocuments).values({ householdId: foreign.household.id, businessId: foreignBusiness.id, statementPeriodStart: "2026-01-01", statementPeriodEnd: "2026-01-07", createdBy: foreign.user.id }).returning();
  const link = (settlementDocumentId: string, idempotencyKey: string) => service.reviewBankStatementTransaction(primary.actor, evidence.id, { action: "LINK_SETTLEMENT", settlementDocumentId, idempotencyKey, reason: "scope test" });
  await assert.rejects(() => link(foreignSettlement.id, `foreign-${randomUUID()}`), /Settlement document not found/);
  await assert.rejects(() => link(randomUUID(), `missing-${randomUUID()}`), /Settlement document not found/);
  const result = await link(localSettlement.id, `local-${randomUUID()}`);
  assert.equal((result as { linkedSettlementDocumentId: string }).linkedSettlementDocumentId, localSettlement.id);
});