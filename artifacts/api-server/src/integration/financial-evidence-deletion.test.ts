import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("financial evidence deletion is approver-only, isolated, fail-closed, idempotent, and preserves financial authority", { skip: !enabled }, async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStorageMode = process.env.CAPITAL_OS_TEST_OBJECT_STORAGE;
  process.env.NODE_ENV = "test";
  const database = await import("@workspace/db");
  const service = await import("../services/financial-evidence-deletion.ts");
  const {
    businessEntities,
    db,
    financeTransactions,
    financialAccounts,
    financialDocuments,
    financialDocumentTypeDetections,
    financialEvidenceDeletionTombstones,
    households,
    idempotencyKeys,
    users,
  } = database;
  const suffix = randomUUID();

  try {
    const [primaryUser, foreignUser] = await db.insert(users).values([
      { email: `evidence-delete-primary-${suffix}@test.invalid`, displayName: "Evidence deletion primary", status: "active" },
      { email: `evidence-delete-foreign-${suffix}@test.invalid`, displayName: "Evidence deletion foreign", status: "active" },
    ]).returning();
    const [primaryHousehold, foreignHousehold] = await db.insert(households).values([
      { name: `DISPOSABLE evidence deletion primary ${suffix}`, timezone: "UTC" },
      { name: `DISPOSABLE evidence deletion foreign ${suffix}`, timezone: "UTC" },
    ]).returning();
    const primaryActor = { userId: primaryUser.id, householdId: primaryHousehold.id, role: "owner" as const, source: "test-database" as const };
    const foreignActor = { userId: foreignUser.id, householdId: foreignHousehold.id, role: "owner" as const, source: "test-database" as const };

    const [business] = await db.insert(businessEntities).values({
      householdId: primaryHousehold.id,
      legalName: `Internal trucking boundary ${suffix}`,
      displayName: `Stevens operations ${suffix}`,
      entityType: "independent_contractor_business",
      createdBy: primaryUser.id,
    }).returning();
    const [account] = await db.insert(financialAccounts).values({
      householdId: primaryHousehold.id,
      institution: "Fixture Bank",
      nickname: "Preserved checking",
      accountType: "checking",
      currentBalance: "1500.00",
      connectionStatus: "manual",
      dataSource: "manual",
    }).returning();
    const [ledgerTransaction] = await db.insert(financeTransactions).values({
      householdId: primaryHousehold.id,
      accountId: account.id,
      transactionDate: "2026-09-08",
      description: "Preserved manual inflow",
      amount: "1500.00",
      reviewStatus: "approved",
    }).returning();
    const [primaryDocument] = await db.insert(financialDocuments).values({
      householdId: primaryHousehold.id,
      businessId: business.id,
      documentType: "BUSINESS_PROFIT_AND_LOSS",
      sourceFileName: "delete-me.pdf",
      mimeType: "application/pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      documentHash: randomUUID(),
      uploadedBy: primaryUser.id,
    }).returning();
    const [foreignDocument] = await db.insert(financialDocuments).values({
      householdId: foreignHousehold.id,
      documentType: "BANK_STATEMENT",
      sourceFileName: "foreign-must-remain.pdf",
      mimeType: "application/pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      documentHash: randomUUID(),
      uploadedBy: foreignUser.id,
    }).returning();
    const [primaryDocumentTwo] = await db.insert(financialDocuments).values({
      householdId: primaryHousehold.id,
      documentType: "OTHER_FINANCIAL_DOCUMENT",
      sourceFileName: "delete-me-too.pdf",
      mimeType: "application/pdf",
      sourceObjectPath: `/objects/uploads/${randomUUID()}`,
      documentHash: randomUUID(),
      uploadedBy: primaryUser.id,
    }).returning();
    await db.insert(financialDocumentTypeDetections).values({
      householdId: primaryHousehold.id,
      financialDocumentId: primaryDocument.id,
      selectedDocumentType: "BUSINESS_PROFIT_AND_LOSS",
      detectedDocumentType: "BUSINESS_PROFIT_AND_LOSS",
      confidence: "high",
      detectionVersion: "test-v1",
      createdBy: primaryUser.id,
    });

    const preflight = await service.getFinancialEvidenceResetPreflight(primaryActor);
    assert.equal(preflight.canApprove, true);
    assert.equal(preflight.counts.financialDocuments, 2);
    assert.equal(preflight.counts.documentTypeDetections, 1);
    assert.equal(preflight.counts.storageObjects, 2);

    const viewerPreflight = await service.getFinancialEvidenceResetPreflight({ ...primaryActor, role: "viewer" });
    assert.equal(viewerPreflight.canApprove, false);
    await assert.rejects(
      () => service.resetFinancialEvidence({ ...primaryActor, role: "viewer" }, {
        confirmationPhrase: "RESET FINANCIAL EVIDENCE",
        reason: "Viewer must not delete evidence",
        idempotencyKey: randomUUID(),
      }),
      /authorized|permission/i,
    );
    await assert.rejects(
      () => service.getFinancialDocumentDeletionPreflight(foreignActor, primaryDocument.id),
      /not found in this household/i,
    );

    process.env.CAPITAL_OS_TEST_OBJECT_STORAGE = "fail";
    await assert.rejects(
      () => service.resetFinancialEvidence(primaryActor, {
        confirmationPhrase: "RESET FINANCIAL EVIDENCE",
        reason: "Exercise fail-closed storage rollback",
        idempotencyKey: randomUUID(),
      }),
      /storage preflight rejected/i,
    );
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, primaryDocument.id))).length, 1);

    const idempotencyKey = randomUUID();
    const input = {
      confirmationPhrase: "RESET FINANCIAL EVIDENCE",
      reason: "Remove disposable uploaded evidence fixture",
      idempotencyKey,
    };
    process.env.CAPITAL_OS_TEST_OBJECT_STORAGE = "fail-after-one";
    await assert.rejects(() => service.resetFinancialEvidence(primaryActor, input), /storage deletion rejected/i);
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, primaryDocument.id))).length, 1);
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, primaryDocumentTwo.id))).length, 1);
    const [pendingOperation] = await db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, primaryHousehold.id),
      eq(idempotencyKeys.key, idempotencyKey),
    ));
    assert.equal(pendingOperation.responseStatus, 409);
    assert.equal((pendingOperation.responseBody as { deletedObjectPaths?: string[] }).deletedObjectPaths?.length, 1);

    process.env.CAPITAL_OS_TEST_OBJECT_STORAGE = "stub";
    const result = await service.resetFinancialEvidence(primaryActor, input);
    assert.equal(result.status, "DELETED");
    assert.equal(result.verification.householdLedgerTransactionsRemaining, 1);
    assert.equal(result.verification.canonicalBusinessEntityStillPresent, true);
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, primaryDocument.id))).length, 0);
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, foreignDocument.id))).length, 1);
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.id, ledgerTransaction.id))).length, 1);
    assert.equal((await db.select().from(financialAccounts).where(eq(financialAccounts.id, account.id))).length, 1);
    assert.equal((await db.select().from(businessEntities).where(eq(businessEntities.id, business.id))).length, 1);
    assert.equal((await db.select().from(financialDocumentTypeDetections).where(eq(financialDocumentTypeDetections.householdId, primaryHousehold.id))).length, 0);

    const replay = await service.resetFinancialEvidence(primaryActor, input);
    assert.equal(replay.status, "ALREADY_COMPLETED");
    assert.equal(replay.tombstoneId, result.tombstoneId);
    assert.equal((await db.select().from(financialEvidenceDeletionTombstones).where(and(
      eq(financialEvidenceDeletionTombstones.householdId, primaryHousehold.id),
      eq(financialEvidenceDeletionTombstones.idempotencyKey, idempotencyKey),
    ))).length, 1);
    await assert.rejects(
      () => service.resetFinancialEvidence(primaryActor, { ...input, reason: "A conflicting request fingerprint" }),
      /different deletion request/i,
    );

    const noBusinessResult = await service.resetFinancialEvidence(foreignActor, {
      confirmationPhrase: "RESET FINANCIAL EVIDENCE",
      reason: "Remove no-business household fixture evidence",
      idempotencyKey: randomUUID(),
    });
    assert.equal(noBusinessResult.status, "DELETED");
    assert.equal(noBusinessResult.verification.canonicalBusinessEntityStillPresent, false);
    assert.equal((await db.select().from(financialDocuments).where(eq(financialDocuments.id, foreignDocument.id))).length, 0);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousStorageMode === undefined) delete process.env.CAPITAL_OS_TEST_OBJECT_STORAGE;
    else process.env.CAPITAL_OS_TEST_OBJECT_STORAGE = previousStorageMode;
  }
});