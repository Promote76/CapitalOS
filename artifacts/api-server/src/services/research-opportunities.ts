import { and, desc, eq } from "drizzle-orm";
import {
  db,
  investmentResearchDossiers,
  reviewedResearchEvidence,
  reviewedSecFilingEvidence,
  secFilingSnapshots,
  schwabObservationSnapshots,
  schwabMarketSnapshots,
} from "@workspace/db";
import type { Actor } from "./capital-os";

const dayMs = 24 * 60 * 60 * 1000;
const maxSchwabAgeDays = 30;
const maxSecAgeDays = 180;

type JsonRecord = Record<string, unknown>;

type EvidenceItem = {
  id: string;
  title: string;
  sourceKind: "SCHWAB_MARKET_SNAPSHOT" | "SEC_FILING";
  reviewedAt: Date;
  freshness: "CURRENT";
  ticker: string;
  content: JsonRecord;
  provenance: JsonRecord;
  canonicalSha256: string;
  missingFlags: string[];
  qualityFlags: string[];
  provider: string | null;
  sourceUrl: string | null;
  retrievedAt: Date | null;
  filingDate: string | null;
};

type Candidate = {
  ticker: string;
  companyName: string;
  evidence: EvidenceItem[];
  portfolioWeight: number;
  quote: JsonRecord;
  fundamental: JsonRecord;
  snapshotContext: JsonRecord;
  secMetrics: JsonRecord;
  dossier: JsonRecord | null;
};

const record = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const numberValue = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const bounded = (value: string, max: number) => value.trim().slice(0, max);

function normalizedDate(value: unknown) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function freshWithin(value: unknown, maxAgeDays: number, now: Date) {
  const date = normalizedDate(value);
  return !!date && now.getTime() - date.getTime() <= maxAgeDays * dayMs;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function factorScore(value: number | null, fallback: number) {
  return value === null ? fallback : clamp(value);
}

function parsePortfolioWeight(positions: unknown[], ticker: string) {
  const position = positions
    .map(record)
    .find((item) => String(item.symbol ?? item.ticker ?? "").toUpperCase() === ticker);
  if (!position) return 0;
  const explicit = numberValue(position.portfolioWeight ?? position.portfolio_weight);
  if (explicit !== null) return explicit <= 1 ? explicit * 100 : explicit <= 100 ? explicit : 0;
  const marketValue = numberValue(position.marketValue ?? position.market_value ?? position.value);
  if (marketValue === null || marketValue <= 0) return 0;
  const totalMarketValue = positions
    .map(record)
    .map((item) => numberValue(item.marketValue ?? item.market_value ?? item.value) ?? 0)
    .reduce((sum, value) => sum + Math.max(0, value), 0);
  return totalMarketValue > 0 ? (marketValue / totalMarketValue) * 100 : 0;
}

function createEvidenceFromSchwab(
  row: typeof reviewedResearchEvidence.$inferSelect,
  source: typeof schwabMarketSnapshots.$inferSelect | undefined,
  now: Date,
): EvidenceItem | null {
  if (!source || source.householdId !== row.householdId || source.reviewStatus !== "APPROVED" || source.ticker.trim().toUpperCase() !== row.ticker.trim().toUpperCase()) return null;
  const context = record(record(row.canonicalContent).snapshotContext);
  const freshness = String(source.freshness ?? context.freshness ?? record(row.provenance).freshness ?? "").toUpperCase();
  if (["STALE", "UNKNOWN", "EXPIRED"].includes(freshness) || !freshWithin(source.retrievedAt, maxSchwabAgeDays, now)) return null;
  const canonicalFreshness = String(context.freshness ?? "").toUpperCase();
  if (["STALE", "UNKNOWN", "EXPIRED"].includes(canonicalFreshness) || (context.retrievedAt !== undefined && !freshWithin(context.retrievedAt, maxSchwabAgeDays, now))) return null;
  const content = record(row.canonicalContent);
  const ticker = String(row.ticker).trim().toUpperCase();
  return {
    id: row.id,
    title: `Schwab ${ticker} market snapshot`,
    sourceKind: "SCHWAB_MARKET_SNAPSHOT",
    reviewedAt: row.approvedAt,
    freshness: "CURRENT",
    ticker,
    content,
    provenance: record(row.provenance),
    canonicalSha256: row.canonicalSha256,
    missingFlags: Array.isArray(context.missingFlags) ? context.missingFlags.filter((item): item is string => typeof item === "string") : [],
    qualityFlags: Array.isArray(context.qualityFlags) ? context.qualityFlags.filter((item): item is string => typeof item === "string") : [],
    provider: stringValue(record(row.provenance).provider) ?? stringValue(record(source.provenance).provider),
    sourceUrl: stringValue(record(row.provenance).sourceUrl) ?? stringValue(record(source.provenance).sourceUrl),
    retrievedAt: normalizedDate(source.retrievedAt),
    filingDate: null,
  };
}

function createEvidenceFromSec(
  row: typeof reviewedSecFilingEvidence.$inferSelect,
  source: typeof secFilingSnapshots.$inferSelect | undefined,
  now: Date,
): EvidenceItem | null {
  if (!source || source.householdId !== row.householdId || source.reviewStatus !== "APPROVED" || source.ticker.trim().toUpperCase() !== row.ticker.trim().toUpperCase()) return null;
  const provenance = record(row.provenance);
  const content = record(row.canonicalContent);
  const filings = Array.isArray(content.filings) ? content.filings.map(record) : [];
  const latestFilingDate = source.filingDate;
  if (!freshWithin(latestFilingDate, maxSecAgeDays, now)) return null;
  const missingFlags = Array.isArray(content.missingFields)
    ? content.missingFields.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: row.id,
    title: `SEC ${row.ticker.toUpperCase()} filing`,
    sourceKind: "SEC_FILING",
    reviewedAt: row.approvedAt,
    freshness: "CURRENT",
    ticker: row.ticker.trim().toUpperCase(),
    content,
    provenance,
    canonicalSha256: row.canonicalSha256,
    missingFlags,
    qualityFlags: [String(content.evidenceQuality ?? "UNKNOWN")],
    provider: stringValue(record(row.provenance).provider) ?? stringValue(record(source.provenance).provider),
    sourceUrl: source.sourceUrl,
    retrievedAt: normalizedDate(source.extractionTimestamp),
    filingDate: source.filingDate,
  };
}

