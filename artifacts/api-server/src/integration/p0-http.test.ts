import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { resetRateLimitForTests } from "../middleware/safety.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
type DbModule = typeof import("@workspace/db");
let database: DbModule | undefined;

function toCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

type Fixture = {
  householdA: string;
  householdB: string;
  userA: string;
  partnerA: string;
  advisorA: string;
  viewerA: string;
  userB: string;
  partnerB: string;
  advisorB: string;
  viewerB: string;
};

async function createFixture(): Promise<Fixture> {
  database ??= await import("@workspace/db");
  const { db, householdMembers, households, users } = database;
  const [userA] = await db.insert(users).values({
    email: `p0-a-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household A",
    status: "active",
  }).returning({ id: users.id });
  const [partnerA] = await db.insert(users).values({
    email: `p0-partner-a-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household A Partner",
    status: "active",
  }).returning({ id: users.id });
  const [advisorA] = await db.insert(users).values({
    email: `p0-advisor-a-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household A Advisor",
    status: "active",
  }).returning({ id: users.id });
  const [viewerA] = await db.insert(users).values({
    email: `p0-viewer-a-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household A Viewer",
    status: "active",
  }).returning({ id: users.id });
  const [userB] = await db.insert(users).values({
    email: `p0-b-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household B",
    status: "active",
  }).returning({ id: users.id });
  const [partnerB] = await db.insert(users).values({
    email: `p0-partner-b-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household B Partner",
    status: "active",
  }).returning({ id: users.id });
  const [advisorB] = await db.insert(users).values({
    email: `p0-advisor-b-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household B Advisor",
    status: "active",
  }).returning({ id: users.id });
  const [viewerB] = await db.insert(users).values({
    email: `p0-viewer-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household B Viewer",
    status: "active",
  }).returning({ id: users.id });
  const [householdA] = await db.insert(households).values({ name: `P0 A ${randomUUID()}`, timezone: "America/Chicago" }).returning({ id: households.id });
  const [householdB] = await db.insert(households).values({ name: `P0 B ${randomUUID()}`, timezone: "America/Chicago" }).returning({ id: households.id });
  await db.insert(householdMembers).values([
    { householdId: householdA.id, userId: userA.id, role: "owner", permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"], active: true },
    { householdId: householdA.id, userId: partnerA.id, role: "partner", permissions: ["read", "contribute", "transfer", "allocate"], active: true },
    { householdId: householdA.id, userId: advisorA.id, role: "advisor", permissions: ["read", "recommend", "review_venue_security", "review_venue_jurisdiction"], active: true },
    { householdId: householdA.id, userId: viewerA.id, role: "viewer", permissions: ["read"], active: true },
    { householdId: householdB.id, userId: userB.id, role: "owner", permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"], active: true },
    { householdId: householdB.id, userId: partnerB.id, role: "partner", permissions: ["read", "contribute", "transfer", "allocate"], active: true },
    { householdId: householdB.id, userId: advisorB.id, role: "advisor", permissions: ["read", "recommend", "review_venue_security", "review_venue_jurisdiction"], active: true },
    { householdId: householdB.id, userId: viewerB.id, role: "viewer", permissions: ["read"], active: true },
  ]);
  return {
    householdA: householdA.id,
    householdB: householdB.id,
    userA: userA.id,
    partnerA: partnerA.id,
    advisorA: advisorA.id,
    viewerA: viewerA.id,
    userB: userB.id,
    partnerB: partnerB.id,
    advisorB: advisorB.id,
    viewerB: viewerB.id,
  };
}

test("P0-05 contribution journey keeps the exact $250 movement after fresh reads and replay", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (route: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": fixture.userA,
        "X-Test-Household-Id": fixture.householdA,
        "X-Household-Role": "owner",
        "X-Test-Step-Up": "verified",
        ...(init.headers ?? {}),
      },
    });

  try {
    const { db, accounts, allocationRules, auditEvents, contributions, goals, ledgerEntries, ledgerTransactions } = database;
    const goalsBeforeResponse = await request("/goals");
    assert.equal(goalsBeforeResponse.status, 200);
    const goalsBefore = await goalsBeforeResponse.json() as Array<{
      id: string;
      currentAmount: string;
      protectedAmount: string;
    }>;
    const goalBefore = goalsBefore[0];
    assert.ok(goalBefore?.id);

    const [rule] = await db
      .select()
      .from(allocationRules)
      .where(and(eq(allocationRules.householdId, fixture.householdA), eq(allocationRules.active, true)))
      .orderBy(desc(allocationRules.createdAt))
      .limit(1);
    assert.ok(rule);
    assert.equal(rule.totalWeekly, "250.00", "The certification contribution must exercise the active $250 rule");

    const householdAccounts = await db
      .select({
        id: accounts.id,
        accountType: accounts.accountType,
        balance: accounts.balance,
      })
      .from(accounts)
      .where(eq(accounts.householdId, fixture.householdA));
    const accountByType = (accountType: string) => householdAccounts.find((account) => account.accountType === accountType);
    const treasury = accountByType("treasury");
    const duplex = accountByType("duplex_reserve");
    const active = accountByType("active_capital");
    const opportunity = accountByType("opportunity_reserve");
    assert.ok(treasury?.id && duplex?.id && active?.id && opportunity?.id);
    await db.update(accounts).set({ balance: "1000.00" }).where(eq(accounts.id, treasury.id));

    const amountCents = 25_000;
    const ruleTotalCents = Number(toCents(rule.totalWeekly));
    const expectedSplit: { duplex: number; capitalOs: number; opportunity: number } = {
      duplex: Math.floor((amountCents * Number(toCents(rule.duplexReserve))) / ruleTotalCents),
      capitalOs: Math.floor((amountCents * Number(toCents(rule.capitalOs))) / ruleTotalCents),
      opportunity: 0,
    };
    expectedSplit.opportunity = amountCents - expectedSplit.duplex - expectedSplit.capitalOs;
    const key = `browser-contribution-${randomUUID()}`;
    const input = {
      amount: "250.00",
      goalId: goalBefore.id,
      note: "P0-05 authenticated browser contribution",
    };

    const first = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(input),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json() as {
      id: string;
      amount: string;
      status: string;
      createdAt: string;
      idempotencyKey: string;
      metadata: { split?: { duplex?: number; capitalOs?: number; opportunity?: number } };
    };
    assert.equal(firstBody.amount, "250.00");
    assert.equal(firstBody.status, "completed");
    assert.equal(firstBody.idempotencyKey, key);
    assert.deepEqual(firstBody.metadata.split, expectedSplit);

    const replay = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(input),
    });
    assert.equal(replay.status, 201);
    const replayBody = await replay.json() as { id: string; amount: string; idempotencyKey: string };
    assert.deepEqual(replayBody, {
      id: firstBody.id,
      amount: "250.00",
      status: "completed",
      createdAt: firstBody.createdAt,
      idempotencyKey: key,
      metadata: firstBody.metadata,
    });

    const conflict = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ ...input, amount: "250.01" }),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const [storedContributionCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(contributions)
      .where(and(
        eq(contributions.householdId, fixture.householdA),
        eq(contributions.idempotencyKey, key),
      ));
    assert.equal(storedContributionCount?.count, 1, "Replay must not create a second contribution record");

    const movementRows = await db
      .select({
        id: ledgerTransactions.id,
        amount: ledgerTransactions.amount,
        sourceAccountId: ledgerTransactions.sourceAccountId,
        destinationAccountId: ledgerTransactions.destinationAccountId,
        createdBy: ledgerTransactions.createdBy,
        metadata: ledgerTransactions.metadata,
      })
      .from(ledgerTransactions)
      .where(and(
        eq(ledgerTransactions.householdId, fixture.householdA),
        eq(ledgerTransactions.category, "contribution"),
        sql`${ledgerTransactions.metadata}->>'idempotencyKey' = ${key}`,
      ));
    assert.equal(movementRows.length, 3);
    assert.deepEqual(
      movementRows.map((row) => [row.sourceAccountId, row.destinationAccountId, row.amount]).sort(),
      [
        [treasury.id, duplex.id, "200.00"],
        [treasury.id, active.id, "25.00"],
        [treasury.id, opportunity.id, "25.00"],
      ].sort(),
    );
    assert.ok(movementRows.every((row) => row.createdBy === fixture.userA));
    const [movementLedgerTotals] = await db
      .select({
        debits: sql<string>`coalesce(sum(${ledgerEntries.debit}), 0)::text`,
        credits: sql<string>`coalesce(sum(${ledgerEntries.credit}), 0)::text`,
      })
      .from(ledgerEntries)
      .where(inArray(ledgerEntries.transactionId, movementRows.map((row) => row.id)));
    assert.deepEqual(movementLedgerTotals, { debits: "250.00", credits: "250.00" });

    const [storedContribution] = await db
      .select({
        goalId: contributions.goalId,
        allocationRuleId: contributions.allocationRuleId,
        createdBy: contributions.createdBy,
      })
      .from(contributions)
      .where(eq(contributions.id, firstBody.id))
      .limit(1);
    assert.deepEqual(storedContribution, {
      goalId: goalBefore.id,
      allocationRuleId: rule.id,
      createdBy: fixture.userA,
    });
    const [contributionAudit] = await db
      .select({
        eventType: auditEvents.eventType,
        actor: auditEvents.actor,
        entity: auditEvents.entity,
        entityId: auditEvents.entityId,
      })
      .from(auditEvents)
      .where(and(
        eq(auditEvents.householdId, fixture.householdA),
        eq(auditEvents.entity, "contribution"),
        eq(auditEvents.entityId, firstBody.id),
      ))
      .limit(1);
    assert.deepEqual(contributionAudit, {
      eventType: "contribution_completed",
      actor: fixture.userA,
      entity: "contribution",
      entityId: firstBody.id,
    });

    const freshContributionsResponse = await request("/contributions");
    assert.equal(freshContributionsResponse.status, 200);
    const freshContributions = await freshContributionsResponse.json() as Array<{ id: string; amount: string; idempotencyKey: string }>;
    assert.deepEqual(
      freshContributions.filter((contribution) => contribution.idempotencyKey === key),
      [{ id: firstBody.id, amount: "250.00", status: "completed", createdAt: firstBody.createdAt, idempotencyKey: key, metadata: firstBody.metadata }],
    );

    const freshGoalsResponse = await request("/goals");
    assert.equal(freshGoalsResponse.status, 200);
    const freshGoal = (await freshGoalsResponse.json() as Array<{ id: string; currentAmount: string; protectedAmount: string }>)
      .find((goal) => goal.id === goalBefore.id);
    assert.equal(freshGoal?.currentAmount, fromCents(toCents(goalBefore.currentAmount) + BigInt(expectedSplit.duplex)));
    assert.equal(freshGoal?.protectedAmount, fromCents(toCents(goalBefore.protectedAmount) + BigInt(expectedSplit.duplex)));

    const freshAccountsResponse = await request("/accounts");
    assert.equal(freshAccountsResponse.status, 200);
    const freshAccounts = await freshAccountsResponse.json() as Array<{ id: string; balance: string }>;
    const freshBalance = (id: string) => freshAccounts.find((account) => account.id === id)?.balance;
    assert.equal(freshBalance(duplex.id), fromCents(toCents(duplex.balance) + BigInt(expectedSplit.duplex)));
    assert.equal(freshBalance(active.id), fromCents(toCents(active.balance) + BigInt(expectedSplit.capitalOs)));
    assert.equal(freshBalance(opportunity.id), fromCents(toCents(opportunity.balance) + BigInt(expectedSplit.opportunity)));
    const [freshTreasuryAccount] = await db
      .select({ balance: accounts.balance })
      .from(accounts)
      .where(eq(accounts.id, treasury.id))
      .limit(1);
    assert.equal(freshTreasuryAccount?.balance, "750.00", "Treasury must fund exactly one $250 contribution");

    const freshTreasuryResponse = await request("/treasury");
    assert.equal(freshTreasuryResponse.status, 200);
    const freshTreasury = await freshTreasuryResponse.json() as { buckets?: Array<{ bucketType?: string }> };
    assert.ok(Array.isArray(freshTreasury.buckets), "Fresh Treasury read must remain available after contribution");
    assert.ok(freshTreasury.buckets.some((bucket) => bucket.bucketType === "PROTECTED_GOAL"));

    const freshPortfolioResponse = await request("/portfolio");
    assert.equal(freshPortfolioResponse.status, 200);
    assert.equal((await freshPortfolioResponse.json() as { ledgerBalanced: boolean }).ledgerBalanced, true);
    const freshAuditResponse = await request("/audit");
    assert.equal(freshAuditResponse.status, 200);
    const freshAudit = await freshAuditResponse.json() as Array<{ actor: string; entityId: string; eventType: string }>;
    assert.ok(freshAudit.some((event) =>
      event.entityId === firstBody.id &&
      event.eventType === "contribution_completed" &&
      event.actor === fixture.userA,
    ));
    console.log(JSON.stringify({
      gate: "P0-05-CONTRIBUTION",
      amount: firstBody.amount,
      activeRule: {
        totalWeekly: rule.totalWeekly,
        duplexReserve: rule.duplexReserve,
        capitalOs: rule.capitalOs,
        opportunityReserve: rule.opportunityReserve,
      },
      split: expectedSplit,
      replayId: replayBody.id,
      contributionRecordsForKey: storedContributionCount?.count,
      ledgerMovementCount: movementRows.length,
      ledgerBalanced: true,
      auditActor: fixture.userA,
      conflictStatus: conflict.status,
    }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { db, households, users } = database;
    const householdIds = [fixture.householdA, fixture.householdB];
    const householdIdList = sql.join(householdIds.map((id) => sql`${id}::uuid`), sql`, `);
    await db.execute(sql`DELETE FROM ledger_entries
      WHERE account_id IN (
        SELECT id FROM capital_accounts
        WHERE household_id IN (${householdIdList})
      )`);
    await db.execute(sql`DELETE FROM ledger_transactions WHERE household_id IN (${householdIdList})`);
    await db.delete(households).where(inArray(households.id, householdIds));
    await db.delete(users).where(inArray(users.id, [
      fixture.userA,
      fixture.partnerA,
      fixture.advisorA,
      fixture.viewerA,
      fixture.userB,
      fixture.partnerB,
      fixture.advisorB,
      fixture.viewerB,
    ]));
  }
});

