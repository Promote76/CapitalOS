import { and, eq } from "drizzle-orm";
import {
  auditEventArchive, auditEvents, bankStatementDocuments, bankStatementTransactions,
  budgetPlanningCategorySnapshots, budgetPlanningPeriods, db, financeCategories,
  financeTransactions, financialAccounts, financialDocuments, householdMembers,
  households, users,
} from "@workspace/db";

const prefix = "document-budget-bridge-browser:";

export async function setupDocumentBudgetBridgeBrowserFixture(externalAuthId: string, email: string, runId: string, month: string) {
  const [identity] = await db.select({ userId: users.id, householdId: householdMembers.householdId })
    .from(users).innerJoin(householdMembers, and(eq(users.id, householdMembers.userId), eq(householdMembers.active, true)))
    .where(and(eq(users.externalAuthId, externalAuthId), eq(users.email, email), eq(users.status, "active"))).limit(1);
  if (!identity) throw new Error("Expected one active disposable household identity");
  const marker = `${prefix}${runId}`;
  return db.transaction(async (tx) => {
    const [account] = await tx.insert(financialAccounts).values({
      householdId: identity.householdId, institution: "Bridge fixture bank", nickname: `Bridge ${runId.slice(0, 8)}`,
      providerAccountRef: marker, accountType: "checking", currentBalance: "5000.00", availableBalance: "5000.00", dataSource: "manual",
    }).returning();
    const [housing] = await tx.insert(financeCategories).values({
      householdId: identity.householdId, name: `Bridge Housing ${runId}`, categoryType: "fixed_expense",
      essentialStatus: "essential", monthlyTarget: "900.00",
    }).returning();
    const [matchReview] = await tx.insert(financeCategories).values({
      householdId: identity.householdId, name: `Bridge Match Review ${runId}`, categoryType: "one_time_expense",
      essentialStatus: "mixed", monthlyTarget: "0.00",
    }).returning();
    const [period] = await tx.insert(budgetPlanningPeriods).values({
      householdId: identity.householdId, month: `${month}-01`, status: "approved", createdBy: identity.userId,
      approvedBy: identity.userId, approvedAt: new Date(),
    }).returning();
    await tx.insert(budgetPlanningCategorySnapshots).values({
      householdId: identity.householdId, periodId: period.id, sourceCategoryId: housing.id, name: housing.name,
      categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "900.00", sortOrder: 0,
      createdBy: identity.userId, updatedBy: identity.userId,
    });
    await tx.insert(budgetPlanningCategorySnapshots).values({
      householdId: identity.householdId, periodId: period.id, sourceCategoryId: matchReview.id, name: matchReview.name,
      categoryType: "one_time_expense", essentialStatus: "mixed", monthlyTarget: "0.00", sortOrder: 1,
      createdBy: identity.userId, updatedBy: identity.userId,
    });
    const [document] = await tx.insert(financialDocuments).values({
      householdId: identity.householdId, documentType: "BANK_STATEMENT", status: "VERIFIED",
      sourceFileName: `bridge-${runId}.csv`, mimeType: "text/csv", sourceObjectPath: `/browser-fixtures/${marker}`,
      documentHash: marker, uploadedBy: identity.userId, reviewedBy: identity.userId, reviewedAt: new Date(), reviewDecision: "VERIFIED",
    }).returning();
    const [statement] = await tx.insert(bankStatementDocuments).values({
      householdId: identity.householdId, documentId: document.id, accountId: account.id, institutionName: "Bridge fixture bank",
      statementStart: `${month}-01`, statementEnd: `${month}-28`, status: "VERIFIED",
    }).returning();
    const row = async (key: string, description: string, amount: string) => (await tx.insert(bankStatementTransactions).values({
      householdId: identity.householdId, bankStatementDocumentId: statement.id, postedDate: `${month}-15`, description, amount,
      direction: amount.startsWith("-") ? "withdrawal" : "deposit", evidenceFingerprint: `${marker}:${key}`, originalValue: { description, amount },
      reviewStatus: "RESOLVED", lastReviewAction: "APPROVE", reviewedBy: identity.userId, reviewedAt: new Date(),
      suggestedCategoryId: housing.id, suggestedCategoryConfidence: "HIGH", suggestedCategoryReason: "Fixture housing merchant",
    }).returning())[0];
    const rent = await row("rent", `Bridge Rent ${runId}`, "-900.00");
    const transfer = await row("transfer", `Bridge transfer ${runId}`, "-50.00");
    const settlement = await row("settlement", `Bridge settlement deposit ${runId}`, "100.00");
    const oneMatch = await row("one-match", `Bridge one match ${runId}`, "-72.00");
    const ambiguous = await row("ambiguous", `Bridge ambiguous ${runId}`, "-33.00");
    const standard = (description: string, amount: string) => ({
      householdId: identity.householdId, accountId: account.id, transactionDate: `${month}-15`, description, amount,
      originalAmount: amount, categoryId: matchReview.id, dataSource: "manual" as const, reviewStatus: "approved" as const,
      businessTag: "household" as const,
    });
    const [existing] = await tx.insert(financeTransactions).values(standard(oneMatch.description, "-72.00")).returning();
    await tx.insert(financeTransactions).values([
      standard(ambiguous.description, "-33.00"), standard(ambiguous.description, "-33.00"),
    ]);
    return { householdId: identity.householdId, accountId: account.id, categoryId: housing.id, matchCategoryId: matchReview.id, documentId: document.id, month, rows: {
      rent: rent.id, transfer: transfer.id, settlement: settlement.id, oneMatch: oneMatch.id, ambiguous: ambiguous.id,
    }, existingTransactionId: existing.id };
  });
}

export async function cleanupDocumentBudgetBridgeBrowserFixture(externalAuthId: string, email: string, runId: string) {
  if (!email.includes(`+dbb-${runId.slice(0, 8)}@`)) throw new Error("Refusing to purge a non-disposable bridge identity");
  const [identity] = await db.select({ userId: users.id }).from(users)
    .where(and(eq(users.externalAuthId, externalAuthId), eq(users.email, email))).limit(1);
  if (!identity) return { removed: false };
  const memberships = await db.select({ householdId: householdMembers.householdId }).from(householdMembers).where(eq(householdMembers.userId, identity.userId));
  if (memberships.length > 1) throw new Error("Refusing to purge an identity with multiple households");
  await db.transaction(async (tx) => {
    if (memberships[0]) {
      await tx.delete(auditEventArchive).where(eq(auditEventArchive.householdId, memberships[0].householdId));
      await tx.delete(auditEvents).where(eq(auditEvents.householdId, memberships[0].householdId));
      await tx.delete(households).where(eq(households.id, memberships[0].householdId));
    }
    await tx.delete(users).where(eq(users.id, identity.userId));
  });
  return { removed: true };
}