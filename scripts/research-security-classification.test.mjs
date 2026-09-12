import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySecurity,
  deriveUniverseVersion,
  parseSecurityDirectory,
} from "./lib/research-security-classification.mjs";

test("explicit security names take precedence over contradictory issuer metadata", () => {
  const common = classifySecurity({
    aliases: ["AIFC"],
    securityName: "AI Financial Corporation - Common Stock",
    etf: false,
    sourceUrl: "https://example.test/nasdaqlisted.txt",
  });
  assert.equal(common.status, "VERIFIED");
  assert.equal(common.instrumentType, "COMMON_STOCK");
});

test("directory fixtures distinguish representative listed instrument types", () => {
  const rows = parseSecurityDirectory(
    [
      "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
      "ETF1|Example Index ETF|G|N|N|100|Y|N",
      "CEF1|Example Income Fund Incorporated|G|N|N|100|N|N",
      "PFD1|Example 6% Preferred Stock|G|N|N|100|N|N",
      "WT1|Example Corp - Warrant|G|N|N|100|N|N",
      "UNIT1|Example Acquisition Corp - Unit|G|N|N|100|N|N",
      "LP1|Example Partners Common Units|G|N|N|100|N|N",
    ].join("\n"),
    "https://example.test/nasdaqlisted.txt",
  );
  assert.deepEqual(rows.map((row) => classifySecurity(row).instrumentType), [
    "ETF",
    "CLOSED_END_FUND",
    "PREFERRED",
    "WARRANT",
    "UNIT",
    "COMMON_STOCK",
  ]);
});

test("unmatched security names remain explicitly unknown", () => {
  const result = classifySecurity({
    aliases: ["NOTE"],
    securityName: "Example 5% Notes due 2035",
    etf: false,
    sourceUrl: "https://example.test/otherlisted.txt",
  });
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.instrumentType, "UNKNOWN");
});

test("snapshot identity changes with every classification input", () => {
  const base = {
    asOf: "2026-09-12",
    secSourceSha256: "sec",
    securitySourceSha256s: ["nasdaq", "other"],
  };
  const version = deriveUniverseVersion(base);
  assert.notEqual(deriveUniverseVersion({ ...base, secSourceSha256: "sec-2" }), version);
  assert.notEqual(
    deriveUniverseVersion({ ...base, securitySourceSha256s: ["nasdaq-2", "other"] }),
    version,
  );
  assert.notEqual(
    deriveUniverseVersion({ ...base, securitySourceSha256s: ["nasdaq", "other-2"] }),
    version,
  );
});