test("authenticated HTTP fixtures enforce household ownership, ignore role headers, and serialize idempotency", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  const request = (path: string, init: RequestInit = {}, userId = fixture.userA, householdId = fixture.householdA, stepUp = true) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": userId,
        "X-Test-Household-Id": householdId,
        "X-Household-Role": "owner",
        ...(stepUp ? { "X-Test-Step-Up": "verified" } : {}),
        ...(init.headers ?? {}),
      },
    });

  try {
    const goalsA = await request("/goals");
    assert.equal(goalsA.status, 200);
    const goalA = (await goalsA.json() as Array<{ id: string }>)[0];
    assert.ok(goalA?.id);
    const { db, accounts, contributions, auditEvents, ledgerEntries, ledgerTransactions, strategies } = database;
    const [treasury] = await db.select({ id: accounts.id }).from(accounts).where(and(
      eq(accounts.householdId, fixture.householdA),
      eq(accounts.accountType, "treasury"),
    )).limit(1);
    assert.ok(treasury?.id);
    await db.update(accounts).set({ balance: "100.00" }).where(eq(accounts.id, treasury.id));

    const goalsB = await request("/goals", {}, fixture.userB, fixture.householdB);
    assert.equal(goalsB.status, 200);
    const goalB = (await goalsB.json() as Array<{ id: string }>)[0];
    assert.ok(goalB?.id);
    assert.notEqual(goalA.id, goalB.id);

    const { businessEntities, financialAccounts } = database;
    const [business] = await db.insert(businessEntities).values({
      householdId: fixture.householdA,
      legalName: `P0 Business ${randomUUID()}`,
      displayName: `P0 Business ${randomUUID()}`,
      createdBy: fixture.userA,
    }).returning({ id: businessEntities.id });
    await db.insert(financialAccounts).values({
      householdId: fixture.householdA,
      institution: "P0 Test Bank",
      nickname: "P0 Business Cash",
      accountType: "business_checking",
      currentBalance: "1000.00",
      availableBalance: "1000.00",
      businessEntityId: business.id,
      connectionStatus: "manual",
      dataSource: "manual",
    });

    const capitalRequestInput = {
      requestingModule: "P0 Test Module",
      requestedAmount: "10.00",
      purpose: "Concurrent idempotency certification",
      expectedDuration: "30 days",
      riskClass: "conservative" as const,
      expectedReturnAssumption: "No autonomous execution",
      liquidityRequirement: "Immediate",
    };
    const capitalRequestKey = `capital-request-${randomUUID()}`;
    const capitalRequestResponses = await Promise.all([1, 2].map(() => request("/treasury/requests", {
      method: "POST",
      headers: { "Idempotency-Key": capitalRequestKey },
      body: JSON.stringify(capitalRequestInput),
    })));
    const capitalRequestDetails = await Promise.all(capitalRequestResponses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(capitalRequestDetails.map((response) => response.status), [201, 201], JSON.stringify(capitalRequestDetails));
    const capitalRequestIds = capitalRequestDetails.map((response) => (JSON.parse(response.body) as { id: string }).id);
    assert.equal(capitalRequestIds[0], capitalRequestIds[1]);
    const [capitalRequestCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(database.capitalRequests).where(and(
      eq(database.capitalRequests.householdId, fixture.householdA),
      eq(database.capitalRequests.id, capitalRequestIds[0]),
    ));
    assert.equal(capitalRequestCount?.count, 1);
    const capitalRequestAudits = await db.select({
      actor: auditEvents.actor,
    }).from(auditEvents).where(and(
      eq(auditEvents.householdId, fixture.householdA),
      eq(auditEvents.entity, "capital_request"),
      eq(auditEvents.entityId, capitalRequestIds[0]),
    ));
    assert.deepEqual(capitalRequestAudits, [{ actor: fixture.userA }]);
    const capitalRequestConflict = await request("/treasury/requests", {
      method: "POST",
      headers: { "Idempotency-Key": capitalRequestKey },
      body: JSON.stringify({ ...capitalRequestInput, requestedAmount: "11.00" }),
    });
    assert.equal(capitalRequestConflict.status, 409);
    assert.equal((await capitalRequestConflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const distributionInput = {
      businessId: business.id,
      distributionDate: new Date().toISOString().slice(0, 10),
      amount: "10.00",
      notes: "Concurrent idempotency certification",
    };
    const distributionKey = `business-distribution-${randomUUID()}`;
    const distributionResponses = await Promise.all([1, 2].map(() => request("/business/distributions", {
      method: "POST",
      headers: { "Idempotency-Key": distributionKey },
      body: JSON.stringify(distributionInput),
    })));
    const distributionDetails = await Promise.all(distributionResponses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(distributionDetails.map((response) => response.status), [201, 201], JSON.stringify(distributionDetails));
    const distributionIds = distributionDetails.map((response) => (JSON.parse(response.body) as { id: string }).id);
    assert.equal(distributionIds[0], distributionIds[1]);
    const [distributionCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(database.businessDistributions).where(and(
      eq(database.businessDistributions.householdId, fixture.householdA),
      eq(database.businessDistributions.id, distributionIds[0]),
    ));
    assert.equal(distributionCount?.count, 1);
    const distributionAudits = await db.select({
      actor: auditEvents.actor,
    }).from(auditEvents).where(and(
      eq(auditEvents.householdId, fixture.householdA),
      eq(auditEvents.entity, "business_distribution"),
      eq(auditEvents.entityId, distributionIds[0]),
    ));
    assert.deepEqual(distributionAudits, [{ actor: fixture.userA }]);
    const distributionConflict = await request("/business/distributions", {
      method: "POST",
      headers: { "Idempotency-Key": distributionKey },
      body: JSON.stringify({ ...distributionInput, amount: "11.00" }),
    });
    assert.equal(distributionConflict.status, 409);
    assert.equal((await distributionConflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const crossHouseholdContribution = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "10.00", goalId: goalA.id, note: "cross-household probe" }),
    }, fixture.userB, fixture.householdB);
    assert.equal(crossHouseholdContribution.status, 400);

    const viewerWrite = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "10.00", goalId: goalB.id }),
    }, fixture.viewerB, fixture.householdB);
    assert.equal(viewerWrite.status, 403);

    const partnerWrite = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        amount: "1.00",
        goalId: goalA.id,
        householdId: fixture.householdB,
        actorUserId: fixture.userB,
        protected: true,
        permissions: ["approve"],
      }),
    }, fixture.partnerA, fixture.householdA);
    assert.equal(partnerWrite.status, 201);
    const partnerContribution = await partnerWrite.json() as { id: string };
    const [storedPartnerContribution] = await db.select({
      householdId: contributions.householdId,
      createdBy: contributions.createdBy,
    }).from(contributions).where(eq(contributions.id, partnerContribution.id)).limit(1);
    assert.equal(storedPartnerContribution?.householdId, fixture.householdA);
    assert.equal(storedPartnerContribution?.createdBy, fixture.partnerA);
    const [partnerAudit] = await db.select({
      actor: auditEvents.actor,
    }).from(auditEvents).where(and(
      eq(auditEvents.entity, "contribution"),
      eq(auditEvents.entityId, partnerContribution.id),
      eq(auditEvents.householdId, fixture.householdA),
    )).limit(1);
    assert.equal(partnerAudit?.actor, fixture.partnerA);
    const advisorWrite = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "1.00", goalId: goalA.id }),
    }, fixture.advisorA, fixture.householdA);
    assert.equal(advisorWrite.status, 403);
    const viewerAWrite = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ amount: "1.00", goalId: goalA.id }),
    }, fixture.viewerA, fixture.householdA);
    assert.equal(viewerAWrite.status, 403);

    const key = randomUUID();
    const responses = await Promise.all([1, 2].map(() => request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ amount: "10.00", goalId: goalA.id }),
    })));
    const responseDetails = await Promise.all(responses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(responseDetails.map((response) => response.status), [201, 201], JSON.stringify(responseDetails));
    const payloads = responseDetails.map((response) => JSON.parse(response.body) as { id: string });
    assert.equal(payloads[0].id, payloads[1].id);
    const contributionConflict = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ amount: "11.00", goalId: goalA.id }),
    });
    assert.equal(contributionConflict.status, 409);
    assert.equal((await contributionConflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    const accountsResponse = await request("/accounts");
    assert.equal(accountsResponse.status, 200);
    const accountRows = await accountsResponse.json() as Array<{ id: string; accountType: string; balance: string }>;
    const source = accountRows.find((account) => account.accountType === "active_capital");
    const destination = accountRows.find((account) => account.accountType === "strategy_capital");
    assert.ok(source?.id && destination?.id, JSON.stringify(accountRows));
    const [strategy] = await db.select({ id: strategies.id }).from(strategies).where(eq(strategies.householdId, fixture.householdA)).limit(1);
    assert.ok(strategy?.id);
    await db.update(strategies).set({ stage: "approved" }).where(and(
      eq(strategies.id, strategy.id),
      eq(strategies.householdId, fixture.householdA),
    ));
    const strategyAllocationKey = `strategy-allocation-${randomUUID()}`;
    const strategyAllocationResponses = await Promise.all([1, 2].map(() => request(`/strategies/${strategy.id}/allocation`, {
      method: "POST",
      headers: { "Idempotency-Key": strategyAllocationKey },
      body: JSON.stringify({ sourceAccountId: source.id, amount: "0.01" }),
    })));
    const strategyAllocationDetails = await Promise.all(strategyAllocationResponses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(strategyAllocationDetails.map((response) => response.status), [201, 201], JSON.stringify(strategyAllocationDetails));
    const strategyAllocationIds = strategyAllocationDetails.map((response) => (JSON.parse(response.body) as { id: string }).id);
    assert.equal(strategyAllocationIds[0], strategyAllocationIds[1]);
    const [strategyAllocationCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(ledgerTransactions).where(and(
      eq(ledgerTransactions.householdId, fixture.householdA),
      eq(ledgerTransactions.idempotencyKey, strategyAllocationKey),
    ));
    assert.equal(strategyAllocationCount?.count, 1);
    const [strategyAllocationAudit] = await db.select({
      actor: auditEvents.actor,
    }).from(auditEvents).where(and(
      eq(auditEvents.entity, "strategy"),
      eq(auditEvents.entityId, strategy.id),
      eq(auditEvents.eventType, "strategy_allocation_completed"),
      eq(auditEvents.householdId, fixture.householdA),
    )).limit(1);
    assert.equal(strategyAllocationAudit?.actor, fixture.userA);
    const strategyAllocationConflict = await request(`/strategies/${strategy.id}/allocation`, {
      method: "POST",
      headers: { "Idempotency-Key": strategyAllocationKey },
      body: JSON.stringify({ sourceAccountId: source.id, amount: "0.02" }),
    });
    assert.equal(strategyAllocationConflict.status, 409);
    assert.equal((await strategyAllocationConflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");
    const replayKey = `transfer-replay-${randomUUID()}`;
    const replayResponses = await Promise.all([1, 2].map(() => request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": replayKey },
      body: JSON.stringify({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: "0.01" }),
    })));
    const replayDetails = await Promise.all(replayResponses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    assert.deepEqual(replayDetails.map((response) => response.status), [201, 201], JSON.stringify(replayDetails));
    const replayIds = replayDetails.map((response) => (JSON.parse(response.body) as { id: string }).id);
    assert.equal(replayIds[0], replayIds[1]);
    const [replayCount] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(ledgerTransactions).where(and(
      eq(ledgerTransactions.householdId, fixture.householdA),
      eq(ledgerTransactions.idempotencyKey, replayKey),
    ));
    assert.equal(replayCount?.count, 1);
    const [transferAudit] = await db.select({
      actor: auditEvents.actor,
    }).from(auditEvents).where(and(
      eq(auditEvents.entity, "ledger_transaction"),
      eq(auditEvents.entityId, replayIds[0]),
      eq(auditEvents.householdId, fixture.householdA),
    )).limit(1);
    assert.equal(transferAudit?.actor, fixture.userA);
    const transferConflict = await request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": replayKey },
      body: JSON.stringify({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: "0.02" }),
    });
    assert.equal(transferConflict.status, 409);
    assert.equal((await transferConflict.json() as { code: string }).code, "IDEMPOTENCY_CONFLICT");

    resetRateLimitForTests();
    const [currentSource] = await db.select({
      balance: accounts.balance,
    }).from(accounts).where(eq(accounts.id, source.id)).limit(1);
    assert.ok(currentSource?.balance);
    const sourceBalanceBeforeConcurrent = currentSource.balance;
    const blockedWithoutStepUp = await request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": `step-up-${randomUUID()}` },
      body: JSON.stringify({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: "0.10" }),
    }, fixture.userA, fixture.householdA, false);
    assert.equal(blockedWithoutStepUp.status, 403);
    const transferResponses = await Promise.all(["transfer-a", "transfer-b"].map((suffix) => request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": `${suffix}-${randomUUID()}` },
      body: JSON.stringify({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: "0.60" }),
    })));
    assert.deepEqual(transferResponses.map((response) => response.status).sort(), [201, 400]);
    const refreshedAccounts = await (await request("/accounts")).json() as Array<{ id: string; accountType: string; balance: string }>;
    const refreshedSource = refreshedAccounts.find((account) => account.id === source.id);
    assert.equal(refreshedSource?.balance, fromCents(toCents(sourceBalanceBeforeConcurrent) - 60n));

    await db.update(accounts).set({ balance: "1000.00" }).where(eq(accounts.id, source.id));
    const contentionResponses = await Promise.all(Array.from({ length: 100 }, (_, index) => request("/transfers", {
      method: "POST",
      headers: { "Idempotency-Key": `contention-${index}-${randomUUID()}` },
      body: JSON.stringify({ sourceAccountId: source.id, destinationAccountId: destination.id, amount: "25.00" }),
    })));
    const contentionDetails = await Promise.all(contentionResponses.map(async (response) => ({
      status: response.status,
      body: await response.text(),
    })));
    const successfulContention = contentionDetails
      .filter((response) => response.status === 201)
      .map((response) => (JSON.parse(response.body) as { id: string }).id);
    assert.equal(successfulContention.length, 40, JSON.stringify(contentionDetails));
    assert.equal(contentionDetails.filter((response) => response.status === 400).length, 60);

    const [postContentionSource] = await db.select({
      balance: accounts.balance,
    }).from(accounts).where(eq(accounts.id, source.id)).limit(1);
    assert.equal(postContentionSource?.balance, "0.00");
    const [ledgerTotals] = await db.select({
      debits: sql<string>`coalesce(sum(${ledgerEntries.debit}), 0)::text`,
      credits: sql<string>`coalesce(sum(${ledgerEntries.credit}), 0)::text`,
    }).from(ledgerEntries).where(inArray(ledgerEntries.transactionId, successfulContention));
    assert.equal(ledgerTotals?.debits, "1000.00");
    assert.equal(ledgerTotals?.credits, "1000.00");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { db, households, users } = database;
    const householdIds = [fixture.householdA, fixture.householdB];
    const householdIdList = sql.join(householdIds.map((id) => sql`${id}::uuid`), sql`, `);
    await db.execute(sql`DELETE FROM ledger_entries
      WHERE account_id IN (
        SELECT id FROM capital_accounts
        WHERE household_id IN (${householdIdList})
      )`);
    await db.execute(sql`DELETE FROM ledger_transactions WHERE household_id IN (${householdIdList})`);
    await db.delete(households).where(inArray(households.id, [fixture.householdA, fixture.householdB]));
     await db.delete(users).where(inArray(users.id, [
       fixture.userA,
       fixture.partnerA,
       fixture.advisorA,
       fixture.viewerA,
       fixture.userB,
       fixture.partnerB,
       fixture.advisorB,
       fixture.viewerB,
     ]));
  }
});

