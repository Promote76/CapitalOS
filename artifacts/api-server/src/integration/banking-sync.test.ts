import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  BankingProviderError,
  registerReadOnlyBankingProvider,
  unregisterReadOnlyBankingProvider,
} from "../adapters/banking.ts";
import type { Actor } from "../services/capital-os.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

test("read-only bank sync gates consent, reconciliation, recovery, and deletion", { skip: !enabled }, async () => {
  const database = await import("@workspace/db");
  const service = await import("../services/household-finance.ts");
  const { db, householdMembers, households, users } = database;
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
  let mode: "healthy" | "outage" | "rate_limited" | "stale" = "healthy";
  const provider = {
    provider: "fixture-bank",
    readOnly: true as const,
    async sync() {
      if (mode === "outage") throw new BankingProviderError("OUTAGE", "fixture outage");
      if (mode === "rate_limited") throw new BankingProviderError("RATE_LIMITED", "fixture rate limit");
      return {
        providerAsOf: mode === "stale"
          ? "2026-08-01T12:00:00.000Z"
          : new Date().toISOString(),
        cursor: "fixture-cursor-1",
        accounts: [{
          providerAccountId: "fixture-account-1",
          name: "Checking",
          accountType: "checking",
          currentBalance: "100.00",
          availableBalance: "100.00",
        }],
        transactions: [{
          providerTransactionId: "fixture-transaction-1",
          providerAccountId: "fixture-account-1",
          transactionDate: "2026-09-03",
          description: "Ambiguous transfer",
          amount: "-25.00",
          pending: false,
          reviewHint: "possible_transfer" as const,
        }],
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
      providerConnectionRef: "fixture-connection-1",
      consent: true,
    });
    assert.equal(connection.credentialStored, true);
    assert.equal("credentialRef" in connection, false);
    await service.linkReadOnlyBankAccount(actor, connection.id, account.id, "fixture-account-1");

    const synced = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(synced.status, "matched");
    assert.equal(synced.applied, true);
    assert.equal(synced.reviewCount, 1);
    const queue = await service.getTransactionReviewQueue(actor);
    assert.equal(queue.transactions.length, 1);
    assert.equal(queue.transactions[0].reviewStatus, "possible_transfer");
    const repeated = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(repeated.status, "matched");
    assert.equal(repeated.inserted, 0);
    assert.equal(repeated.updated, 1);
    assert.equal(repeated.duplicates, 0);
    await assert.rejects(() => service.syncReadOnlyBankConnection({
      ...actor,
      householdId: randomUUID(),
    }, connection.id));

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
    assert.equal(exported.transactions.length, 1);
    assert.equal(JSON.stringify(exported).includes("bank-vault:"), false);

    const revoked = await service.revokeReadOnlyBankConnection(actor, connection.id);
    assert.equal(revoked.consentStatus, "revoked");
    mode = "healthy";
    const afterRevoke = await service.syncReadOnlyBankConnection(actor, connection.id);
    assert.equal(afterRevoke.status, "revoked");
    assert.equal(afterRevoke.applied, false);

    const deleted = await service.deleteReadOnlyBankConnectionData(actor, connection.id);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.unlinkedAccounts, 1);
    const remainingTransactions = await db.select({ id: database.financeTransactions.id })
      .from(database.financeTransactions)
      .where(eq(database.financeTransactions.externalId, "fixture-transaction-1"));
    assert.equal(remainingTransactions.length, 0);
  } finally {
    unregisterReadOnlyBankingProvider("fixture-bank");
    // Audit history is immutable and deliberately outlives household records.
    // Certification runs use a disposable database, so retain this fixture as
    // evidence instead of weakening the append-only audit boundary for cleanup.
  }
});