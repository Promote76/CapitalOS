import crypto from "node:crypto";

export const SECURITY_CLASSIFICATION_POLICY_VERSION =
  "sec-jurisdiction-nasdaq-security-directory-v3";

export function parseSecurityDirectory(text, sourceUrl) {
  const lines = text.trim().split(/\r?\n/);
  const fields = lines.shift()?.split("|") ?? [];
  const symbolField = fields.includes("Symbol") ? "Symbol" : "ACT Symbol";
  const symbolIndex = fields.indexOf(symbolField);
  const nameIndex = fields.indexOf("Security Name");
  const etfIndex = fields.indexOf("ETF");
  const alternateSymbolIndexes = ["NASDAQ Symbol", "CQS Symbol"]
    .map((field) => fields.indexOf(field))
    .filter((index) => index >= 0);
  if (symbolIndex < 0 || nameIndex < 0 || etfIndex < 0) {
    throw new Error(`Security directory shape is not recognized: ${sourceUrl}`);
  }
  return lines
    .map((line) => line.split("|"))
    .filter((row) => row.length === fields.length && row[symbolIndex] !== "File Creation Time")
    .map((row) => {
      const securityName = row[nameIndex].trim();
      const rawSymbols = [row[symbolIndex], ...alternateSymbolIndexes.map((index) => row[index])]
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean);
      const aliases = new Set(rawSymbols);
      for (const symbol of rawSymbols) {
        aliases.add(symbol.replaceAll(".", "-"));
        if (/\bpreferred\b/i.test(securityName)) {
          aliases.add(symbol.replace(/^([A-Z0-9]+)[-$P.]([A-Z0-9]+)$/i, "$1-P$2"));
        } else if (/\bwarrants?\b/i.test(securityName)) {
          aliases.add(symbol.replace(/^([A-Z0-9]+)[-.]W$/i, "$1-WS"));
        } else if (/\bunits?\b/i.test(securityName)) {
          aliases.add(symbol.replace(/^([A-Z0-9]+)[-.]U$/i, "$1-UN"));
        }
      }
      return {
        aliases: [...aliases],
        securityName,
        etf: row[etfIndex].trim() === "Y",
        sourceUrl,
      };
    });
}

export function classifySecurity(directoryEntry) {
  if (!directoryEntry) {
    return {
      status: "UNKNOWN",
      instrumentType: "UNKNOWN",
      sourceProvider: "Nasdaq Trader",
      sourceUrl: null,
      securityName: null,
      evidence: "No matching security-level directory row",
    };
  }
  const securityName = directoryEntry.securityName;
  let instrumentType = "UNKNOWN";
  let evidence = "No approved security-level rule matched";
  if (directoryEntry.etf) {
    instrumentType = "ETF";
    evidence = "ETF=Y";
  } else if (/\b(?:warrant|warrants)\b/i.test(securityName)) {
    instrumentType = "WARRANT";
    evidence = "Security Name identifies warrant";
  } else if (/(?: - Units?$|\bUnits?, each\b|\bUnits? consisting\b)/i.test(securityName)) {
    instrumentType = "UNIT";
    evidence = "Security Name identifies bundled listed unit";
  } else if (/\b(?:right|rights)\b/i.test(securityName)) {
    instrumentType = "RIGHT";
    evidence = "Security Name identifies right";
  } else if (
    /\bclosed[- ]end fund\b/i.test(securityName)
    || /\bFund (?:Inc\.?|Incorporated|Ltd\.?)$/i.test(securityName)
  ) {
    instrumentType = "CLOSED_END_FUND";
    evidence = "Security Name identifies closed-end fund";
  } else if (
    /\bpreferred (?:stock|shares?|securities?)\b/i.test(securityName)
    || /\bdepositary shares?\b.*\bpreferred\b/i.test(securityName)
    || /\bperp(?:etual)? pfd\b/i.test(securityName)
  ) {
    instrumentType = "PREFERRED";
    evidence = "Security Name identifies preferred security";
  } else if (
    /\b(?:common stock|common shares?|ordinary shares?|common units?|units? of beneficial interest)\b/i
      .test(securityName)
  ) {
    instrumentType = "COMMON_STOCK";
    evidence = "Security Name identifies common or ordinary shares";
  }
  return {
    status: instrumentType === "UNKNOWN" ? "UNKNOWN" : "VERIFIED",
    instrumentType,
    sourceProvider: "Nasdaq Trader",
    sourceUrl: directoryEntry.sourceUrl,
    securityName,
    evidence,
  };
}

export function deriveUniverseVersion({ asOf, secSourceSha256, securitySourceSha256s }) {
  const identity = [
    SECURITY_CLASSIFICATION_POLICY_VERSION,
    secSourceSha256,
    ...securitySourceSha256s,
  ].join(":");
  const combinedSha256 = crypto.createHash("sha256").update(identity).digest("hex");
  return `sec-security-universe-${asOf}-${combinedSha256.slice(0, 12)}`;
}