type RouteProbe = {
  method: string;
  path: string;
  params: string[];
};

const pathIdTables: Record<string, string> = {
  accountId: "capital_accounts",
  alertId: "operations_alerts",
  automationId: "operations_automations",
  businessId: "business_entities",
  billId: "finance_bills",
  candidateId: "property_candidates",
  expenseId: "upcoming_finance_expenses",
  incomeId: "income_sources",
  incidentId: "trading_incidents",
  recommendationId: "ai_recommendations",
  requestId: "capital_requests",
  requirementId: "reactivation_requirements",
  strategyId: "strategies",
  taskId: "operations_tasks",
  venueId: "venue_registry",
  approvalId: "operations_approvals",
};

function discoverRouteProbes(): RouteProbe[] {
  const routesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../routes");
  const routeFiles = fs.readdirSync(routesDir).filter((file) => file.endsWith(".ts"));
  const probes: RouteProbe[] = [];
  const expression = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const file of routeFiles) {
    const source = fs.readFileSync(path.join(routesDir, file), "utf8");
    for (const match of source.matchAll(expression)) {
      probes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        params: [...match[2].matchAll(/:([A-Za-z0-9_]+)/g)].map((param) => param[1]),
      });
    }
  }
  return probes.sort((left, right) => `${left.method} ${left.path}`.localeCompare(`${right.method} ${right.path}`));
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function bodyContainsAny(body: unknown, values: string[]): boolean {
  const serialized = JSON.stringify(body);
  return values.some((value) => serialized.includes(value));
}

