import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import {
  BankingProviderError,
  registerReadOnlyBankingProvider,
  unregisterReadOnlyBankingProvider,
} from "../adapters/banking.ts";
import type { Actor } from "../services/capital-os.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("read-only bank sync certifies cursor replay, reauthorization, tenant isolation, and deletion", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/household-finance.ts");
  const { bankConnections, db, financeTransactions, householdMembers, households, users } = database;
  const [user] = await db.insert(users).values({
    email: `bank-sync-${randomUUID()}@capitalos.test`,
    displayName: "Bank sync fixture",
    status: "active",
  }).returning({ id: users.id });
  const [household] = await db.insert(households).values({
    name: `Bank sync ${randomUUID()}`,
    timezone: "America/Chicago",
  }).returning({ id: households.id });
  await db.insert(householdMembers).values({
    householdId: household.id,
    userId: user.id,
    role: "owner",
    permissions: ["read", "contribute", "approve"],
    active: true,
  });
  const actor: Actor = {
    userId: user.id,
    householdId: household.id,
    role: "owner",
    source: "test-database",
  };
  const primaryConnectionRef = `fixture-connection-${randomUUID()}`;
  const otherConnectionRef = `fixture-connection-other-${randomUUID()}`;
  const webhookEventId = `fixture-webhook-${randomUUID()}`;
  const olderWebhookEventId = `fixture-webhook-older-${randomUUID()}`;
  const [otherUser] = await db.insert(users).values({
    email: `bank-sync-other-${randomUUID()}@capitalos.test`,
    displayName: "Other bank sync fixture",
    status: "active",
  }).returning({ id: users.id });
  const [otherHousehold] = await db.insert(households).values({
    name: `Other bank sync ${randomUUID()}`,
    timezone: "America/Chicago",
  }).returning({ id: households.id });
  await db.insert(householdMembers).values({
    householdId: otherHousehold.id,
    userId: otherUser.id,
    role: "owner",
    permissions: ["read", "contribute", "approve"],
    active: true,
  });
  const otherActor: Actor = {
    userId: otherUser.id,
    householdId: otherHousehold.id,
    role: "owner",
    source: "test-database",
  };
  let mode: "initial" | "interrupted" | "replay" | "unauthenticated" | "reauthorized" | "outage" | "rate_limited" | "stale" | "tenant" = "initial";
  const calls: Array<{ credentialRef: string; cursor?: string }> = [];
  const reauthorizations: Array<{ credentialRef: string; replacementCredentialRef: string }> = [];
  const provider = {
    provider: "fixture-bank",
    readOnly: true as const,
    delivery: "polling_and_webhook" as const,
    transactionAmountConvention: "positive_inflow" as const,
    async reauthorize(input: { credentialRef: string; replacementCredentialRef: string }) {
      reauthorizations.push(input);
    },
    async verifyWebhook(input: { headers: Record<string, string | string[] | undefined>; body: Buffer }) {
      if (input.headers["x-fixture-signature"] !== "valid-signature") {
        throw new BankingProviderError("UNAUTHENTICATED", "invalid webhook signature");
      }
      return JSON.parse(input.body.toString("utf8")) as { eventId: string; providerConnectionRef: string };
    },
    async sync(input: { credentialRef: string; cursor?: string }) {
      calls.push(input);
      if (mode === "outage") throw new BankingProviderError("OUTAGE", "fixture outage");
      if (mode === "rate_limited") throw new BankingProviderError("RATE_LIMITED", "fixture rate limit");
      if (mode === "unauthenticated") throw new BankingProviderError("UNAUTHENTICATED", "fixture credential expired");
      const cursor = mode === "initial"
        ? "fixture-cursor-1"
        : mode === "tenant"
          ? "tenant-cursor-1"
          : mode === "reauthorized"
            ? "fixture-cursor-3"
            : input.cursor === "fixture-cursor-3"
              ? "fixture-cursor-3"
              : "fixture-cursor-2";
      const transactions = mode === "initial" || mode === "stale" || mode === "tenant"
        ? [{
            providerTransactionId: "fixture-transaction-1",
            providerAccountId: "fixture-account-1",
            transactionDate: "2026-09-03",
            description: mode === "tenant" ? "Other household transfer" : "Ambiguous transfer",
            amount: "-25.00",
            pending: false,
            reviewHint: "possible_transfer" as const,
          }]
        : mode === "reauthorized"
          ? [{
              providerTransactionId: "fixture-transaction-3",
              providerAccountId: "fixture-account-1",
              transactionDate: "2026-09-04",
              description: "Recovered polling item",
              amount: "-5.00",
              pending: false,
              reviewHint: "needs_review" as const,
            }]
          : [{
              providerTransactionId: "fixture-transaction-1",
              providerAccountId: "fixture-account-1",
              transactionDate: "2026-09-03",
              description: "Transfer corrected on replay",
              amount: "-25.00",
              pending: false,
              reviewHint: "possible_transfer" as const,
            }, {
              providerTransactionId: "fixture-transaction-2",
              providerAccountId: "fixture-account-1",
              transactionDate: mode === "interrupted" ? "not-a-date" : "2026-09-04",
              description: "Incremental polling item",
              amount: "-10.00",
              pending: false,
              reviewHint: "needs_review" as const,
            }];
      return {
        providerAsOf: mode === "stale"
          ? "2026-08-01T12:00:00.000Z"
          : new Date().toISOString(),
        cursor,
        accounts: [{
          providerAccountId: "fixture-account-1",
          name: "Checking",
          accountType: "checking",
          currentBalance: "100.00",
          availableBalance: "100.00",
        }],
        transactions,
      };
    },
  };
  registerReadOnlyBankingProvider(provider);
  try {
    const account = await service.createManualFinancialAccount(actor, {
      institution: "Fixture Bank",
      nickname: "Fixture checking",
      accountType: "checking",
      currentBalance: "100.00",
    });
    const connection = await service.createReadOnlyBankConnection(actor, {
      provider: "fixture-bank",
      institutionName: "Fixture Bank",
      providerConnectionRef: primaryConnectionRef,
      consent: true,
    });
    assert.equal(connection.credentialStored, true);
    assert.equal("credentialRef" in connection, false);
    await service.linkReadOnlyBankAccount(actor, connection.id, account.id, "fixture-account-1");

    const synced = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(synced.status, "matched");
    assert.equal(synced.applied, true);
    assert.equal(synced.reviewCount, 1);
    assert.equal(calls[0].cursor, undefined);
    const queue = await service.getTransactionReviewQueue(actor);
    assert.equal(queue.transactions.length, 1);
    assert.equal(queue.transactions[0].reviewStatus, "possible_transfer");
    mode = "interrupted";
    const interrupted = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(interrupted.status, "outage");
    assert.equal(interrupted.applied, false);
    assert.equal(calls.at(-1)?.cursor, "fixture-cursor-1");
    const [afterInterruption] = await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id));
    assert.equal(afterInterruption.syncCursor, "fixture-cursor-1");
    const interruptedRows = await db.select().from(financeTransactions).where(and(
      eq(financeTransactions.householdId, household.id),
      eq(financeTransactions.externalId, "fixture-transaction-2"),
    ));
    assert.equal(interruptedRows.length, 0);

    mode = "replay";
    const replayed = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(replayed.status, "matched");
    assert.equal(replayed.inserted, 1);
    assert.equal(replayed.updated, 1);
    assert.equal(calls.at(-1)?.cursor, "fixture-cursor-1");
    const [afterReplay] = await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id));
    assert.equal(afterReplay.syncCursor, "fixture-cursor-2");

    mode = "unauthenticated";
    const credentialFailure = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(credentialFailure.status, "revoked");
    assert.equal(credentialFailure.applied, false);
    const [needsReauthorization] = await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id));
    assert.equal(needsReauthorization.status, "needs_reauthentication");
    assert.equal(needsReauthorization.syncCursor, "fixture-cursor-2");

    const beforeReauthorizationRef = calls.at(-1)?.credentialRef;
    const reauthorizedConnection = await service.reauthorizeReadOnlyBankConnection(actor, connection.id);
    assert.equal(reauthorizedConnection.status, "connected");
    assert.equal(reauthorizations.length, 1);
    assert.equal(reauthorizations[0].credentialRef, beforeReauthorizationRef);
    assert.notEqual(reauthorizations[0].replacementCredentialRef, beforeReauthorizationRef);

    mode = "reauthorized";
    const recovered = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(recovered.status, "matched");
    assert.equal(recovered.inserted, 1);
    assert.equal(calls.at(-1)?.cursor, "fixture-cursor-2");
    assert.equal(calls.at(-1)?.credentialRef, reauthorizations[0].replacementCredentialRef);
    const [afterReauthorization] = await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id));
    assert.equal(afterReauthorization.status, "connected");
    assert.equal(afterReauthorization.syncCursor, "fixture-cursor-3");

    await assert.rejects(() => service.syncReadOnlyBankConnection({
      ...actor,
      householdId: randomUUID(),
    }, connection.id));

    const otherAccount = await service.createManualFinancialAccount(otherActor, {
      institution: "Fixture Bank",
      nickname: "Other fixture checking",
      accountType: "checking",
      currentBalance: "100.00",
    });
    const otherConnection = await service.createReadOnlyBankConnection(otherActor, {
      provider: "fixture-bank",
      institutionName: "Fixture Bank",
      providerConnectionRef: otherConnectionRef,
      consent: true,
    });
    await service.linkReadOnlyBankAccount(otherActor, otherConnection.id, otherAccount.id, "fixture-account-1");
    mode = "tenant";
    const otherSynced = await service.syncReadOnlyBankConnection(otherActor, otherConnection.id);
    assert.equal(otherSynced.status, "matched");
    assert.notEqual(calls.at(-1)?.credentialRef, calls[0].credentialRef);
    const sharedProviderIdRows = await db.select({
      householdId: financeTransactions.householdId,
    }).from(financeTransactions).where(and(
      eq(financeTransactions.externalId, "fixture-transaction-1"),
      inArray(financeTransactions.householdId, [household.id, otherHousehold.id]),
    ));
    assert.deepEqual(new Set(sharedProviderIdRows.map((row) => row.householdId)), new Set([household.id, otherHousehold.id]));
    await assert.rejects(() => service.exportReadOnlyBankConnection(otherActor, connection.id));

    const webhookHeaders = { "x-fixture-signature": "valid-signature" };
    const webhookBody = Buffer.from(JSON.stringify({
      eventId: webhookEventId,
      providerConnectionRef: primaryConnectionRef,
    }));
    await assert.rejects(() => service.processReadOnlyBankWebhook(
      "fixture-bank",
      { "x-fixture-signature": "invalid" },
      webhookBody,
    ));
    mode = "interrupted";
    await assert.rejects(() => service.processReadOnlyBankWebhook("fixture-bank", webhookHeaders, webhookBody));
    const [failedWebhook] = await db.select().from(database.bankWebhookEvents).where(eq(
      database.bankWebhookEvents.providerEventId,
      webhookEventId,
    ));
    assert.equal(failedWebhook.status, "failed");
    assert.equal(failedWebhook.householdId, household.id);
    assert.equal(afterReauthorization.syncCursor, "fixture-cursor-3");

    mode = "replay";
    const retriedWebhook = await service.processReadOnlyBankWebhook("fixture-bank", webhookHeaders, webhookBody);
    assert.equal(retriedWebhook.duplicate, false);
    const duplicatedWebhook = await service.processReadOnlyBankWebhook("fixture-bank", webhookHeaders, webhookBody);
    assert.equal(duplicatedWebhook.duplicate, true);
    const [completedWebhook] = await db.select().from(database.bankWebhookEvents).where(eq(
      database.bankWebhookEvents.providerEventId,
      webhookEventId,
    ));
    assert.equal(completedWebhook.status, "completed");
    assert.equal(completedWebhook.householdId, household.id);

    const outOfOrderWebhook = Buffer.from(JSON.stringify({
      eventId: olderWebhookEventId,
      providerConnectionRef: primaryConnectionRef,
    }));
    const outOfOrder = await service.processReadOnlyBankWebhook("fixture-bank", webhookHeaders, outOfOrderWebhook);
    assert.equal(outOfOrder.accepted, true);
    const [afterOutOfOrderWebhook] = await db.select().from(bankConnections).where(eq(bankConnections.id, connection.id));
    assert.equal(afterOutOfOrderWebhook.syncCursor, "fixture-cursor-3");
    const webhookTenantRows = await db.select().from(database.bankWebhookEvents).where(eq(
      database.bankWebhookEvents.providerEventId,
      olderWebhookEventId,
    ));
    assert.equal(webhookTenantRows[0].householdId, household.id);

    mode = "outage";
    const outage = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(outage.status, "outage");
    assert.equal(outage.applied, false);
    mode = "rate_limited";
    const rateLimited = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(rateLimited.status, "rate_limited");
    mode = "stale";
    const stale = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(stale.status, "stale");
    assert.equal(stale.applied, false);

    const exported = await service.exportReadOnlyBankConnection(actor, connection.id);
    assert.equal(exported.transactions.length, 3);
    assert.equal(JSON.stringify(exported).includes("bank-vault:"), false);

    const revoked = await service.revokeReadOnlyBankConnection(actor, connection.id);
    assert.equal(revoked.consentStatus, "revoked");
    mode = "initial";
    const afterRevoke = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(afterRevoke.status, "revoked");
    assert.equal(afterRevoke.applied, false);

    const deleted = await service.deleteReadOnlyBankConnectionData(actor, connection.id);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.unlinkedAccounts, 1);
    const remainingTransactions = await db.select({ id: database.financeTransactions.id })
      .from(database.financeTransactions)
      .where(and(
        eq(database.financeTransactions.externalId, "fixture-transaction-1"),
        inArray(database.financeTransactions.householdId, [household.id, otherHousehold.id]),
      ));
    assert.equal(remainingTransactions.length, 1);
    assert.equal(remainingTransactions[0].id.length > 0, true);
  } finally {
    unregisterReadOnlyBankingProvider("fixture-bank");
    // Audit history is immutable and deliberately outlives household records.
    // Certification runs use a disposable database, so retain this fixture as
    // evidence instead of weakening the append-only audit boundary for cleanup.
  }
});