import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  businessEntities,
  businessReserves,
  db,
  financeTransactions,
  financialAccounts,
  householdMembers,
  households,
  users,
} from "@workspace/db";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
const permissions = ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"];

test("Business Income HTTP routes remain tenant isolated, role gated, idempotent, and evidence governed", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";

  const suffix = randomUUID();
  const identities = await Promise.all(["a", "b"].map(async (label) => {
    const [user] = await db.insert(users).values({
      email: `business-income-${label}-${suffix}@capitalos.test`,
      displayName: `Business Income ${label}`,
      status: "active",
    }).returning({ id: users.id });
    const [household] = await db.insert(households).values({
      name: `Business Income household ${label} ${suffix}`,
      timezone: "America/Chicago",
    }).returning({ id: households.id });
    await db.insert(householdMembers).values({
      householdId: household.id,
      userId: user.id,
      role: "owner",
      permissions,
      active: true,
    });
    return { userId: user.id, householdId: household.id };
  }));

  const [identityA, identityB] = identities;
  const [businessA] = await db.insert(businessEntities).values({
    householdId: identityA.householdId,
    legalName: `Business Income A ${suffix}`,
    displayName: `Business Income A ${suffix}`,
    createdBy: identityA.userId,
  }).returning({ id: businessEntities.id });
  const [businessB] = await db.insert(businessEntities).values({
    householdId: identityB.householdId,
    legalName: `Business Income B ${suffix}`,
    displayName: `Business Income B ${suffix}`,
    createdBy: identityB.userId,
  }).returning({ id: businessEntities.id });
  const [accountA] = await db.insert(financialAccounts).values({
    householdId: identityA.householdId,
    institution: "Business Income fixture bank",
    nickname: `Business Income cash ${suffix}`,
    accountType: "business_checking",
    currentBalance: "10000.00",
    availableBalance: "10000.00",
    businessEntityId: businessA.id,
    connectionStatus: "manual",
    dataSource: "manual",
  }).returning({ id: financialAccounts.id });
  await db.insert(businessReserves).values({
    householdId: identityA.householdId,
    businessId: businessA.id,
    targetMethod: "fixed",
    targetAmount: "1000.00",
    taxReserve: "0.00",
    safetyBuffer: "0.00",
    updatedBy: identityA.userId,
  });
  await db.insert(financeTransactions).values({
    householdId: identityA.householdId,
    accountId: accountA.id,
    externalId: `business-income-settlement-${suffix}`,
    transactionDate: "2026-09-15",
    description: "Settlement deposit",
    amount: "90.00",
    originalAmount: "90.00",
    dataSource: "manual",
    reviewStatus: "approved",
    businessTag: "business",
  });

  const { default: app } = await import("../app.ts");
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  const request = (
    route: string,
    init: RequestInit = {},
    identity = identityA,
    role = "owner",
  ) => fetch(`${baseUrl}${route}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Test-User-Id": identity.userId,
      "X-Test-Household-Id": identity.householdId,
      "X-Household-Role": role,
      ...(init.headers ?? {}),
    },
  });
  const settlementInput = {
    businessId: businessA.id,
    statementPeriodStart: "2026-09-01",
    statementPeriodEnd: "2026-09-15",
    paidDate: "2026-09-15",
    provider: "Fixture processor",
    sourceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    reportedGross: "100.00",
    reportedDeductions: "10.00",
    reportedNet: "90.00",
    revenueLines: [{ description: "September services", amount: "100.00" }],
    deductionLines: [{ description: "Processor fee", amount: "10.00" }],
  };

  try {
    const intelligenceBefore = await request("/business/income-intelligence");
    assert.equal(intelligenceBefore.status, 200);
    const intelligenceBeforeBody = await intelligenceBefore.json() as { businesses: Array<{ id: string }> };
    assert.ok(intelligenceBeforeBody.businesses.some((business) => business.id === businessA.id));
    assert.ok(intelligenceBeforeBody.businesses.every((business) => business.id !== businessB.id));

    const uploadUrl = await request("/business/income/documents/upload-url", {
      method: "POST",
      body: JSON.stringify({ name: "settlement.pdf", size: 1024, contentType: "application/pdf", documentType: "settlement" }),
    });
    assert.equal(uploadUrl.status, 200);

    const settlementResponse = await request("/business/income/settlements", {
      method: "POST",
      body: JSON.stringify(settlementInput),
    });
    assert.equal(settlementResponse.status, 201);
    const settlement = await settlementResponse.json() as { id: string; mathStatus: string; calculatedNet: string };
    assert.equal(settlement.mathStatus, "reconciled");
    assert.equal(settlement.calculatedNet, "90.00");
    const duplicateSettlementResponse = await request("/business/income/settlements", {
      method: "POST",
      body: JSON.stringify(settlementInput),
    });
    assert.equal(duplicateSettlementResponse.status, 409);

    const pnlResponse = await request("/business/income/profit-loss", {
      method: "POST",
      body: JSON.stringify({
        businessId: businessA.id,
        statementPeriodStart: "2026-09-01",
        statementPeriodEnd: "2026-09-15",
        reportedRevenue: "100.00",
        reportedExpenses: "10.00",
        reportedProfit: "90.00",
        lines: [{ description: "Services", lineType: "revenue", amount: "100.00" }, { description: "Fee", lineType: "expense", amount: "10.00" }],
      }),
    });
    assert.equal(pnlResponse.status, 201);

    const reconciliationResponse = await request("/business/income/reconcile", {
      method: "POST",
      body: JSON.stringify({
        businessId: businessA.id,
        statementPeriodStart: "2026-09-01",
        statementPeriodEnd: "2026-09-15",
        reportedProfit: "90.00",
      }),
    });
    assert.equal(reconciliationResponse.status, 201);
    assert.equal((await reconciliationResponse.json() as { status: string }).status, "reconciled");

    const cashMatchResponse = await request(`/business/income/settlements/${settlement.id}/cash-match`, { method: "POST" });
    assert.equal(cashMatchResponse.status, 200);
    assert.equal((await cashMatchResponse.json() as { matchStatus: string }).matchStatus, "matched");

    const cashPositionResponse = await request("/business/income/cash-position", {
      method: "POST",
      body: JSON.stringify({ businessId: businessA.id, asOf: "2026-09-15" }),
    });
    assert.equal(cashPositionResponse.status, 201);
    const cashPosition = await cashPositionResponse.json() as { safeToDistribute: string; status: string };
    assert.equal(cashPosition.safeToDistribute, "9000.00");
    assert.equal(cashPosition.status, "reviewable");

    const blockedDrawResponse = await request("/business/income/owner-draws", {
      method: "POST",
      body: JSON.stringify({ businessId: businessA.id, proposalDate: "2026-09-15", amount: "10000.00", notes: "Above available cash" }),
    });
    assert.equal(blockedDrawResponse.status, 201);
    const blockedDraw = await blockedDrawResponse.json() as { id: string; status: string; blockedReasons: string[] };
    assert.equal(blockedDraw.status, "needs_review");
    assert.ok(blockedDraw.blockedReasons.length > 0);
    const blockedApproval = await request(`/business/income/owner-draws/${blockedDraw.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedAmount: "1.00" }),
    });
    assert.equal(blockedApproval.status, 409);

    const eligibleDrawResponse = await request("/business/income/owner-draws", {
      method: "POST",
      body: JSON.stringify({ businessId: businessA.id, proposalDate: "2026-09-15", amount: "100.00", notes: "Verified settlement draw" }),
    });
    assert.equal(eligibleDrawResponse.status, 201);
    const eligibleDraw = await eligibleDrawResponse.json() as { id: string; status: string };
    assert.equal(eligibleDraw.status, "eligible", JSON.stringify(eligibleDraw));
    const approvalResponse = await request(`/business/income/owner-draws/${eligibleDraw.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedAmount: "100.00", notes: "Reviewed by owner" }),
    });
    assert.equal(approvalResponse.status, 200);
    const approval = await approvalResponse.json() as { proposal: { status: string }; verifiedIncome: { amount: string; verificationStatus: string } };
    assert.equal(approval.proposal.status, "approved");
    assert.equal(approval.verifiedIncome.amount, "100.00");
    assert.equal(approval.verifiedIncome.verificationStatus, "verified");

    const [viewerUser] = await db.insert(users).values({
      email: `business-income-viewer-${suffix}@capitalos.test`,
      displayName: "Business Income viewer",
      status: "active",
    }).returning({ id: users.id });
    await db.insert(householdMembers).values({
      householdId: identityA.householdId,
      userId: viewerUser.id,
      role: "viewer",
      permissions: ["read"],
      active: true,
    });
    const viewer = { userId: viewerUser.id, householdId: identityA.householdId };
    for (const [route, init] of [
      ["/business/income/settlements", { method: "POST", body: JSON.stringify(settlementInput) }],
      ["/business/income/reconcile", { method: "POST", body: JSON.stringify({ businessId: businessA.id, statementPeriodStart: "2026-09-01", statementPeriodEnd: "2026-09-15" }) }],
      ["/business/income/cash-position", { method: "POST", body: JSON.stringify({ businessId: businessA.id, asOf: "2026-09-16" }) }],
      ["/business/income/owner-draws", { method: "POST", body: JSON.stringify({ businessId: businessA.id, proposalDate: "2026-09-16", amount: "1.00" }) }],
    ] as Array<[string, RequestInit]>) {
      assert.equal((await request(route, init, viewer, "viewer")).status, 403, `${route} must require contribute`);
    }
    assert.equal((await request(`/business/income/settlements/${settlement.id}/cash-match`, { method: "POST" }, viewer, "viewer")).status, 403);
    assert.equal((await request(`/business/income/owner-draws/${eligibleDraw.id}/approve`, { method: "POST", body: JSON.stringify({ approvedAmount: "1.00" }) }, viewer, "viewer")).status, 403);

    const crossHouseholdGet = await request("/business/income-intelligence", {}, identityB);
    assert.equal(crossHouseholdGet.status, 200);
    const crossBody = await crossHouseholdGet.json() as { businesses: Array<{ id: string }>; settlements: Array<{ id: string }> };
    assert.ok(crossBody.businesses.every((business) => business.id !== businessA.id));
    assert.ok(crossBody.settlements.every((row) => row.id !== settlement.id));
    for (const [route, init] of [
      ["/business/income/settlements", { method: "POST", body: JSON.stringify(settlementInput) }],
      ["/business/income/profit-loss", { method: "POST", body: JSON.stringify({ businessId: businessA.id, statementPeriodStart: "2026-09-01", statementPeriodEnd: "2026-09-15", reportedRevenue: "1.00", reportedExpenses: "0.00", reportedProfit: "1.00", lines: [{ description: "Revenue", lineType: "revenue", amount: "1.00" }] }) }],
      ["/business/income/reconcile", { method: "POST", body: JSON.stringify({ businessId: businessA.id, statementPeriodStart: "2026-09-01", statementPeriodEnd: "2026-09-15" }) }],
      ["/business/income/cash-position", { method: "POST", body: JSON.stringify({ businessId: businessA.id, asOf: "2026-09-16" }) }],
      ["/business/income/owner-draws", { method: "POST", body: JSON.stringify({ businessId: businessA.id, proposalDate: "2026-09-16", amount: "1.00" }) }],
    ] as Array<[string, RequestInit]>) {
      assert.equal((await request(route, init, identityB)).status, 400, `${route} must reject another household`);
    }
    assert.equal((await request(`/business/income/settlements/${settlement.id}/cash-match`, { method: "POST" }, identityB)).status, 400);
    assert.equal((await request(`/business/income/owner-draws/${eligibleDraw.id}/approve`, { method: "POST", body: JSON.stringify({ approvedAmount: "1.00" }) }, identityB)).status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});