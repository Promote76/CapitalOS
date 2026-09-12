import secUniverseSnapshot from "../data/sec-us-equity-universe.json";

export const RESEARCH_INVESTMENT_UNIVERSES = [
  "BROAD_US_MARKET",
  "COMMON_STOCKS",
  "INCOME",
  "GROWTH_COMPOUNDERS",
  "ETFS_FUNDS",
  "PREFERRED_INCOME",
  "SMALL_CAP",
  "MID_CAP",
  "LARGE_CAP",
  "CUSTOM",
] as const;

export type ResearchInvestmentUniverse = typeof RESEARCH_INVESTMENT_UNIVERSES[number];
export type ResearchSecurityType = "COMMON_STOCK" | "ETF_FUND" | "PREFERRED_INCOME" | "OTHER";

export type ResearchUniverseEntry = {
  ticker: string;
  cik: string;
  name: string;
  exchange: string;
  issuerClassification: {
    status: "VERIFIED_DOMESTIC";
    jurisdictionCode: string;
    jurisdictionName: string | null;
    entityType: string | null;
    sic: string | null;
    sicDescription: string | null;
    sourceUrl: string;
  };
  securityType: ResearchSecurityType;
};

export type ResearchUniverseSnapshot = {
  schemaVersion: number;
  source: {
    provider: string;
    title: string;
    url: string;
    retrievedAt: string;
    sourceSha256: string;
    version: string;
    sourceRowCount: number;
    includedExchanges: string[];
    classificationPolicyVersion: string;
    issuerClassificationSource: string;
    selectionMethod: string;
    limitations: string[];
  };
  counts: {
    available: number;
    excluded: number;
    exclusions: Record<string, number>;
  };
  entries: ResearchUniverseEntry[];
};

export const researchUniverseSnapshot = secUniverseSnapshot as unknown as ResearchUniverseSnapshot;

export const RESEARCH_UNIVERSE_LABELS: Record<ResearchInvestmentUniverse, string> = {
  BROAD_US_MARKET: "Broad U.S. Market",
  COMMON_STOCKS: "Common Stocks",
  INCOME: "Income",
  GROWTH_COMPOUNDERS: "Growth / Compounders",
  ETFS_FUNDS: "ETFs & Funds",
  PREFERRED_INCOME: "Preferreds & Income Securities",
  SMALL_CAP: "Small Cap",
  MID_CAP: "Mid Cap",
  LARGE_CAP: "Large Cap",
  CUSTOM: "Custom",
};

export function normalizeCustomSymbols(symbols: string[] | undefined) {
  return [...new Set((symbols ?? [])
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9._-]{1,15}$/.test(symbol)))]
    .sort();
}

export function effectiveSecurityType(entry: ResearchUniverseEntry): ResearchSecurityType {
  if (entry.issuerClassification.entityType === "investment"
    || ["6221", "6722", "6726"].includes(entry.issuerClassification.sic ?? "")
    || /\b(?:ETF|FUND)\b/i.test(entry.name)) {
    return "ETF_FUND";
  }
  if (/(?:-P[A-Z]?|[-.]PR[A-Z]?|PFD)$/i.test(entry.ticker)) return "PREFERRED_INCOME";
  if (/(?:W|WT|WS|U|UN|RI)$/i.test(entry.ticker)) return "OTHER";
  return entry.securityType;
}

export function staticUniverseEntries(
  universe: ResearchInvestmentUniverse,
  customSymbols?: string[],
) {
  const custom = new Set(normalizeCustomSymbols(customSymbols));
  return researchUniverseSnapshot.entries.filter((entry) => {
    if (entry.issuerClassification.status !== "VERIFIED_DOMESTIC") return false;
    const securityType = effectiveSecurityType(entry);
    if (universe === "COMMON_STOCKS") return securityType === "COMMON_STOCK";
    if (universe === "ETFS_FUNDS") return securityType === "ETF_FUND";
    if (universe === "PREFERRED_INCOME") return securityType === "PREFERRED_INCOME";
    if (universe === "CUSTOM") return custom.has(entry.ticker);
    return true;
  });
}

export function matchesFinancialUniverse(
  universe: ResearchInvestmentUniverse,
  category: "Income" | "Compounders" | "Balanced",
  marketCap: number | null,
) {
  if (universe === "INCOME") return category === "Income";
  if (universe === "GROWTH_COMPOUNDERS") return category === "Compounders";
  if (universe === "SMALL_CAP") return marketCap !== null && marketCap < 2_000;
  if (universe === "MID_CAP") return marketCap !== null && marketCap >= 2_000 && marketCap < 10_000;
  if (universe === "LARGE_CAP") return marketCap !== null && marketCap >= 10_000;
  return true;
}

export function deriveMarketCapMillions(
  sharesOutstanding: number | null,
  priceUsd: number | null,
) {
  if (sharesOutstanding === null || priceUsd === null) return null;
  if (sharesOutstanding <= 0 || priceUsd <= 0) return null;
  const value = (sharesOutstanding * priceUsd) / 1_000_000;
  return Number.isFinite(value) ? value : null;
}