async function firstHouseholdRecordId(table: string, householdId: string): Promise<string | undefined> {
  database ??= await import("@workspace/db");
  const query = table === "property_candidates"
    ? `SELECT property_candidates.id::text
       FROM property_candidates
       INNER JOIN property_goals ON property_goals.id = property_candidates.property_goal_id
       WHERE property_goals.household_id = '${householdId}'::uuid
       LIMIT 1`
    : `SELECT id::text FROM "${table}" WHERE household_id = '${householdId}'::uuid LIMIT 1`;
  const result = await database.db.execute(sql.raw(query));
  return (result.rows[0] as { id?: string } | undefined)?.id;
}

async function warmRouteMatrixResources(
  request: (route: string, init?: RequestInit, userId?: string, householdId?: string) => Promise<Response>,
  fixture: Fixture,
) {
  const seedRoutes = [
    "/goals",
    "/accounts",
    "/properties",
    "/strategies",
    "/financial-accounts",
    "/micro-live",
    "/operations",
    "/treasury",
    "/strategy-lab",
    "/intelligence",
    "/business",
  ];
  for (const route of seedRoutes) {
    resetRateLimitForTests();
    await request(route);
    resetRateLimitForTests();
    await request(route, {}, fixture.userB, fixture.householdB);
  }

  database ??= await import("@workspace/db");
  const [business] = await database.db.insert(database.businessEntities).values({
    householdId: fixture.householdA,
    legalName: `P0 Matrix Business ${randomUUID()}`,
    displayName: `P0 Matrix Business ${randomUUID()}`,
    createdBy: fixture.userA,
  }).returning({ id: database.businessEntities.id });
  const [businessB] = await database.db.insert(database.businessEntities).values({
    householdId: fixture.householdB,
    legalName: `P0 Matrix Business ${randomUUID()}`,
    displayName: `P0 Matrix Business ${randomUUID()}`,
    createdBy: fixture.userB,
  }).returning({ id: database.businessEntities.id });
  for (const [householdId, label] of [[fixture.householdA, "A"], [fixture.householdB, "B"]] as const) {
    await database.db.insert(database.financeBills).values({
      householdId,
      billName: `P0 Matrix Bill ${label}`,
      dueDate: "2026-09-15",
      expectedAmount: "100.00",
    });
    await database.db.insert(database.upcomingExpenses).values({
      householdId,
      name: `P0 Matrix Expense ${label}`,
      estimatedAmount: "50.00",
      expectedDate: "2026-09-20",
    });
    await database.db.insert(database.incomeSources).values({
      householdId,
      name: `P0 Matrix Income ${label}`,
      sourceType: "employment",
      expectedMonthly: "5000.00",
      cadence: "monthly",
      nextPayDate: "2026-09-15",
    });
  }

  const idsA: Record<string, string> = { businessId: business.id };
  const idsB: Record<string, string> = { businessId: businessB.id };
  for (const [param, table] of Object.entries(pathIdTables)) {
    const [idA, idB] = await Promise.all([
      firstHouseholdRecordId(table, fixture.householdA),
      firstHouseholdRecordId(table, fixture.householdB),
    ]);
    if (idA) idsA[param] = idA;
    if (idB) idsB[param] = idB;
  }
  return { idsA, idsB };
}

