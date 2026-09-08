import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("financial document business links are authorized, household-scoped, idempotent, and audited", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/financial-documents.ts");
  const { auditEvents, businessEntities, db, financialDocuments, households, idempotencyKeys, users } = database;
  const suffix = randomUUID();
  const householdIds: string[] = [];
  const userIds: string[] = [];

  const makeHousehold = async (label: string) => {
    const [user] = await db.insert(users).values({
      email: `financial-document-link-${label}-${suffix}@test.invalid`,
      displayName: `Financial document link ${label}`,
      status: "active",
    }).returning();
    const [household] = await db.insert(households).values({
      name: `DISPOSABLE financial document link ${label} ${suffix}`,
      timezone: "UTC",
    }).returning();
    householdIds.push(household.id);
    userIds.push(user.id);
    return {
      user,
      household,
      actor: { userId: user.id, householdId: household.id, role: "owner" as const, source: "test-database" as const },
    };
  };

  try {
    const primary = await makeHousehold("primary");
    const foreign = await makeHousehold("foreign");
    const [business] = await db.insert(businessEntities).values({
      householdId: primary.household.id,
      legalName: `Linkable Business ${suffix}`,
      displayName: `Linkable Business ${suffix}`,
      createdBy: primary.user.id,
    }).returning();
    const [foreignBusiness] = await db.insert(businessEntities).values({
      householdId: foreign.household.id,
      legalName: `Foreign Business ${suffix}`,
      displayName: `Foreign Business ${suffix}`,
      createdBy: foreign.user.id,
    }).returning();
    const sourceObjectPath = `/objects/uploads/${randomUUID()}`;
    const [document] = await db.insert(financialDocuments).values({
      householdId: primary.household.id,
      documentType: "OTHER_FINANCIAL_DOCUMENT",
      detectedDocumentType: "BUSINESS_PROFIT_AND_LOSS",
      sourceFileName: "existing-pl.pdf",
      mimeType: "application/pdf",
      sourceObjectPath,
      documentHash: randomUUID(),
      uploadedBy: primary.user.id,
    }).returning();

    const input = { businessId: business.id, reason: "Confirmed this P&L belongs to the existing operating business", idempotencyKey: randomUUID() };
    const linked = await service.linkFinancialDocumentBusiness(primary.actor, document.id, input) as {
      businessId: string | null;
      sourceObjectPath: string;
    };
    assert.equal(linked.businessId, business.id);
    assert.equal(linked.sourceObjectPath, sourceObjectPath);

    const replay = await service.linkFinancialDocumentBusiness(primary.actor, document.id, input);
    assert.equal((replay as { businessId: string | null }).businessId, linked.businessId);
    assert.equal((replay as { sourceObjectPath: string }).sourceObjectPath, linked.sourceObjectPath);
    assert.equal((await db.select().from(auditEvents).where(and(
      eq(auditEvents.householdId, primary.household.id),
      eq(auditEvents.entityId, document.id),
      eq(auditEvents.eventType, "financial_document_business_linked"),
    ))).length, 1);
    assert.equal((await db.select().from(idempotencyKeys).where(and(
      eq(idempotencyKeys.householdId, primary.household.id),
      eq(idempotencyKeys.key, input.idempotencyKey),
    ))).length, 1);

    await assert.rejects(
      () => service.linkFinancialDocumentBusiness(primary.actor, document.id, {
        businessId: foreignBusiness.id,
        reason: "Attempted cross-household link",
        idempotencyKey: randomUUID(),
      }),
      /Business not found in this household/,
    );
    await assert.rejects(
      () => service.linkFinancialDocumentBusiness(foreign.actor, document.id, {
        businessId: foreignBusiness.id,
        reason: "Attempted cross-household document access",
        idempotencyKey: randomUUID(),
      }),
      /Financial document not found in this household/,
    );
    await assert.rejects(
      () => service.linkFinancialDocumentBusiness({ ...primary.actor, role: "viewer" }, document.id, {
        businessId: business.id,
        reason: "Viewer must not link",
        idempotencyKey: randomUUID(),
      }),
      /authorized|permission/i,
    );
  } finally {
    if (householdIds.length) await db.delete(auditEvents).where(inArray(auditEvents.householdId, householdIds));
    if (householdIds.length) await db.delete(idempotencyKeys).where(inArray(idempotencyKeys.householdId, householdIds));
    if (householdIds.length) await db.delete(households).where(inArray(households.id, householdIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  }
});