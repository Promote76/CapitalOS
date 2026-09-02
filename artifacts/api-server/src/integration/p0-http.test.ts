import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
type DbModule = typeof import("@workspace/db");
let database: DbModule | undefined;

type Fixture = {
  householdA: string;
  householdB: string;
  userA: string;
  userB: string;
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
  const [userB] = await db.insert(users).values({
    email: `p0-b-${randomUUID()}@capitalos.test`,
    displayName: "P0 Household B",
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
    { householdId: householdB.id, userId: userB.id, role: "owner", permissions: ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"], active: true },
    { householdId: householdB.id, userId: viewerB.id, role: "viewer", permissions: ["read"], active: true },
  ]);
  return { householdA: householdA.id, householdB: householdB.id, userA: userA.id, userB: userB.id, viewerB: viewerB.id };
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
    const { db, accounts } = database;
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

    const accountsResponse = await request("/accounts");
    assert.equal(accountsResponse.status, 200);
    const accountRows = await accountsResponse.json() as Array<{ id: string; accountType: string; balance: string }>;
    const source = accountRows.find((account) => account.accountType === "active_capital");
    const destination = accountRows.find((account) => account.accountType === "strategy_capital");
    assert.ok(source?.id && destination?.id, JSON.stringify(accountRows));
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
    assert.equal(refreshedSource?.balance, "0.40");
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
    await db.delete(users).where(inArray(users.id, [fixture.userA, fixture.userB, fixture.viewerB]));
  }
});