function replaceRouteParams(route: RouteProbe, values: Record<string, string>, fallback: string) {
  return route.path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => values[name] ?? fallback);
}

test("P0-01 preflight inventories all 108 routes and rejects unsafe generic probes", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (
    route: string,
    init: RequestInit = {},
    userId = fixture.userA,
    householdId = fixture.householdA,
  ) => fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User-Id": userId,
      "X-Test-Household-Id": householdId,
      "X-Household-Role": "owner",
      "X-Test-Step-Up": "verified",
      ...(init.headers ?? {}),
    },
  });

  try {
    const routes = discoverRouteProbes();
    assert.equal(routes.length, 108, "The route inventory changed; update the certification matrix before running it.");
    const { idsA, idsB } = await warmRouteMatrixResources(request, fixture);
    const allAIds = Object.values(idsA);
    const allBIds = Object.values(idsB);
    const bodyTamper = {
      householdId: fixture.householdB,
      userId: fixture.userB,
      actorUserId: fixture.userB,
      createdBy: fixture.userB,
      protected: true,
      permissions: ["approve", "manage_risk"],
      role: "owner",
      active: true,
    };
    let executed = 0;
    let scopedReads = 0;
    let rejectedCrossTenant = 0;
    let malformedRejected = 0;

    for (const route of routes) {
      resetRateLimitForTests();
      const baselinePath = route.params.length > 0
        ? replaceRouteParams(route, idsA, fixture.householdA)
        : route.path;
      const baseline = await request(baselinePath, { method: route.method });
      const baselineBody = await responseBody(baseline);
      executed += 1;

      if (route.path.startsWith("/health/") || route.path === "/healthz") {
        assert.equal(baseline.status, 200, `${route.method} ${route.path} health probe`);
        continue;
      }
      if (route.path.startsWith("/auth/")) {
        assert.equal(baseline.status, 401, `${route.method} ${route.path} must require Clerk identity`);
        continue;
      }
      assert.notEqual(baseline.status, 500, `${route.method} ${route.path} returned a server error`);

      if (route.method === "GET" && route.params.length === 0 && baseline.status === 200) {
        assert.equal(bodyContainsAny(baselineBody, allBIds), false, `${route.method} ${route.path} leaked Household B data to Household A`);
        resetRateLimitForTests();
        const other = await request(route.path, {}, fixture.userB, fixture.householdB);
        const otherBody = await responseBody(other);
        assert.equal(other.status, 200, `${route.method} ${route.path} Household B read`);
        assert.equal(bodyContainsAny(otherBody, allAIds), false, `${route.method} ${route.path} leaked Household A data to Household B`);
        scopedReads += 1;
        continue;
      }

      if (route.params.length === 0) {
        if (!["GET", "HEAD", "OPTIONS"].includes(route.method)) {
          resetRateLimitForTests();
          const tampered = await request(route.path, {
            method: route.method,
            body: JSON.stringify(bodyTamper),
          });
          const tamperedBody = await responseBody(tampered);
          assert.notEqual(tampered.status, 500, `${route.method} ${route.path} mass-assignment probe errored`);
          assert.equal(
            bodyContainsAny(tamperedBody, allBIds),
            false,
            `${route.method} ${route.path} returned another household's identifier from a mass-assignment body`,
          );
          executed += 1;
        }
        continue;
      }

      const samePath = replaceRouteParams(route, idsA, fixture.householdA);
      const crossPath = replaceRouteParams(route, idsB, randomUUID());
      const malformedPath = replaceRouteParams(
        route,
        Object.fromEntries(route.params.map((param) => [param, param === "kind" ? "invalid-kind" : "not-a-uuid"])),
        "not-a-uuid",
      );
      const init: RequestInit = route.method === "GET" || route.method === "DELETE"
        ? { method: route.method }
        : { method: route.method, body: JSON.stringify(bodyTamper) };

      resetRateLimitForTests();
      const same = await request(samePath, init);
      assert.notEqual(same.status, 500, `${route.method} ${samePath} same-household probe errored`);
      executed += 1;

      resetRateLimitForTests();
      const cross = await request(crossPath, init);
      assert.notEqual(cross.status, 200, `${route.method} ${crossPath} accepted a cross-household identifier`);
      assert.notEqual(cross.status, 201, `${route.method} ${crossPath} created a cross-household record`);
      assert.notEqual(cross.status, 500, `${route.method} ${crossPath} cross-household probe errored`);
      rejectedCrossTenant += 1;
      executed += 1;

      resetRateLimitForTests();
      const malformed = await request(malformedPath, init);
      const malformedBody = await responseBody(malformed);
      assert.ok(
        malformed.status >= 400 && malformed.status < 500,
        `${route.method} ${malformedPath} accepted a malformed identifier: ${malformed.status} ${JSON.stringify(malformedBody)}`,
      );
      malformedRejected += 1;
      executed += 1;
    }

    const parameterizedRoutes = routes.filter((route) => route.params.length > 0);
    const massAssignmentRoutes = routes.filter((route) =>
      route.params.length === 0 &&
      !["GET", "HEAD", "OPTIONS"].includes(route.method) &&
      !route.path.startsWith("/health/") &&
      route.path !== "/healthz" &&
      !route.path.startsWith("/auth/"),
    );
    assert.equal(
      executed,
      routes.length + (parameterizedRoutes.length * 3) + massAssignmentRoutes.length,
      "Every discovered route/probe case must execute",
    );
    assert.ok(scopedReads >= 30, `Expected broad scoped GET coverage, observed ${scopedReads}`);
    assert.ok(rejectedCrossTenant > 0, "Cross-household identifier probes did not execute");
    assert.ok(malformedRejected > 0, "Malformed identifier probes did not execute");
    console.log(JSON.stringify({
      gate: "P0-01-PREFLIGHT",
      routeCount: routes.length,
      executedProbes: executed,
      scopedCollectionReads: scopedReads,
      crossHouseholdRejections: rejectedCrossTenant,
      malformedRejections: malformedRejected,
      massAssignmentFields: Object.keys(bodyTamper),
    }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const householdIds = [fixture.householdA, fixture.householdB];
    const householdIdList = sql.join(householdIds.map((id) => sql`${id}::uuid`), sql`, `);
    await database.db.execute(sql`DELETE FROM ledger_entries
      WHERE account_id IN (
        SELECT id FROM capital_accounts WHERE household_id IN (${householdIdList})
      )`);
    await database.db.execute(sql`DELETE FROM ledger_transactions WHERE household_id IN (${householdIdList})`);
    await database.db.delete(database.households).where(inArray(database.households.id, householdIds));
    await database.db.delete(database.users).where(inArray(database.users.id, [
      fixture.userA, fixture.partnerA, fixture.advisorA, fixture.viewerA,
      fixture.userB, fixture.partnerB, fixture.advisorB, fixture.viewerB,
    ]));
  }
});