function getSchwabFields(evidence: EvidenceItem[]) {
  const item = evidence.find((candidate) => candidate.sourceKind === "SCHWAB_MARKET_SNAPSHOT");
  const content = item ? record(item.content) : {};
  const instrument = record(content.instrument);
  return {
    quote: record(content.quote),
    fundamental: record(instrument.fundamental),
    snapshotContext: record(content.snapshotContext),
    companyName: stringValue(instrument.description),
  };
}

function getSecMetrics(evidence: EvidenceItem[]) {
  const item = evidence.find((candidate) => candidate.sourceKind === "SEC_FILING");
  return item ? record(record(item.content).metrics) : {};
}

function buildDossierContent(row: typeof investmentResearchDossiers.$inferSelect | undefined) {
  const report = row?.report && typeof row.report === "object" ? row.report as JsonRecord : {};
  const run = record(report.run);
  if (["blocked", "pending", "failed"].includes(String(run.status ?? "").toLowerCase())) return null;
  const proposal = report.proposal && typeof report.proposal === "object" ? report.proposal as JsonRecord : null;
  return proposal;
}

function classifyCandidate(candidate: Candidate): "Income" | "Compounders" | "Balanced" {
  const dividendYield = numberValue(candidate.fundamental.dividendYield);
  const dividendAmount = numberValue(candidate.fundamental.dividendAmount);
  const eps = numberValue(candidate.fundamental.epsTrailingTwelveMonths);
  if ((dividendYield !== null && dividendYield >= 2.5) || (dividendAmount !== null && dividendAmount > 0)) return "Income";
  if (eps !== null && eps > 0) return "Compounders";
  return "Balanced";
}

