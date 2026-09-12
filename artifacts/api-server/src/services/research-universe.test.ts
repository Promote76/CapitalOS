import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMarketCapMillions,
  matchesFinancialUniverse,
  effectiveSecurityType,
  normalizeCustomSymbols,
  researchUniverseSnapshot,
  staticUniverseEntries,
} from "./research-universe";

test("the frozen universe contains only SEC-verified domestic issuers", () => {
  assert.equal(researchUniverseSnapshot.schemaVersion, 2);
  assert.ok(researchUniverseSnapshot.source.classificationPolicyVersion);
  assert.ok(researchUniverseSnapshot.counts.exclusions.foreignIssuer > 0);
  assert.ok(researchUniverseSnapshot.counts.exclusions.unknownDomesticClassification > 0);
  assert.ok(researchUniverseSnapshot.entries.length > 1_000);
  assert.ok(researchUniverseSnapshot.entries.every((entry) =>
    entry.issuerClassification.status === "VERIFIED_DOMESTIC"
    && entry.issuerClassification.jurisdictionCode.length > 0));
  assert.equal(researchUniverseSnapshot.entries.some((entry) => entry.ticker === "TD"), false);
});

test("static universe options never broaden beyond verified domestic entries", () => {
  const broad = staticUniverseEntries("BROAD_US_MARKET");
  const common = staticUniverseEntries("COMMON_STOCKS");
  const funds = staticUniverseEntries("ETFS_FUNDS");
  const preferreds = staticUniverseEntries("PREFERRED_INCOME");
  const custom = staticUniverseEntries("CUSTOM", [" csco ", "TD", "not valid!"]);

  assert.equal(broad.length, researchUniverseSnapshot.entries.length);
  assert.ok(common.length > 0);
  assert.ok(funds.length > 0);
  assert.ok(preferreds.length > 0);
  assert.ok(common.every((entry) => effectiveSecurityType(entry) === "COMMON_STOCK"));
  assert.ok(funds.every((entry) => effectiveSecurityType(entry) === "ETF_FUND"));
  assert.ok(preferreds.every((entry) => effectiveSecurityType(entry) === "PREFERRED_INCOME"));
  assert.deepEqual(custom.map((entry) => entry.ticker), ["CSCO"]);
  assert.deepEqual(normalizeCustomSymbols([" msft", "MSFT", "bad symbol!"]), ["MSFT"]);
});

test("financial universe rules use approved-evidence category and market-cap values", () => {
  assert.equal(deriveMarketCapMillions(100_000_000, 19.9999), 1_999.99);
  assert.equal(deriveMarketCapMillions(100_000_000, 20), 2_000);
  assert.equal(deriveMarketCapMillions(null, 20), null);
  assert.equal(deriveMarketCapMillions(100_000_000, null), null);
  assert.equal(matchesFinancialUniverse("INCOME", "Income", null), true);
  assert.equal(matchesFinancialUniverse("INCOME", "Compounders", 50_000), false);
  assert.equal(matchesFinancialUniverse("GROWTH_COMPOUNDERS", "Compounders", null), true);
  assert.equal(matchesFinancialUniverse("SMALL_CAP", "Balanced", 1_999.99), true);
  assert.equal(matchesFinancialUniverse("SMALL_CAP", "Balanced", null), false);
  assert.equal(matchesFinancialUniverse("MID_CAP", "Balanced", 2_000), true);
  assert.equal(matchesFinancialUniverse("MID_CAP", "Balanced", 10_000), false);
  assert.equal(matchesFinancialUniverse("LARGE_CAP", "Balanced", 10_000), true);
});