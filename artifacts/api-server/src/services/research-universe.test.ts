import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveMarketCapMillions,
  broadDiscoveryPolicyExclusions,
  matchesFinancialUniverse,
  effectiveSecurityType,
  isBroadDiscoveryInstrumentAllowed,
  normalizeCustomSymbols,
  researchUniverseSnapshot,
  staticUniverseEntries,
  type ResearchInstrumentType,
  type ResearchUniverseEntry,
} from "./research-universe";

function securityFixture(
  ticker: string,
  instrumentType: ResearchInstrumentType,
  status: "VERIFIED" | "UNKNOWN" = "VERIFIED",
): ResearchUniverseEntry {
  return {
    ticker,
    cik: "0000000001",
    name: `${instrumentType} fixture`,
    exchange: "NYSE",
    issuerClassification: {
      status: "VERIFIED_DOMESTIC",
      jurisdictionCode: "DE",
      jurisdictionName: "Delaware",
      entityType: "operating",
      sic: "9999",
      sicDescription: null,
      sourceUrl: "https://data.sec.gov/submissions/CIK0000000001.json",
    },
    securityClassification: {
      status,
      instrumentType,
      sourceProvider: "Nasdaq Trader",
      sourceUrl: status === "VERIFIED" ? "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt" : null,
      securityName: status === "VERIFIED" ? `${instrumentType} fixture` : null,
      evidence: status === "VERIFIED" ? "Representative fixture" : "No matching security-level directory row",
    },
    securityType: instrumentType === "COMMON_STOCK"
      ? "COMMON_STOCK"
      : instrumentType === "ETF" || instrumentType === "CLOSED_END_FUND"
        ? "ETF_FUND"
        : instrumentType === "PREFERRED"
          ? "PREFERRED_INCOME"
          : "OTHER",
  };
}

test("the frozen universe contains only SEC-verified domestic issuers", () => {
  assert.equal(researchUniverseSnapshot.schemaVersion, 3);
  assert.ok(researchUniverseSnapshot.source.classificationPolicyVersion);
  assert.equal(researchUniverseSnapshot.source.securityClassificationSources.length, 2);
  assert.ok((researchUniverseSnapshot.counts.instrumentTypes.UNKNOWN ?? 0) > 0);
  assert.ok(researchUniverseSnapshot.counts.exclusions.foreignIssuer > 0);
  assert.ok(researchUniverseSnapshot.counts.exclusions.unknownDomesticClassification > 0);
  assert.ok(researchUniverseSnapshot.entries.length > 1_000);
  assert.ok(researchUniverseSnapshot.entries.every((entry) =>
    entry.issuerClassification.status === "VERIFIED_DOMESTIC"
    && entry.issuerClassification.jurisdictionCode.length > 0
    && ["VERIFIED", "UNKNOWN"].includes(entry.securityClassification.status)
    && entry.securityClassification.evidence.length > 0));
  assert.equal(researchUniverseSnapshot.entries.some((entry) => entry.ticker === "TD"), false);
});

test("security-level provenance keeps representative instruments in the right universe", () => {
  assert.equal(effectiveSecurityType(securityFixture("ETF", "ETF")), "ETF_FUND");
  assert.equal(effectiveSecurityType(securityFixture("CEF", "CLOSED_END_FUND")), "ETF_FUND");
  assert.equal(effectiveSecurityType(securityFixture("PFD", "PREFERRED")), "PREFERRED_INCOME");
  assert.equal(effectiveSecurityType(securityFixture("W", "WARRANT")), "OTHER");
  assert.equal(effectiveSecurityType(securityFixture("U", "UNIT")), "OTHER");
  assert.equal(effectiveSecurityType(securityFixture("?", "UNKNOWN", "UNKNOWN")), "OTHER");
});