test("P0-06 and P0-08 preflight role, effective-permission, selection, tampering, and audit coverage", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (
    route: string,
    init: RequestInit = {},
    userId = fixture.userA,
    householdId = fixture.householdA,
  ) => fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User-Id": userId,
      "X-Test-Household-Id": householdId,
      "X-Household-Role": "owner",
      "X-Test-Step-Up": "verified",
      ...(init.headers ?? {}),
    },
  });

  try {
    const goalsResponse = await request("/goals");
    assert.equal(goalsResponse.status, 200);
    const goal = (await goalsResponse.json() as Array<{ id: string }>)[0];
    assert.ok(goal?.id);
    await database.db.update(database.accounts)
      .set({ balance: "100.00" })
      .where(and(
        eq(database.accounts.householdId, fixture.householdA),
        eq(database.accounts.accountType, "treasury"),
      ));
    const contributionBody = (amount: string) => JSON.stringify({
      amount,
      goalId: goal.id,
    });
    const members = database.householdMembers;
    const memberIds = {
      owner: fixture.userA,
      partner: fixture.partnerA,
      advisor: fixture.advisorA,
      viewer: fixture.viewerA,
    } as const;
    const allowed = new Set(["owner", "partner"]);
    const auditActors = new Set<string>();

    for (const [role, userId] of Object.entries(memberIds)) {
      resetRateLimitForTests();
      const read = await request("/household", {}, userId);
      assert.equal(read.status, 200, `${role} household read`);
      resetRateLimitForTests();
      const write = await request("/contributions", {
        method: "POST",
        headers: { "Idempotency-Key": `role-${role}-${randomUUID()}` },
        body: contributionBody("1.00"),
      }, userId);
      if (allowed.has(role)) {
        const writeBody = await responseBody(write);
        assert.equal(write.status, 201, `${role} contribution should be permitted: ${JSON.stringify(writeBody)}`);
        const created = writeBody as { id: string };
        const auditRows = await database.db.select({ actor: database.auditEvents.actor })
          .from(database.auditEvents)
          .where(and(
            eq(database.auditEvents.entity, "contribution"),
            eq(database.auditEvents.entityId, created.id),
            eq(database.auditEvents.householdId, fixture.householdA),
          ));
        assert.deepEqual(auditRows, [{ actor: userId }], `${role} audit actor attribution`);
        auditActors.add(userId);
      } else {
        assert.equal(write.status, 403, `${role} contribution should be denied`);
      }
    }
    assert.deepEqual(auditActors, new Set([fixture.userA, fixture.partnerA]));

    const viewerBefore = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(database.auditEvents)
      .where(and(
        eq(database.auditEvents.householdId, fixture.householdA),
        eq(database.auditEvents.actor, fixture.viewerA),
      ));
    resetRateLimitForTests();
    const spoofedViewer = await request("/contributions", {
      method: "POST",
      headers: {
        "Idempotency-Key": `viewer-spoof-${randomUUID()}`,
        "X-Household-Role": "owner",
      },
      body: JSON.stringify({
        amount: "1.01",
        goalId: goal.id,
        householdId: fixture.householdB,
        actorUserId: fixture.userB,
        permissions: ["approve"],
        protected: true,
      }),
    }, fixture.viewerA);
    assert.equal(spoofedViewer.status, 403);
    const viewerAfter = await database.db.select({ count: sql<number>`count(*)::int` })
      .from(database.auditEvents)
      .where(and(
        eq(database.auditEvents.householdId, fixture.householdA),
        eq(database.auditEvents.actor, fixture.viewerA),
      ));
    assert.equal(viewerAfter[0]?.count, viewerBefore[0]?.count, "Denied role tampering must not create an audit record");

    const [viewerMember] = await database.db.select({ id: members.id, permissions: members.permissions })
      .from(members)
      .where(and(eq(members.householdId, fixture.householdA), eq(members.userId, fixture.viewerA)));
    assert.ok(viewerMember);
    await database.db.update(members).set({ permissions: ["read", "contribute"] }).where(eq(members.id, viewerMember.id));
    resetRateLimitForTests();
    const granted = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": `viewer-grant-${randomUUID()}` },
      body: contributionBody("1.02"),
    }, fixture.viewerA);
    assert.equal(granted.status, 201, "Stored effective permission grant must take effect");
    const grantedContribution = await granted.json() as { id: string };
    const grantedAudit = await database.db.select({ actor: database.auditEvents.actor })
      .from(database.auditEvents)
      .where(eq(database.auditEvents.entityId, grantedContribution.id));
    assert.deepEqual(grantedAudit, [{ actor: fixture.viewerA }]);
    auditActors.add(fixture.viewerA);

    await database.db.update(members).set({ permissions: ["read"] }).where(eq(members.id, viewerMember.id));
    resetRateLimitForTests();
    const revoked = await request("/contributions", {
      method: "POST",
      headers: { "Idempotency-Key": `viewer-revoke-${randomUUID()}` },
      body: contributionBody("1.03"),
    }, fixture.viewerA);
    assert.equal(revoked.status, 403, "Stored effective permission revocation must take effect");

    await database.db.update(members).set({ active: false }).where(eq(members.id, viewerMember.id));
    resetRateLimitForTests();
    const inactive = await request("/household", {}, fixture.viewerA);
    assert.equal(inactive.status, 403, "Inactive membership must lose household access");
    await database.db.update(members).set({ active: true }).where(eq(members.id, viewerMember.id));

    const [multiHouseholdMembership] = await database.db.insert(members).values({
      householdId: fixture.householdB,
      userId: fixture.userA,
      role: "viewer",
      permissions: ["read"],
      active: true,
    }).returning({ id: members.id });
    assert.ok(multiHouseholdMembership);
    resetRateLimitForTests();
    const selectedB = await request("/household", {}, fixture.userA, fixture.householdB);
    assert.equal(selectedB.status, 200, "An explicitly selected member household must resolve");
    const selectedBBody = await selectedB.json() as { id?: string; household?: { id?: string } };
    assert.equal(selectedBBody.id ?? selectedBBody.household?.id, fixture.householdB);
    resetRateLimitForTests();
    const selectedA = await request("/household", {}, fixture.userA, fixture.householdA);
    assert.equal(selectedA.status, 200);
    const selectedABody = await selectedA.json() as { id?: string; household?: { id?: string } };
    assert.equal(selectedABody.id ?? selectedABody.household?.id, fixture.householdA);

    resetRateLimitForTests();
    const microLive = await request("/micro-live");
    assert.equal(microLive.status, 200);
    const venueId = await firstHouseholdRecordId("venue_registry", fixture.householdA);
    assert.ok(venueId);
    resetRateLimitForTests();
    const advisorReview = await request(`/micro-live/venues/${venueId}/reviews/security`, {
      method: "POST",
      body: JSON.stringify({ reviewReference: `review://capital-os/security/${randomUUID().replaceAll("-", "")}` }),
    }, fixture.advisorA);
    assert.equal(advisorReview.status, 201, "Advisor security review should be permitted");
    const advisorAudit = await database.db.select({ actor: database.auditEvents.actor })
      .from(database.auditEvents)
      .where(and(
        eq(database.auditEvents.householdId, fixture.householdA),
        eq(database.auditEvents.entity, "venue_registry"),
        eq(database.auditEvents.entityId, venueId),
        eq(database.auditEvents.eventType, "micro_live_venue_security_reviewed"),
      ));
    assert.deepEqual(advisorAudit, [{ actor: fixture.advisorA }]);
    auditActors.add(fixture.advisorA);

    const unsupportedAdministrationRoutes = [
      "/household/members",
      "/household/selection",
      `/household/members/${multiHouseholdMembership.id}`,
      `/household/members/${multiHouseholdMembership.id}/grant`,
      `/household/members/${multiHouseholdMembership.id}/revoke`,
    ];
    for (const route of unsupportedAdministrationRoutes) {
      resetRateLimitForTests();
      const response = await request(route);
      assert.equal(response.status, 404, `${route} is not a supported administration endpoint`);
    }

    console.log(JSON.stringify({
      gates: ["P0-06-PREFLIGHT", "P0-08-PREFLIGHT"],
      roles: Object.keys(memberIds),
      permittedRepresentativeActions: 4,
      deniedRepresentativeActions: 3,
      effectivePermissionTransitions: ["grant", "revoke"],
      membershipTransitions: ["inactive", "active"],
      householdSelectionCases: 2,
      roleTamperingCases: 1,
      persistedAuditActors: [...auditActors],
      unsupportedAdministrationRoutes: unsupportedAdministrationRoutes.length,
    }));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const householdIds = [fixture.householdA, fixture.householdB];
    const householdIdList = sql.join(householdIds.map((id) => sql`${id}::uuid`), sql`, `);
    await database.db.execute(sql`DELETE FROM ledger_entries
      WHERE account_id IN (
        SELECT id FROM capital_accounts WHERE household_id IN (${householdIdList})
      )`);
    await database.db.execute(sql`DELETE FROM ledger_transactions WHERE household_id IN (${householdIdList})`);
    await database.db.delete(database.households).where(inArray(database.households.id, householdIds));
    await database.db.delete(database.users).where(inArray(database.users.id, [
      fixture.userA, fixture.partnerA, fixture.advisorA, fixture.viewerA,
      fixture.userB, fixture.partnerB, fixture.advisorB, fixture.viewerB,
    ]));
  }
});

