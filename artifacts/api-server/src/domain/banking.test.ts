import assert from "node:assert/strict";
import test from "node:test";
import {
  BankingProviderError,
  getReadOnlyBankingProvider,
  registerReadOnlyBankingProvider,
  unregisterReadOnlyBankingProvider,
} from "../adapters/banking.ts";

test("provider registration only accepts an explicitly read-only provider", async () => {
  const provider = {
    provider: "fixture-bank",
    readOnly: true as const,
    async sync() {
      return {
        providerAsOf: "2026-09-03T12:00:00.000Z",
        cursor: "cursor-1",
        accounts: [],
        transactions: [],
      };
    },
  };
  registerReadOnlyBankingProvider(provider);
  assert.equal(getReadOnlyBankingProvider("fixture-bank"), provider);
  unregisterReadOnlyBankingProvider("fixture-bank");
  assert.equal(getReadOnlyBankingProvider("fixture-bank"), undefined);
});

test("provider failures preserve an explicit recovery category", () => {
  const outage = new BankingProviderError("OUTAGE", "provider unavailable");
  const rateLimit = new BankingProviderError("RATE_LIMITED", "try later");
  const auth = new BankingProviderError("UNAUTHENTICATED", "reconnect required");
  assert.equal(outage.code, "OUTAGE");
  assert.equal(rateLimit.code, "RATE_LIMITED");
  assert.equal(auth.code, "UNAUTHENTICATED");
});