function buildOpportunity(candidate: Candidate) {
  const dividendYield = numberValue(candidate.fundamental.dividendYield);
  const pe = numberValue(candidate.fundamental.peRatio);
  const eps = numberValue(candidate.fundamental.epsTrailingTwelveMonths);
  const beta = numberValue(candidate.fundamental.beta);
  const volume = numberValue(candidate.quote.totalVolume);
  const revenueGrowth = numberValue(candidate.secMetrics.revenueGrowth ?? candidate.secMetrics.revenue_growth);
  const debtToEquity = numberValue(candidate.secMetrics.debtToEquity ?? candidate.secMetrics.debt_to_equity);
  const quality = factorScore(eps === null ? null : eps > 0 ? 84 : 34, 55);
  const valuation = factorScore(pe === null ? null : pe > 0 ? 100 - Math.min(Math.abs(pe - 18) * 2.4, 55) : 32, 58);
  const momentum = factorScore(revenueGrowth === null ? null : revenueGrowth >= 0 ? 62 + Math.min(revenueGrowth * 1.4, 28) : 45 + Math.max(revenueGrowth, -30), 60);
  const resilience = factorScore(debtToEquity === null ? (beta === null ? null : 86 - Math.min(Math.abs(beta - 0.8) * 30, 45)) : debtToEquity <= 1 ? 86 : debtToEquity <= 2 ? 68 : 43, 58);
  const incomeQuality = clamp(dividendYield === null ? 52 : 68 + Math.min(dividendYield * 5, 26));
  const evidenceQuality = clamp(72 + candidate.evidence.length * 10 - candidate.evidence.reduce((sum, item) => sum + item.missingFlags.length * 4, 0));
  const portfolioFit = clamp(candidate.portfolioWeight === 0 ? 88 : candidate.portfolioWeight < 5 ? 80 : candidate.portfolioWeight < 10 ? 64 : 38);
  const liquidity = factorScore(volume === null ? null : volume > 100000 ? 86 : volume > 10000 ? 70 : 48, 56);
  const risk = clamp(beta === null ? 58 : beta <= 1 ? 82 : beta <= 1.4 ? 64 : 42);
  const platinumScore = clamp(
    quality * 0.18
    + valuation * 0.14
    + momentum * 0.12
    + resilience * 0.15
    + incomeQuality * 0.12
    + evidenceQuality * 0.12
    + portfolioFit * 0.1
    + liquidity * 0.04
    + risk * 0.03,
  );
  const category = classifyCandidate(candidate);
  const dossierProposal = candidate.dossier;
  const dossierThesis = stringValue(dossierProposal?.thesis);
  const dossierRisks = Array.isArray(dossierProposal?.risks) ? dossierProposal.risks.filter((item): item is string => typeof item === "string").slice(0, 4) : [];
  const redFlags = [
    ...candidate.evidence.flatMap((item) => item.qualityFlags).filter((flag) => flag && flag !== "HIGH" && flag !== "MEDIUM"),
    ...(candidate.portfolioWeight >= 10 ? ["Existing concentration is already material."] : []),
    ...(pe !== null && pe > 35 ? ["Valuation is above the balanced screen range."] : []),
    ...dossierRisks,
  ].slice(0, 5);
  const baseCase = dossierThesis ?? `Approved evidence supports a ${category.toLowerCase()} research case with a Platinum Score of ${platinumScore}. Missing fields remain unfilled rather than estimated.`;
  return {
    ticker: candidate.ticker,
    companyName: candidate.companyName,
    platinumScore,
    category,
    thesis: baseCase,
    whyNow: `The current screen combines ${candidate.evidence.length} approved source${candidate.evidence.length === 1 ? "" : "s"} with current evidence, ${portfolioFit >= 80 ? "room in the observed portfolio" : "an existing concentration context"}, and an explainable ${platinumScore}/100 score.`,
    redFlags,
    evidenceFreshness: "Current",
    portfolioFit: portfolioFit >= 80 ? "Constructive" : portfolioFit >= 60 ? "Review" : "Caution",
    concentrationImpact: candidate.portfolioWeight > 0 ? `${candidate.portfolioWeight.toFixed(1)}% observed today` : "No observed position",
    maximumExposure: candidate.portfolioWeight >= 10 ? "Keep below 5%" : candidate.portfolioWeight >= 5 ? "Review below 7.5%" : "Review up to 10%",
    bullCase: `Quality ${quality}, resilience ${resilience}, and evidence quality ${evidenceQuality} support a constructive case if the approved thesis continues to hold.`,
    baseCase,
    bearCase: redFlags.length > 0 ? `The case weakens if ${redFlags.join(" or ").toLowerCase()}` : "The case weakens if approved evidence ages, fundamentals deteriorate, or portfolio fit changes.",
    invalidationConditions: [
      "Fresh approved evidence no longer supports the thesis.",
      ...(dossierRisks.length > 0 ? dossierRisks.slice(0, 2).map((risk) => `Risk becomes persistent: ${risk}`) : ["Material balance-sheet or earnings deterioration appears."]),
    ].slice(0, 3),
    protectedCapitalStatus: "Protected-capital screen",
    humanReviewStatus: "Human review required",
    factorSubScores: { quality, valuation, momentum, resilience },
    sourceCount: candidate.evidence.length,
    advisoryOnly: true as const,
    noExecution: true as const,
    evidence: candidate.evidence.slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      sourceKind: item.sourceKind,
      reviewedAt: item.reviewedAt.toISOString(),
      freshness: item.freshness,
      canonicalSha256: item.canonicalSha256,
      provider: item.provider,
      sourceUrl: item.sourceUrl,
      retrievedAt: item.retrievedAt?.toISOString() ?? null,
      filingDate: item.filingDate,
    })),
    factors: {
      incomeQuality,
      growthQuality: momentum,
      earningsQuality: quality,
      balanceSheet: resilience,
      valuation,
      liquidity,
      risk,
      evidenceFreshness: evidenceQuality,
      portfolioFit,
    },
  };
}