test("Financing Engine isolates households, permissions, actors, and idempotent writes", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (route: string, userId: string, householdId: string, role: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://capitalos.test",
        "X-Test-User-Id": userId,
        "X-Test-Household-Id": householdId,
        "X-Household-Role": role,
        "X-Test-Step-Up": "verified",
        ...(init.headers ?? {}),
      },
    });

  const liability = {
    name: "Household auto loan",
    liabilityType: "auto",
    ownership: "household",
    currentBalance: "12000.00",
    monthlyPayment: "375.00",
    notes: "Financing integration fixture",
  };
  const key = `financing-isolation-${randomUUID()}`;

  try {
    const ownerSnapshot = await request("/financing", fixture.userA, fixture.householdA, "owner");
    assert.equal(ownerSnapshot.status, 200);
    const initial = await ownerSnapshot.json() as {
      liabilities: Array<{ id: string; householdId?: string }>;
      cashToClose: { protectedCashExcluded: string; businessOperatingCashExcluded: string; fundingGap: string };
      readiness: { dtiPercent: number | null };
    };
    assert.equal(initial.liabilities.length, 0);
    assert.ok(Number(initial.cashToClose.fundingGap) >= 0);
    assert.ok(initial.cashToClose.protectedCashExcluded !== undefined);
    assert.ok(initial.cashToClose.businessOperatingCashExcluded !== undefined);

    const first = await request("/financing/liabilities", fixture.userA, fixture.householdA, "owner", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(liability),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json() as { id: string };
    assert.ok(firstBody.id);

    const replay = await request("/financing/liabilities", fixture.userA, fixture.householdA, "owner", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(liability),
    });
    assert.equal(replay.status, 201);
    assert.deepEqual(await replay.json(), firstBody);

    const conflict = await request("/financing/liabilities", fixture.userA, fixture.householdA, "owner", {
      method: "POST",
      headers: { "Idempotency-Key": key },
      body: JSON.stringify({ ...liability, name: "Changed after replay" }),
    });
    assert.equal(conflict.status, 409);

    const viewerWrite = await request("/financing/liabilities", fixture.viewerA, fixture.householdA, "owner", {
      method: "POST",
      headers: { "Idempotency-Key": `viewer-${randomUUID()}` },
      body: JSON.stringify(liability),
    });
    assert.equal(viewerWrite.status, 403);

    const householdB = await request("/financing", fixture.userB, fixture.householdB, "owner");
    assert.equal(householdB.status, 200);
    const otherSnapshot = await householdB.json() as { liabilities: Array<{ id: string }> };
    assert.equal(otherSnapshot.liabilities.some((item) => item.id === firstBody.id), false);

    const householdA = await request("/financing", fixture.userA, fixture.householdA, "owner");
    assert.equal(householdA.status, 200);
    const finalSnapshot = await householdA.json() as {
      liabilities: Array<{ id: string }>;
      readiness: { dtiPercent: number | null };
    };
    assert.equal(finalSnapshot.liabilities.some((item) => item.id === firstBody.id), true);
    assert.ok(finalSnapshot.readiness.dtiPercent === null || Number.isFinite(finalSnapshot.readiness.dtiPercent));

    const persisted = await database.db
      .select({ createdBy: database.financingLiabilities.createdBy, householdId: database.financingLiabilities.householdId })
      .from(database.financingLiabilities)
      .where(eq(database.financingLiabilities.id, firstBody.id));
    assert.deepEqual(persisted, [{ createdBy: fixture.userA, householdId: fixture.householdA }]);

    const audit = await database.db
      .select({ actor: database.auditEvents.actor })
      .from(database.auditEvents)
      .where(and(eq(database.auditEvents.householdId, fixture.householdA), eq(database.auditEvents.entityId, firstBody.id)));
    assert.deepEqual(audit, [{ actor: fixture.userA }]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const householdIds = [fixture.householdA, fixture.householdB];
    await database.db.delete(database.households).where(inArray(database.households.id, householdIds));
    await database.db.delete(database.users).where(inArray(database.users.id, [
      fixture.userA, fixture.partnerA, fixture.advisorA, fixture.viewerA,
      fixture.userB, fixture.partnerB, fixture.advisorB, fixture.viewerB,
    ]));
  }
});

