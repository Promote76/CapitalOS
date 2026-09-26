import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, ne } from "drizzle-orm";
import {
  accounts,
  db,
  financialAccounts,
  households,
  treasuryBuckets,
  users,
} from "@workspace/db";
import { getAccountingOverview } from "../services/accounting.ts";
import { getPortfolio } from "../services/capital-os.ts";
import { ensureTenantCore } from "../services/seed.ts";
import { getTreasury } from "../services/treasury.ts";

test("Accounting reconciles Treasury and internal Portfolio as separate observed scopes", async () => {
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `cross-view-reconciliation-${suffix}@test.invalid`,
    displayName: "Cross-view reconciliation fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE cross-view reconciliation ${suffix}`,
    timezone: "UTC",
  }).returning();
  const owner = {
    userId: user.id,
    householdId: household.id,
    role: "owner" as const,
    source: "test-database" as const,
  };
  const advisor = { ...owner, role: "advisor" as const };

  try {
    const ids = await ensureTenantCore(household.id, user.id, { fixtureMode: true });

    await db.update(accounts)
      .set({ balance: "0.00" })
      .where(and(eq(accounts.householdId, household.id), ne(accounts.accountType, "treasury")));
    await db.update(accounts)
      .set({ balance: "1234.56" })
      .where(eq(accounts.id, ids.capitalOsAccountId));

    const buckets = await db.select({ id: treasuryBuckets.id })
      .from(treasuryBuckets)
      .where(eq(treasuryBuckets.householdId, household.id));
    assert.ok(buckets.length > 0);
    await db.update(treasuryBuckets)
      .set({ currentBalance: "0.00", protected: false })
      .where(eq(treasuryBuckets.householdId, household.id));
    await db.update(treasuryBuckets)
      .set({ currentBalance: "321.00" })
      .where(eq(treasuryBuckets.id, buckets[0].id));

    await db.insert(financialAccounts).values({
      householdId: household.id,
      institution: "Fixture Bank",
      nickname: "Household Checking",
      accountType: "checking",
      currentBalance: "1000.00",
      availableBalance: "1000.00",
      connectionStatus: "manual",
      dataSource: "manual",
      includedInNetWorth: true,
      includedInBudget: true,
      protected: false,
    });

    const [portfolio, treasury, accounting] = await Promise.all([
      getPortfolio(owner),
      getTreasury(owner),
      getAccountingOverview(owner),
    ]);

    assert.equal(portfolio.totalCapital, "1234.56");
    assert.equal(treasury.totals.totalCapital, "321.00");
    assert.equal(accounting.netWorth.netWorth, "1000.00");

    const treasuryScope = accounting.reconciliation.crossView.separateScopes
      .find((scope) => scope.scope === "treasury");
    const portfolioScope = accounting.reconciliation.crossView.separateScopes
      .find((scope) => scope.scope === "internal_portfolio");
    const planningScope = accounting.reconciliation.crossView.separateScopes
      .find((scope) => scope.scope === "planning");

    assert.deepEqual(treasuryScope, {
      scope: "treasury",
      amount: treasury.totals.totalCapital,
      status: "separate_scope",
    });
    assert.deepEqual(portfolioScope, {
      scope: "internal_portfolio",
      amount: portfolio.totalCapital,
      status: "separate_scope",
    });
    assert.deepEqual(planningScope, {
      scope: "planning",
      amount: "NOT_AVAILABLE",
      status: "not_available",
    });

    const [advisorPortfolio, advisorTreasury, advisorAccounting] = await Promise.all([
      getPortfolio(advisor),
      getTreasury(advisor),
      getAccountingOverview(advisor),
    ]);
    assert.equal(advisorPortfolio.totalCapital, "REDACTED");
    assert.equal(advisorTreasury.totals.totalCapital, "REDACTED");
    assert.deepEqual(
      advisorAccounting.reconciliation.crossView.separateScopes
        .filter((scope) => ["treasury", "internal_portfolio"].includes(scope.scope))
        .map((scope) => ({ scope: scope.scope, amount: scope.amount, status: scope.status })),
      [
        { scope: "treasury", amount: "REDACTED", status: "restricted" },
        { scope: "internal_portfolio", amount: "REDACTED", status: "restricted" },
      ],
    );
  } finally {
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
});