export type ResearchOpportunityLens = "Income" | "Compounders" | "Balanced";
export type ResearchOpportunityPortfolioFit = "Constructive" | "Review" | "Caution";
export type ResearchOpportunityOptions = {
  lens?: ResearchOpportunityLens;
  search?: string;
  minScore?: number;
  portfolioFit?: ResearchOpportunityPortfolioFit;
};

type ExclusionReason = "missingSource" | "unapproved" | "tickerMismatch" | "stale";

function classifySchwabExclusion(
  row: typeof reviewedResearchEvidence.$inferSelect,
  source: typeof schwabMarketSnapshots.$inferSelect | undefined,
  now: Date,
): ExclusionReason | null {
  if (!source) return "missingSource";
  if (source.householdId !== row.householdId || source.ticker.trim().toUpperCase() !== row.ticker.trim().toUpperCase()) return "tickerMismatch";
  if (source.reviewStatus !== "APPROVED") return "unapproved";
  const context = record(record(row.canonicalContent).snapshotContext);
  const freshness = String(source.freshness ?? context.freshness ?? record(row.provenance).freshness ?? "").toUpperCase();
  if (["STALE", "UNKNOWN", "EXPIRED"].includes(freshness) || !freshWithin(source.retrievedAt, maxSchwabAgeDays, now)) return "stale";
  if (["STALE", "UNKNOWN", "EXPIRED"].includes(String(context.freshness ?? "").toUpperCase())) return "stale";
  if (context.retrievedAt !== undefined && !freshWithin(context.retrievedAt, maxSchwabAgeDays, now)) return "stale";
  return null;
}

function classifySecExclusion(
  row: typeof reviewedSecFilingEvidence.$inferSelect,
  source: typeof secFilingSnapshots.$inferSelect | undefined,
  now: Date,
): ExclusionReason | null {
  if (!source) return "missingSource";
  if (source.householdId !== row.householdId || source.ticker.trim().toUpperCase() !== row.ticker.trim().toUpperCase()) return "tickerMismatch";
  if (source.reviewStatus !== "APPROVED") return "unapproved";
  if (!freshWithin(source.filingDate, maxSecAgeDays, now)) return "stale";
  return null;
}