test("household finance stays tenant-scoped and CSV imports are reviewable and duplicate-safe", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const fixture = await createFixture();
  database ??= await import("@workspace/db");
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (route: string, userId: string, householdId: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${route}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Test-User-Id": userId,
        "X-Test-Household-Id": householdId,
        "X-Household-Role": "owner",
        "X-Test-Step-Up": "verified",
        ...(init.headers ?? {}),
      },
    });

  try {
    const emptyBudget = await request("/budget", fixture.userA, fixture.householdA);
    assert.equal(emptyBudget.status, 200);
    const emptyBudgetBody = await emptyBudget.json() as { categories: unknown[]; month: string };
    assert.deepEqual(emptyBudgetBody.categories, []);
    assert.match(emptyBudgetBody.month, /^[A-Z][a-z]+ 20\d{2}$/);

    const accountAResponse = await request("/financial-accounts", fixture.userA, fixture.householdA, {
      method: "POST",
      body: JSON.stringify({
        institution: "Household bank",
        nickname: "Primary checking",
        accountType: "checking",
        currentBalance: "1250.00",
      }),
    });
    assert.equal(accountAResponse.status, 201);
    const accountA = await accountAResponse.json() as { id: string; dataSource: string };
    assert.equal(accountA.dataSource, "manual");

    const accountBResponse = await request("/financial-accounts", fixture.userB, fixture.householdB, {
      method: "POST",
      body: JSON.stringify({
        institution: "Other bank",
        nickname: "Other checking",
        accountType: "checking",
        currentBalance: "900.00",
      }),
    });
    assert.equal(accountBResponse.status, 201);
    const accountB = await accountBResponse.json() as { id: string };

    const csv = "date,description,amount\n2026-09-01,\"Coffee, shop\",-4.25";
    const firstImport = await request(`/financial-accounts/${accountA.id}/import-csv`, fixture.userA, fixture.householdA, {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
    assert.equal(firstImport.status, 200);
    assert.deepEqual(await firstImport.json(), { imported: 1, skippedDuplicates: 0, readOnly: true });

    const repeatedImport = await request(`/financial-accounts/${accountA.id}/import-csv`, fixture.userA, fixture.householdA, {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
    assert.equal(repeatedImport.status, 200);
    assert.deepEqual(await repeatedImport.json(), { imported: 0, skippedDuplicates: 1, readOnly: true });

    const householdBAccounts = await request("/financial-accounts", fixture.userB, fixture.householdB);
    assert.equal(householdBAccounts.status, 200);
    const householdBBody = await householdBAccounts.json() as { accounts: Array<{ id: string }> };
    assert.deepEqual(householdBBody.accounts.map((account) => account.id), [accountB.id]);

    const crossHouseholdImport = await request(`/financial-accounts/${accountB.id}/import-csv`, fixture.userA, fixture.householdA, {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
    assert.equal(crossHouseholdImport.status, 400);

    const importedRows = await database.db
      .select({ householdId: database.financeTransactions.householdId, dataSource: database.financeTransactions.dataSource, reviewStatus: database.financeTransactions.reviewStatus })
      .from(database.financeTransactions)
      .where(eq(database.financeTransactions.accountId, accountA.id));
    assert.deepEqual(importedRows, [{ householdId: fixture.householdA, dataSource: "csv_import", reviewStatus: "needs_review" }]);

    const financeAudit = await database.db
      .select({ actor: database.auditEvents.actor, eventType: database.auditEvents.eventType })
      .from(database.auditEvents)
      .where(and(eq(database.auditEvents.householdId, fixture.householdA), eq(database.auditEvents.entityId, accountA.id)));
    assert.ok(financeAudit.some((event) => event.actor === fixture.userA && event.eventType === "finance_csv_imported"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const householdIds = [fixture.householdA, fixture.householdB];
    await database.db.delete(database.households).where(inArray(database.households.id, householdIds));
    await database.db.delete(database.users).where(inArray(database.users.id, [
      fixture.userA, fixture.partnerA, fixture.advisorA, fixture.viewerA,
      fixture.userB, fixture.partnerB, fixture.advisorB, fixture.viewerB,
    ]));
  }
});