test("the frozen security-level fixtures distinguish funds, preferreds, warrants, and units", () => {
  const expectedTypes = new Map<ResearchInstrumentType, string>([
    ["ETF", "TSUI"],
    ["CLOSED_END_FUND", "PFD"],
    ["PREFERRED", "AHT-PF"],
    ["WARRANT", "BEATW"],
    ["UNIT", "ARCLU"],
  ]);
  for (const [instrumentType, ticker] of expectedTypes) {
    const entry = researchUniverseSnapshot.entries.find((candidate) => candidate.ticker === ticker);
    assert.ok(entry, `missing representative ${instrumentType} fixture ${ticker}`);
    assert.equal(entry.securityClassification.status, "VERIFIED");
    assert.equal(entry.securityClassification.instrumentType, instrumentType);
    assert.equal(entry.securityClassification.sourceProvider, "Nasdaq Trader");
    assert.ok(entry.securityClassification.sourceUrl);
    assert.ok(entry.securityClassification.securityName);
  }
});

test("explicit common-stock directory evidence wins over issuer-level fund metadata", () => {
  for (const ticker of ["AIFC", "AIB", "UROY", "SELF"]) {
    const entry = researchUniverseSnapshot.entries.find((candidate) => candidate.ticker === ticker);
    assert.ok(entry, `missing contradictory-metadata fixture ${ticker}`);
    assert.match(entry.securityClassification.securityName ?? "", /Common Stock/i);
    assert.equal(entry.securityClassification.instrumentType, "COMMON_STOCK");
    assert.equal(effectiveSecurityType(entry), "COMMON_STOCK");
  }
});

test("static universe options never broaden beyond verified domestic entries", () => {
  const broad = staticUniverseEntries("BROAD_US_MARKET");
  const common = staticUniverseEntries("COMMON_STOCKS");
  const funds = staticUniverseEntries("ETFS_FUNDS");
  const preferreds = staticUniverseEntries("PREFERRED_INCOME");
  const custom = staticUniverseEntries("CUSTOM", [" csco ", "TD", "not valid!"]);
  const customDisallowed = staticUniverseEntries("CUSTOM", ["BEATW", "ARCLU", "ARCLR", "UZE"]);

  const policyExclusions = broadDiscoveryPolicyExclusions();
  assert.equal(broad.length + policyExclusions.total, researchUniverseSnapshot.entries.length);
  assert.ok(policyExclusions.total > 0);
  assert.equal(policyExclusions.counts.UNKNOWN, researchUniverseSnapshot.counts.instrumentTypes.UNKNOWN);
  assert.ok(broad.every(isBroadDiscoveryInstrumentAllowed));
  assert.ok(common.length > 0);
  assert.ok(funds.length > 0);
  assert.ok(preferreds.length > 0);
  assert.ok(common.every((entry) => effectiveSecurityType(entry) === "COMMON_STOCK"));
  assert.ok(funds.every((entry) => effectiveSecurityType(entry) === "ETF_FUND"));
  assert.ok(preferreds.every((entry) => effectiveSecurityType(entry) === "PREFERRED_INCOME"));
  assert.deepEqual(custom.map((entry) => entry.ticker), ["CSCO"]);
  assert.deepEqual(customDisallowed, []);
  assert.deepEqual(normalizeCustomSymbols([" msft", "MSFT", "bad symbol!"]), ["MSFT"]);
});

test("broad discovery withholds warrants, units, rights, and unknown debt pending review", () => {
  const fixtures = [
    securityFixture("W", "WARRANT"),
    securityFixture("U", "UNIT"),
    securityFixture("R", "RIGHT"),
    {
      ...securityFixture("NOTE", "UNKNOWN", "UNKNOWN"),
      name: "Example 7.5% Senior Notes due 2030",
    },
  ];

  assert.ok(fixtures.every((entry) => !isBroadDiscoveryInstrumentAllowed(entry)));
  assert.deepEqual(broadDiscoveryPolicyExclusions(fixtures), {
    total: 4,
    counts: { WARRANT: 1, UNIT: 1, RIGHT: 1, UNKNOWN: 1 },
  });

  const broadTickers = new Set(staticUniverseEntries("BROAD_US_MARKET").map((entry) => entry.ticker));
  for (const ticker of ["BEATW", "ARCLU", "ARCLR", "UZE"]) {
    assert.ok(researchUniverseSnapshot.entries.some((entry) => entry.ticker === ticker), `missing frozen fixture ${ticker}`);
    assert.equal(broadTickers.has(ticker), false, `${ticker} must be withheld from broad discovery`);
  }
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