export async function listResearchOpportunities(actor: Actor, options: ResearchOpportunityOptions = {}) {
  const now = new Date();
  const [snapshotRows, secRows, sourceSnapshotRows, sourceSecRows, portfolioRows, dossierRows] = await Promise.all([
    db.select().from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.householdId, actor.householdId)).orderBy(desc(reviewedResearchEvidence.approvedAt), desc(reviewedResearchEvidence.id)),
    db.select().from(reviewedSecFilingEvidence).where(eq(reviewedSecFilingEvidence.householdId, actor.householdId)).orderBy(desc(reviewedSecFilingEvidence.approvedAt), desc(reviewedSecFilingEvidence.id)),
    db.select().from(schwabMarketSnapshots).where(eq(schwabMarketSnapshots.householdId, actor.householdId)).orderBy(desc(schwabMarketSnapshots.createdAt), desc(schwabMarketSnapshots.id)),
    db.select().from(secFilingSnapshots).where(eq(secFilingSnapshots.householdId, actor.householdId)).orderBy(desc(secFilingSnapshots.createdAt), desc(secFilingSnapshots.id)),
    db.select({ positions: schwabObservationSnapshots.positions }).from(schwabObservationSnapshots)
      .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
      .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
      .limit(1),
    db.select().from(investmentResearchDossiers).where(and(
      eq(investmentResearchDossiers.householdId, actor.householdId),
      eq(investmentResearchDossiers.reviewStatus, "APPROVED"),
    )).orderBy(desc(investmentResearchDossiers.createdAt), desc(investmentResearchDossiers.id)),
  ]);
  const sourceSnapshotsById = new Map(sourceSnapshotRows.map((row) => [row.id, row]));
  const sourceSecById = new Map(sourceSecRows.map((row) => [row.id, row]));
  const diagnostics = {
    reviewedMarketEvidence: snapshotRows.length,
    reviewedSecEvidence: secRows.length,
    currentMarketEvidence: 0,
    currentSecEvidence: 0,
    duplicateEvidence: 0,
    excludedMissingSource: 0,
    excludedUnapproved: 0,
    excludedTickerMismatch: 0,
    excludedStale: 0,
  };
  const recordExclusion = (reason: ExclusionReason | null, kind: "market" | "sec") => {
    if (!reason) {
      if (kind === "market") diagnostics.currentMarketEvidence += 1;
      else diagnostics.currentSecEvidence += 1;
      return;
    }
    if (reason === "missingSource") diagnostics.excludedMissingSource += 1;
    if (reason === "unapproved") diagnostics.excludedUnapproved += 1;
    if (reason === "tickerMismatch") diagnostics.excludedTickerMismatch += 1;
    if (reason === "stale") diagnostics.excludedStale += 1;
  };
  snapshotRows.forEach((row) => recordExclusion(classifySchwabExclusion(row, sourceSnapshotsById.get(row.snapshotId), now), "market"));
  secRows.forEach((row) => recordExclusion(classifySecExclusion(row, sourceSecById.get(row.snapshotId), now), "sec"));
  const evidence = [
    ...snapshotRows.map((row) => createEvidenceFromSchwab(row, sourceSnapshotsById.get(row.snapshotId), now)).filter((item): item is EvidenceItem => !!item),
    ...secRows.map((row) => createEvidenceFromSec(row, sourceSecById.get(row.snapshotId), now)).filter((item): item is EvidenceItem => !!item),
  ];
  const uniqueEvidence = evidence.filter((item, index, items) => items.findIndex((candidate) =>
    candidate.ticker === item.ticker && candidate.canonicalSha256 === item.canonicalSha256) === index);
  diagnostics.duplicateEvidence = evidence.length - uniqueEvidence.length;
  const positions = Array.isArray(portfolioRows[0]?.positions) ? portfolioRows[0].positions : [];
  const eligibleEvidenceIds = new Set(uniqueEvidence.map((item) => item.id));
  const dossiersByTicker = new Map<string, JsonRecord | null>();
  for (const row of dossierRows) {
    const ids = Array.isArray(row.evidenceIds) ? row.evidenceIds : [];
    if (!ids.length || ids.some((id) => !eligibleEvidenceIds.has(id))) continue;
    const ticker = row.ticker.trim().toUpperCase();
    if (!dossiersByTicker.has(ticker)) dossiersByTicker.set(ticker, buildDossierContent(row));
  }
  const byTicker = new Map<string, Candidate>();
  for (const item of uniqueEvidence) {
    const existing = byTicker.get(item.ticker);
    if (existing) {
      if (!existing.evidence.some((candidate) => candidate.id === item.id)) existing.evidence.push(item);
      continue;
    }
    const schwab = getSchwabFields([item]);
    byTicker.set(item.ticker, {
      ticker: item.ticker,
      companyName: schwab.companyName ?? item.ticker,
      evidence: [item],
      portfolioWeight: parsePortfolioWeight(positions, item.ticker),
      quote: schwab.quote,
      fundamental: schwab.fundamental,
      snapshotContext: schwab.snapshotContext,
      secMetrics: getSecMetrics([item]),
      dossier: dossiersByTicker.get(item.ticker) ?? null,
    });
  }
  for (const candidate of byTicker.values()) {
    const schwab = getSchwabFields(candidate.evidence);
    candidate.quote = schwab.quote;
    candidate.fundamental = schwab.fundamental;
    candidate.snapshotContext = schwab.snapshotContext;
    candidate.companyName = schwab.companyName ?? candidate.companyName;
    candidate.secMetrics = getSecMetrics(candidate.evidence);
  }
  const allOpportunities = Array.from(byTicker.values())
    .map(buildOpportunity)
    .sort((a, b) => b.platinumScore - a.platinumScore || a.ticker.localeCompare(b.ticker))
  const normalizedSearch = options.search?.trim().toLowerCase() ?? "";
  const searched = normalizedSearch
    ? allOpportunities.filter((item) => `${item.ticker} ${item.companyName} ${item.category} ${item.thesis}`.toLowerCase().includes(normalizedSearch))
    : allOpportunities;
  const lensFiltered = options.lens && options.lens !== "Balanced"
    ? searched.filter((item) => item.category === options.lens)
    : searched;
  const scoreFiltered = options.minScore === undefined ? lensFiltered : lensFiltered.filter((item) => item.platinumScore >= options.minScore!);
  const fitFiltered = options.portfolioFit ? scoreFiltered.filter((item) => item.portfolioFit === options.portfolioFit) : scoreFiltered;
  const lensCounts = {
    Income: allOpportunities.filter((item) => item.category === "Income").length,
    Compounders: allOpportunities.filter((item) => item.category === "Compounders").length,
    Balanced: allOpportunities.length,
  };
  const opportunities = fitFiltered.slice(0, 25);
  return {
    opportunities,
    totalEligible: fitFiltered.length,
    excludedStaleOrUnreviewed: diagnostics.excludedStale + diagnostics.excludedUnapproved + diagnostics.excludedMissingSource + diagnostics.excludedTickerMismatch + diagnostics.duplicateEvidence,
    generatedAt: now.toISOString(),
    ranking: {
      method: "Deterministic approved-evidence screen",
      factors: ["income quality", "growth quality", "earnings quality", "balance-sheet strength", "valuation", "liquidity", "risk", "evidence freshness", "portfolio fit"],
      missingData: "Missing fields receive bounded neutral scores and remain visible in the evidence record; no values are invented.",
      lens: options.lens ?? "Balanced",
    },
    diagnostics,
    lensCounts,
    advisoryOnly: true as const,
    executionAuthorization: false as const,
    householdCapitalIncluded: false as const,
    noTradingOrMoneyMovement: true as const,
  };
}