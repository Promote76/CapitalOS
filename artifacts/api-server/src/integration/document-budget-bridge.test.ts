import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("document-to-budget bridge only includes explicitly approved household evidence, exactly once", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const bridge = await import("../services/financial-documents.ts");
  const budget = await import("../services/household-finance.ts");
  const {
    auditEvents, bankStatementDocuments, bankStatementTransactions, budgetPlanningCategorySnapshots, budgetPlanningPeriods,
    db, financeCategories, financeTransactions, financialAccounts, financialDocuments, households, statementFinancialInclusions,
    statementFinancialReversals, users, verifiedHouseholdIncomeEvents,
  } = database;
  const suffix = randomUUID();
  const householdIds: string[] = [];
  const userIds: string[] = [];
  const makeHousehold = async (label: string) => {
    const [user] = await db.insert(users).values({ email: `bridge-${label}-${suffix}@test.invalid`, displayName: `Bridge ${label}`, status: "active" }).returning();
    const [household] = await db.insert(households).values({ name: `DISPOSABLE document bridge ${label} ${suffix}`, timezone: "UTC" }).returning();
    householdIds.push(household.id); userIds.push(user.id);
    const [account] = await db.insert(financialAccounts).values({ householdId: household.id, institution: "Fixture Bank", nickname: `Bridge ${label}`, accountType: "checking", currentBalance: "0.00", connectionStatus: "manual", dataSource: "manual" }).returning();
    const [housing] = await db.insert(financeCategories).values({ householdId: household.id, name: `Housing ${suffix}`, categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "900.00" }).returning();
    const [food] = await db.insert(financeCategories).values({ householdId: household.id, name: `Food ${suffix}`, categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "300.00" }).returning();
    const [transferCategory] = await db.insert(financeCategories).values({ householdId: household.id, name: `Credit card payment ${suffix}`, categoryType: "transfer", essentialStatus: "mixed", monthlyTarget: "0.00" }).returning();
    return { user, household, account, housing, food, transferCategory, actor: { userId: user.id, householdId: household.id, role: "owner" as const, source: "test-database" as const } };
  };

  try {
    const primary = await makeHousehold("primary");
    const foreign = await makeHousehold("foreign");
    const [document] = await db.insert(financialDocuments).values({
      householdId: primary.household.id, documentType: "BANK_STATEMENT", status: "NEEDS_REVIEW",
      sourceFileName: "bridge.csv", mimeType: "text/csv", sourceObjectPath: `/objects/uploads/${suffix}`, documentHash: suffix, uploadedBy: primary.user.id,
    }).returning();
    const [statement] = await db.insert(bankStatementDocuments).values({ householdId: primary.household.id, documentId: document.id, accountId: primary.account.id }).returning();
    const row = async (description: string, amount: string, postedDate = "2026-09-15") => (await db.insert(bankStatementTransactions).values({
      householdId: primary.household.id, bankStatementDocumentId: statement.id, postedDate, description, amount,
      direction: amount.startsWith("-") ? "withdrawal" : "deposit", evidenceFingerprint: randomUUID(), originalValue: { description, amount },
      reviewStatus: "RESOLVED", lastReviewAction: "APPROVE", reviewedBy: primary.user.id, reviewedAt: new Date(),
    }).returning())[0];

    const rent = await row("Exact signed rent", "-900.00");
    const oneMatch = await row("One match", "-50.00");
    const ambiguous = await row("Ambiguous", "-25.00");
    const transfer = await row("Transfer", "-10.00");
    const settlement = await row("Settlement", "10.00");
    const business = await row("Business", "-11.00");
    const unknown = await row("Unknown", "-12.00");
    const deposit = await row("Unverified deposit", "100.00");
    const simultaneous = await row("Simultaneous first import", "-17.25");
    const correctedSource = await row("Corrected source amount", "-14.00");
    const rollback = await row("Bad date", "-13.00", null as unknown as string);
    // Evidence approval is deliberately separate from financial inclusion.
    await bridge.reviewFinancialDocument(primary.actor, document.id, { decision: "VERIFIED", reason: "all evidence reviewed" });
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.householdId, primary.household.id))).length, 0);

    const decideHousehold = (id: string, categoryId = primary.housing.id, key = randomUUID()) => bridge.decideBankStatementTransactionCategory(primary.actor, id, {
      status: "USER_CONFIRMED", categoryId, economicClassification: "HOUSEHOLD", reason: "fixture classification", idempotencyKey: key,
    });
    await decideHousehold(rent.id);
    await decideHousehold(oneMatch.id);
    await decideHousehold(ambiguous.id);
    await decideHousehold(deposit.id);
    await decideHousehold(simultaneous.id);
    await decideHousehold(correctedSource.id);
    await decideHousehold(rollback.id);

    await assert.rejects(() => bridge.decideBankStatementTransactionCategory(primary.actor, rent.id, {
      status: "USER_CORRECTED", categoryId: foreign.housing.id, economicClassification: "HOUSEHOLD", reason: "foreign category", idempotencyKey: randomUUID(),
    }), /Category must be active and belong to this household/);
    await assert.rejects(() => bridge.decideBankStatementTransactionCategory(primary.actor, transfer.id, {
      status: "USER_CONFIRMED", categoryId: primary.transferCategory.id, economicClassification: "HOUSEHOLD", reason: "must use transfer exclusion", idempotencyKey: randomUUID(),
    }), /explicit transfer exclusion decision/);
    const noMatch = await bridge.previewBankStatementTransactionMatch(primary.actor, rent.id);
    assert.equal(noMatch.outcome, "NO_MATCH");

    const [period] = await db.insert(budgetPlanningPeriods).values({ householdId: primary.household.id, month: "2026-09-01", status: "approved", createdBy: primary.user.id, approvedBy: primary.user.id, approvedAt: new Date() }).returning();
    const [snapshot] = await db.insert(budgetPlanningCategorySnapshots).values({ householdId: primary.household.id, periodId: period.id, sourceCategoryId: primary.housing.id, name: "Housing", categoryType: "fixed_expense", essentialStatus: "essential", monthlyTarget: "900.00", createdBy: primary.user.id, updatedBy: primary.user.id }).returning();
    const rentImportKey = randomUUID();
    const imported = await bridge.importBankStatementTransaction(primary.actor, rent.id, { idempotencyKey: rentImportKey });
    assert.equal(imported.status, "IMPORTED_NEW");
    const [official] = await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, rent.id));
    assert.equal(official.amount, "-900.00");
    assert.equal(official.dataSource, "bank_statement_import");
    assert.equal(official.sourceDocumentId, document.id);
    assert.equal(official.metadata.provenance, "bank_statement_import");
    const detail = await budget.getBudgetPlanningCategoryContributionDetail(primary.actor, period.id, snapshot.id);
    assert.equal(detail.includedActual, "900.00");
    assert.equal(detail.category.monthlyTarget, "900.00");

    // A replay and concurrent requests cannot create another official row.
    const replay = await bridge.importBankStatementTransaction(primary.actor, rent.id, { idempotencyKey: rentImportKey });
    assert.equal(replay.id, imported.id);
    const concurrent = await Promise.all([
      bridge.importBankStatementTransaction(primary.actor, rent.id, { idempotencyKey: "rent-concurrent-a" }),
      bridge.importBankStatementTransaction(primary.actor, rent.id, { idempotencyKey: "rent-concurrent-b" }),
    ]);
    assert.ok(concurrent.every((result) => result.id === imported.id));
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, rent.id))).length, 1);
    assert.equal((await bridge.previewBankStatementTransactionMatch(primary.actor, rent.id)).outcome, "EXACT_ALREADY_LINKED");

    const simultaneousResults = await Promise.all([
      bridge.importBankStatementTransaction(primary.actor, simultaneous.id, { idempotencyKey: "simultaneous-first-a" }),
      bridge.importBankStatementTransaction(primary.actor, simultaneous.id, { idempotencyKey: "simultaneous-first-b" }),
    ]);
    assert.equal(simultaneousResults[0].id, simultaneousResults[1].id);
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, simultaneous.id))).length, 1);

    await bridge.reviewBankStatementTransaction(primary.actor, correctedSource.id, { action: "RECLASSIFY", reason: "correct source before import", idempotencyKey: randomUUID(), correctedValue: { amount: "-14.25" } });
    const correctedImport = await bridge.importBankStatementTransaction(primary.actor, correctedSource.id, { idempotencyKey: randomUUID() });
    const [correctedOfficial] = await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, correctedSource.id));
    assert.equal(correctedOfficial.amount, "-14.25");
    await bridge.reviewBankStatementTransaction(primary.actor, correctedSource.id, { action: "RECLASSIFY", reason: "post-import source correction", idempotencyKey: randomUUID(), correctedValue: { amount: "-14.50" } });
    const correctedMismatch = await bridge.getBankStatementTransactionInclusion(primary.actor, correctedSource.id);
    assert.equal(correctedMismatch.id, correctedImport.id);
    assert.equal(correctedMismatch.mismatchCode, "SOURCE_OFFICIAL_MISMATCH");
    assert.equal(correctedMismatch.reviewRequired, true);
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.id, correctedOfficial.id)))[0].amount, "-14.25");

    await db.insert(financeTransactions).values({ householdId: primary.household.id, accountId: primary.account.id, transactionDate: "2026-09-15", description: "One match", amount: "-50.00", categoryId: primary.housing.id, reviewStatus: "approved" });
    const one = await bridge.previewBankStatementTransactionMatch(primary.actor, oneMatch.id);
    assert.equal(one.outcome, "ONE_HIGH_CONFIDENCE_MATCH");
    const beforeLink = (await db.select().from(financeTransactions).where(eq(financeTransactions.householdId, primary.household.id))).length;
    await bridge.linkBankStatementTransaction(primary.actor, oneMatch.id, { financeTransactionId: one.candidates[0].financeTransactionId, idempotencyKey: randomUUID() });
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.householdId, primary.household.id))).length, beforeLink);
    await bridge.unlinkBankStatementTransaction(primary.actor, oneMatch.id, { reason: "unlink provenance only", idempotencyKey: randomUUID() });
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.householdId, primary.household.id))).length, beforeLink);

    await db.insert(financeTransactions).values([
      { householdId: primary.household.id, accountId: primary.account.id, transactionDate: "2026-09-15", description: "Ambiguous", amount: "-25.00", categoryId: primary.housing.id, reviewStatus: "approved" },
      { householdId: primary.household.id, accountId: primary.account.id, transactionDate: "2026-09-15", description: "Ambiguous", amount: "-25.00", categoryId: primary.housing.id, reviewStatus: "approved" },
    ]);
    assert.equal((await bridge.previewBankStatementTransactionMatch(primary.actor, ambiguous.id)).outcome, "MULTIPLE_CANDIDATES");
    await assert.rejects(() => bridge.importBankStatementTransaction(primary.actor, ambiguous.id, { idempotencyKey: randomUUID() }), /matching transaction/);
    await assert.rejects(() => bridge.linkBankStatementTransaction(primary.actor, ambiguous.id, { financeTransactionId: randomUUID(), idempotencyKey: randomUUID() }), /sole verified match/);

    for (const [evidence, status, classification] of [[transfer, "NOT_APPLICABLE_TRANSFER", "TRANSFER"], [settlement, "NOT_APPLICABLE_SETTLEMENT", "SETTLEMENT_LINK"], [business, "REJECTED", "BUSINESS"], [unknown, "REJECTED", "UNKNOWN"]] as const) {
      await bridge.decideBankStatementTransactionCategory(primary.actor, evidence.id, { status, economicClassification: classification, reason: "not household spending", idempotencyKey: randomUUID() });
      await assert.rejects(() => bridge.importBankStatementTransaction(primary.actor, evidence.id, { idempotencyKey: randomUUID() }), /Only explicitly classified household evidence/);
    }
    const incomeBefore = await db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, primary.household.id));
    await bridge.importBankStatementTransaction(primary.actor, deposit.id, { idempotencyKey: randomUUID() });
    assert.equal((await db.select().from(verifiedHouseholdIncomeEvents).where(eq(verifiedHouseholdIncomeEvents.householdId, primary.household.id))).length, incomeBefore.length);

    // A database error after validation rolls back the official row, inclusion, and audit together.
    await assert.rejects(() => bridge.importBankStatementTransaction(primary.actor, rollback.id, { idempotencyKey: randomUUID() }));
    assert.equal((await db.select().from(statementFinancialInclusions).where(eq(statementFinancialInclusions.statementRowId, rollback.id))).length, 0);
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.sourceStatementRowId, rollback.id))).length, 0);
    assert.equal((await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, rollback.id), eq(auditEvents.eventType, "statement_financial_imported")))).length, 0);

    const [foreignTransaction] = await db.insert(financeTransactions).values({ householdId: foreign.household.id, accountId: foreign.account.id, transactionDate: "2026-09-15", description: "Exact signed rent", amount: "-900.00", categoryId: foreign.housing.id, reviewStatus: "approved" }).returning();
    await assert.rejects(() => bridge.linkBankStatementTransaction(primary.actor, deposit.id, { financeTransactionId: foreignTransaction.id, idempotencyKey: randomUUID() }), /sole verified match/);
    const [foreignAccountDocument] = await db.insert(financialDocuments).values({
      householdId: primary.household.id, documentType: "BANK_STATEMENT", status: "NEEDS_REVIEW", sourceFileName: "foreign-account.csv",
      mimeType: "text/csv", sourceObjectPath: `/objects/uploads/foreign-${suffix}`, documentHash: `foreign-${suffix}`, uploadedBy: primary.user.id,
    }).returning();
    const [foreignAccountStatement] = await db.insert(bankStatementDocuments).values({ householdId: primary.household.id, documentId: foreignAccountDocument.id, accountId: foreign.account.id }).returning();
    const [foreignAccountRow] = await db.insert(bankStatementTransactions).values({ householdId: primary.household.id, bankStatementDocumentId: foreignAccountStatement.id, postedDate: "2026-09-15", description: "foreign account", amount: "-1.00", evidenceFingerprint: randomUUID(), originalValue: {}, reviewStatus: "RESOLVED", lastReviewAction: "APPROVE" }).returning();
    await assert.rejects(() => bridge.previewBankStatementTransactionMatch(primary.actor, foreignAccountRow.id), /Statement account does not belong/);

    await bridge.reviewFinancialDocument(primary.actor, document.id, { decision: "REJECTED", reason: "source later rejected" });
    await bridge.decideBankStatementTransactionCategory(primary.actor, rent.id, { status: "USER_CORRECTED", categoryId: primary.food.id, economicClassification: "HOUSEHOLD", reason: "source category correction", idempotencyKey: randomUUID() });
    const mismatch = await bridge.getBankStatementTransactionInclusion(primary.actor, rent.id);
    assert.equal(mismatch.reviewRequired, true);
    assert.equal(mismatch.mismatchCode, "SOURCE_OFFICIAL_MISMATCH");
    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.id, official.id))).length, 1);
    assert.ok((await bridge.listFinancialReviewQueue(primary.actor)).items.some((item) => item.type === "source_official_mismatch" && item.id === imported.id));
    const reverse = await bridge.reverseBankStatementTransactionImport(primary.actor, rent.id, { reason: "reversal keeps source history", idempotencyKey: randomUUID() });
    assert.equal(reverse.inclusion.status, "REVERSED");
    const [reversedTransaction] = await db.select().from(financeTransactions).where(eq(financeTransactions.id, official.id));
    assert.equal(reversedTransaction.excludedFromBudget, true);
    assert.equal(reversedTransaction.sourceStatementRowId, rent.id);
    assert.equal((await db.select().from(statementFinancialReversals).where(eq(statementFinancialReversals.inclusionId, imported.id))).length, 1);
    assert.ok((await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, imported.id), inArray(auditEvents.eventType, ["statement_financial_imported", "statement_financial_reversed"])))).length >= 2);
    assert.equal((await bridge.previewBankStatementTransactionMatch(primary.actor, rent.id)).outcome, "KNOWN_DUPLICATE");
    await assert.rejects(() => bridge.importBankStatementTransaction({ ...primary.actor, role: "viewer" }, deposit.id, { idempotencyKey: randomUUID() }), /permission|authorized|approve/i);
  } finally {
    if (householdIds.length) await db.delete(auditEvents).where(inArray(auditEvents.householdId, householdIds));
    if (householdIds.length) await db.delete(households).where(inArray(households.id, householdIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  }
});