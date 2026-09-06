import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  budgetPlanningCategorySnapshots,
  budgetPlanningPeriods,
  auditEventArchive,
  auditEvents,
  db,
  financeCategories,
  financeTransactions,
  financialAccounts,
  householdMembers,
  households,
  pool,
  users,
} from "@workspace/db";

const FIXTURE_PREFIX = "budget-review-browser:";
const reasons = ["pending", "unreviewed", "nonHousehold", "excluded", "transfer", "uncategorized", "nonIncome"] as const;

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string) {
  const value = argument(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

export async function setupBudgetReviewBrowserFixture(
  externalAuthId: string,
  requestedRunId: string | undefined,
  month: string,
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("--month must use YYYY-MM");
  const runId = requestedRunId ?? randomUUID();
  const marker = `${FIXTURE_PREFIX}${runId}`;
  const identities = await db
    .select({ userId: users.id, householdId: householdMembers.householdId })
    .from(users)
    .innerJoin(householdMembers, and(eq(householdMembers.userId, users.id), eq(householdMembers.active, true)))
    .where(and(
      eq(users.externalAuthId, externalAuthId),
      eq(users.status, "active"),
    ));
  if (identities.length !== 1) throw new Error(`Expected exactly one active household membership for disposable identity ${externalAuthId}`);
  const identity = identities[0];

  const transactionDate = `${month}-15`;
  const [collision] = await db.select({ id: budgetPlanningPeriods.id }).from(budgetPlanningPeriods)
    .where(and(eq(budgetPlanningPeriods.householdId, identity.householdId), eq(budgetPlanningPeriods.month, `${month}-01`))).limit(1);
  if (collision) throw new Error(`Household already has a planning period for ${month}; choose an explicit unused fixture month`);
  return db.transaction(async (tx) => {
    const [account] = await tx.insert(financialAccounts).values({
      householdId: identity.householdId,
      institution: "Capital OS browser fixture",
      nickname: `Budget recovery ${runId.slice(0, 8)}`,
      providerAccountRef: marker,
      accountType: "checking",
      currentBalance: "5000.00",
      availableBalance: "5000.00",
      dataSource: "manual",
    }).returning({ id: financialAccounts.id });

    const categories = await tx.insert(financeCategories).values([
      { householdId: identity.householdId, name: `Browser spending ${runId}`, categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "2500.00" },
      { householdId: identity.householdId, name: `Browser income ${runId}`, categoryType: "income", essentialStatus: "essential", monthlyTarget: "5000.00" },
      { householdId: identity.householdId, name: `Browser transfer snapshot source ${runId}`, categoryType: "variable_discretionary", essentialStatus: "mixed", monthlyTarget: "0.00" },
    ]).returning({ id: financeCategories.id, categoryType: financeCategories.categoryType });
    const [spending, income, transfer] = categories;

    const [period] = await tx.insert(budgetPlanningPeriods).values({
      householdId: identity.householdId,
      month: `${month}-01`,
      status: "draft",
      version: 1,
      createdBy: identity.userId,
    }).returning({ id: budgetPlanningPeriods.id });
    await tx.insert(budgetPlanningCategorySnapshots).values([
      { householdId: identity.householdId, periodId: period.id, sourceCategoryId: spending.id, name: `Browser spending ${runId}`, categoryType: "variable_essential", essentialStatus: "essential", monthlyTarget: "2500.00", allocationBasisPoints: 10000, sortOrder: 0, createdBy: identity.userId, updatedBy: identity.userId },
      { householdId: identity.householdId, periodId: period.id, sourceCategoryId: income.id, name: `Browser income ${runId}`, categoryType: "income", essentialStatus: "essential", monthlyTarget: "5000.00", allocationBasisPoints: null, sortOrder: 1, createdBy: identity.userId, updatedBy: identity.userId },
      { householdId: identity.householdId, periodId: period.id, sourceCategoryId: transfer.id, name: `Browser transfer ${runId}`, categoryType: "transfer", essentialStatus: "mixed", monthlyTarget: "0.00", allocationBasisPoints: null, sortOrder: 2, createdBy: identity.userId, updatedBy: identity.userId },
    ]);

    const row = (reason: typeof reasons[number], values: Partial<typeof financeTransactions.$inferInsert>) => ({
      householdId: identity.householdId,
      accountId: account.id,
      externalId: `${marker}:${reason}`,
      transactionDate,
      description: `${marker}:${reason}`,
      merchant: `E2E ${reason} ${runId.slice(0, 8)}`,
      originalAmount: "-10.00",
      amount: "-10.00",
      categoryId: spending.id,
      dataSource: "manual" as const,
      reviewStatus: "approved" as const,
      businessTag: "household" as const,
      ...values,
    });
    const inserted = await tx.insert(financeTransactions).values([
      row("pending", { pending: true }),
      row("unreviewed", { reviewStatus: "needs_review" }),
      row("nonHousehold", { businessTag: "business" }),
      row("excluded", { reviewStatus: "excluded", excludedFromBudget: true }),
      row("transfer", { categoryId: transfer.id }),
      row("uncategorized", { categoryId: null, reviewStatus: "uncategorized" }),
      row("nonIncome", { categoryId: income.id, amount: "-25.00", originalAmount: "-25.00" }),
      { ...row("unreviewed", {}), externalId: `${marker}:verified-income`, description: `${marker}:verified-income`, merchant: `E2E verified income ${runId.slice(0, 8)}`, categoryId: income.id, amount: "5000.00", originalAmount: "5000.00" },
      { ...row("unreviewed", {}), externalId: `${marker}:included-outflow`, description: `${marker}:included-outflow`, merchant: `E2E included outflow ${runId.slice(0, 8)}`, amount: "-100.00", originalAmount: "-100.00" },
    ]).returning({ id: financeTransactions.id, externalId: financeTransactions.externalId });

    return {
      runId,
      marker,
      householdId: identity.householdId,
      userId: identity.userId,
      periodId: period.id,
      month,
      categoryId: spending.id,
      transactionIds: Object.fromEntries(inserted.filter((item) => item.externalId?.startsWith(marker)).map((item) => [item.externalId!.slice(marker.length + 1), item.id])),
    };
  });
}

type DisposableTenantOwner = {
  externalAuthId: string;
  email: string;
  householdId: string;
};

export async function cleanupDisposableBudgetReviewTenant(owner: Omit<DisposableTenantOwner, "householdId">, runId: string) {
  if (!owner.email.includes(`+brb-${runId.slice(0, 8)}@`)) throw new Error("Disposable tenant email does not contain the fixture ownership marker");
  const [identity] = await db.select({ userId: users.id })
    .from(users)
    .where(and(eq(users.externalAuthId, owner.externalAuthId), eq(users.email, owner.email)))
    .limit(1);
  if (!identity) return { removed: false };
  const memberships = await db.select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(eq(householdMembers.userId, identity.userId));
  if (memberships.length > 1) throw new Error("Refusing to purge a disposable identity with multiple household memberships");
  await db.transaction(async (tx) => {
    if (memberships[0]) {
      await tx.delete(auditEventArchive).where(eq(auditEventArchive.householdId, memberships[0].householdId));
      await tx.delete(auditEvents).where(eq(auditEvents.householdId, memberships[0].householdId));
      await tx.delete(householdMembers).where(eq(householdMembers.householdId, memberships[0].householdId));
      await tx.delete(households).where(eq(households.id, memberships[0].householdId));
    }
    await tx.delete(users).where(eq(users.id, identity.userId));
  });
  return { removed: true };
}

export async function cleanupBudgetReviewBrowserFixture(runId: string, options: { tenantOwner?: DisposableTenantOwner } = {}) {
  const marker = `${FIXTURE_PREFIX}${runId}`;
  const accounts = await db.select({ id: financialAccounts.id, householdId: financialAccounts.householdId })
    .from(financialAccounts).where(eq(financialAccounts.providerAccountRef, marker));
  if (accounts.length === 0) return { runId, removed: false };
  if (accounts.length !== 1) throw new Error(`Fixture marker ${marker} matched multiple accounts`);
  const householdId = accounts[0].householdId;
  let disposableUserId: string | undefined;
  if (options.tenantOwner) {
    if (options.tenantOwner.householdId !== householdId) throw new Error("Fixture account is not owned by the expected disposable household");
    if (!options.tenantOwner.email.includes(`+brb-${runId.slice(0, 8)}@`)) throw new Error("Disposable tenant email does not contain the fixture ownership marker");
    const members = await db.select({
      userId: users.id,
      externalAuthId: users.externalAuthId,
      email: users.email,
    }).from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, householdId));
    if (
      members.length !== 1 ||
      members[0].externalAuthId !== options.tenantOwner.externalAuthId ||
      members[0].email !== options.tenantOwner.email
    ) {
      throw new Error("Refusing to purge a household not exclusively owned by the disposable fixture identity");
    }
    disposableUserId = members[0].userId;
  }
  await db.transaction(async (tx) => {
    await tx.delete(financeTransactions).where(and(eq(financeTransactions.householdId, householdId), eq(financeTransactions.accountId, accounts[0].id)));
    const categories = await tx.select({ id: financeCategories.id }).from(financeCategories)
      .where(and(eq(financeCategories.householdId, householdId), eq(financeCategories.name, `Browser spending ${runId}`)));
    const periods = await tx.select({ id: budgetPlanningPeriods.id }).from(budgetPlanningPeriods)
      .where(and(eq(budgetPlanningPeriods.householdId, householdId), eq(budgetPlanningPeriods.createdAt, budgetPlanningPeriods.updatedAt)));
    for (const period of periods) {
      const [fixtureSnapshot] = await tx.select({ id: budgetPlanningCategorySnapshots.id }).from(budgetPlanningCategorySnapshots)
        .where(and(eq(budgetPlanningCategorySnapshots.periodId, period.id), eq(budgetPlanningCategorySnapshots.name, `Browser spending ${runId}`))).limit(1);
      if (fixtureSnapshot) await tx.delete(budgetPlanningPeriods).where(eq(budgetPlanningPeriods.id, period.id));
    }
    await tx.delete(financeCategories).where(and(eq(financeCategories.householdId, householdId), eq(financeCategories.name, `Browser transfer snapshot source ${runId}`)));
    await tx.delete(financeCategories).where(and(eq(financeCategories.householdId, householdId), eq(financeCategories.name, `Browser income ${runId}`)));
    if (categories[0]) await tx.delete(financeCategories).where(eq(financeCategories.id, categories[0].id));
    await tx.delete(financialAccounts).where(eq(financialAccounts.id, accounts[0].id));
    if (options.tenantOwner && disposableUserId) {
      await tx.delete(auditEventArchive).where(eq(auditEventArchive.householdId, householdId));
      await tx.delete(auditEvents).where(eq(auditEvents.householdId, householdId));
      await tx.delete(householdMembers).where(eq(householdMembers.householdId, householdId));
      await tx.delete(households).where(eq(households.id, householdId));
      await tx.delete(users).where(eq(users.id, disposableUserId));
    }
  });
  return { runId, householdId, removed: true, tenantPurged: Boolean(options.tenantOwner) };
}

async function main() {
  const command = process.argv.slice(2).find((value) => value !== "--" && !value.startsWith("--") && value !== argument("email") && value !== argument("run-id"));
  const result = command === "setup"
    ? await setupBudgetReviewBrowserFixture(requiredArgument("external-auth-id"), argument("run-id"), requiredArgument("month"))
    : command === "cleanup"
      ? await cleanupBudgetReviewBrowserFixture(requiredArgument("run-id"))
      : (() => { throw new Error("Usage: fixture:budget-review-browser -- setup --external-auth-id <clerk-user-id> --month <YYYY-MM> [--run-id <id>] | cleanup --run-id <id>"); })();
  console.log(JSON.stringify(result));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().finally(() => pool.end());
}