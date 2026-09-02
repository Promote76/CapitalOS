import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
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
    assert.equal(capitalRequestConflict.status, 400);

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
    assert.equal(distributionConflict.status, 400);

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
    assert.equal(contributionConflict.status, 400);

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
    assert.equal(strategyAllocationConflict.status, 400);
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
    assert.equal(transferConflict.status, 400);

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