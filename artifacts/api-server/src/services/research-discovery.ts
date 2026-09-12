import { desc, eq } from "drizzle-orm";
import {
  db,
  investmentResearchDossiers,
  researchAdvisoryDecisions,
  secFilingSnapshots,
  schwabMarketDataConnections,
  schwabMarketSnapshots,
  schwabObservationSnapshots,
} from "@workspace/db";
import type { Actor } from "./capital-os";
import { appendAuditEvent } from "./audit";
import { collectSchwabMarketSnapshotDraft } from "./schwab-research-collection";
import { SchwabResearchError } from "./schwab-research-adapter";
import { retrieveSecFiling } from "./sec-research";
import {
  listResearchOpportunities,
  type ResearchOpportunityOptions,
} from "./research-opportunities";

const MAX_DISCOVERY_SYMBOLS = 25;

type DiscoveryDependencies = {
  collectMarket?: typeof collectSchwabMarketSnapshotDraft;
  collectSec?: typeof retrieveSecFiling;
  rank?: typeof listResearchOpportunities;
};

type DiscoveryIssue = {
  code: string;
  count: number;
  message: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function symbolFrom(value: unknown) {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9._-]{1,15}$/.test(symbol) ? symbol : null;
}

function addIssue(issues: Map<string, DiscoveryIssue>, code: string, message: string) {
  const current = issues.get(code);
  issues.set(code, { code, count: (current?.count ?? 0) + 1, message });
}

async function loadHouseholdUniverse(actor: Actor) {
  const [marketRows, secRows, dossierRows, decisionRows, observationRows] = await Promise.all([
    db.select({ ticker: schwabMarketSnapshots.ticker }).from(schwabMarketSnapshots)
      .where(eq(schwabMarketSnapshots.householdId, actor.householdId)),
    db.select({ ticker: secFilingSnapshots.ticker }).from(secFilingSnapshots)
      .where(eq(secFilingSnapshots.householdId, actor.householdId)),
    db.select({ ticker: investmentResearchDossiers.ticker }).from(investmentResearchDossiers)
      .where(eq(investmentResearchDossiers.householdId, actor.householdId)),
    db.select({ ticker: researchAdvisoryDecisions.ticker }).from(researchAdvisoryDecisions)
      .where(eq(researchAdvisoryDecisions.householdId, actor.householdId)),
    db.select({ positions: schwabObservationSnapshots.positions }).from(schwabObservationSnapshots)
      .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
      .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
      .limit(1),
  ]);
  const symbols = new Set<string>();
  for (const row of [...marketRows, ...secRows, ...dossierRows, ...decisionRows]) {
    const symbol = symbolFrom(row.ticker);
    if (symbol) symbols.add(symbol);
  }
  const positions = Array.isArray(observationRows[0]?.positions) ? observationRows[0].positions : [];
  for (const position of positions) {
    const item = record(position);
    const symbol = symbolFrom(item.symbol ?? item.ticker);
    if (symbol) symbols.add(symbol);
  }
  return [...symbols].sort((a, b) => a.localeCompare(b));
}

export async function discoverResearchOpportunities(
  actor: Actor,
  options: ResearchOpportunityOptions = {},
  dependencies: DiscoveryDependencies = {},
) {
  const [connection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId))
    .limit(1);
  if (!connection || connection.status !== "LIVE_CONNECTED") {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Connect Schwab Market Data before running opportunity discovery");
  }
  if (!connection.accessTokenExpiresAt || connection.accessTokenExpiresAt <= new Date()) {
    throw new SchwabResearchError("TOKEN_REFRESH_REQUIRED", 409, "Refresh the Schwab Market Data connection before running opportunity discovery");
  }
  if (!connection.accessTokenCiphertext || !connection.accessTokenNonce || !connection.accessTokenAuthTag) {
    throw new SchwabResearchError("MARKET_DATA_DISCONNECTED", 409, "Schwab Market Data authorization is unavailable");
  }

  const universe = await loadHouseholdUniverse(actor);
  const selectedSymbols = universe.slice(0, MAX_DISCOVERY_SYMBOLS);
  const issues = new Map<string, DiscoveryIssue>();
  addIssue(
    issues,
    "PROVIDER_WIDE_SCREENER_UNAVAILABLE",
    "The authorized Schwab APIs expose symbol-targeted fundamentals, quotes, and price history, but no provider-wide opportunity screener.",
  );
  if (universe.length === 0) {
    addIssue(issues, "NO_KNOWN_SYMBOL_UNIVERSE", "No household positions, research evidence, dossiers, or advisory decisions supplied symbols to screen.");
  }
  if (universe.length > MAX_DISCOVERY_SYMBOLS) {
    addIssue(issues, "BOUNDED_SYMBOL_LIMIT", `This run screened the first ${MAX_DISCOVERY_SYMBOLS} symbols in deterministic ticker order to respect provider request limits.`);
  }

  const collectMarket = dependencies.collectMarket ?? collectSchwabMarketSnapshotDraft;
  const collectSec = dependencies.collectSec ?? retrieveSecFiling;
  let marketDraftsCreated = 0;
  let secDraftsCreated = 0;
  let secSnapshotsReused = 0;
  let screened = 0;
  let haltedByProvider = false;
  let observedRateLimit: Record<string, unknown> | null = null;

  for (const ticker of selectedSymbols) {
    if (haltedByProvider) break;
    screened += 1;
    try {
      const marketDraft = await collectMarket(actor, { ticker });
      marketDraftsCreated += 1;
      const provenance = record(marketDraft.provenance);
      const requests = Array.isArray(provenance.requests) ? provenance.requests.map(record) : [];
      const rateLimits = requests.map((request) => record(request.rateLimit)).filter((item) => Object.keys(item).length > 0);
      if (rateLimits.length) observedRateLimit = rateLimits.at(-1)!;
    } catch (error) {
      if (error instanceof SchwabResearchError) {
        addIssue(issues, error.code, error.message);
        observedRateLimit = record(error.metadata.providerSafeHeaders);
        if (["PROVIDER_ENTITLEMENT_REQUIRED", "PROVIDER_RATE_LIMITED", "TOKEN_REFRESH_REQUIRED", "MARKET_DATA_DISCONNECTED", "PROVIDER_UNAVAILABLE", "CONNECTION_CHANGED"].includes(error.code)) {
          haltedByProvider = true;
        }
      } else {
        addIssue(issues, "SCHWAB_COLLECTION_FAILED", "Schwab data could not be collected for one or more symbols.");
      }
      continue;
    }
    try {
      const sec = await collectSec(actor, { ticker });
      if (sec.alreadyCollected) secSnapshotsReused += 1;
      else secDraftsCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEC source retrieval failed";
      const code = /issuer index|10-Q filing/i.test(message) ? "SEC_COVERAGE_UNAVAILABLE" : "SEC_SOURCE_UNAVAILABLE";
      addIssue(issues, code, message.slice(0, 240));
    }
  }

  if (marketDraftsCreated + secDraftsCreated > 0) {
    addIssue(
      issues,
      "PENDING_HUMAN_REVIEW",
      "New provider observations were retained as non-authoritative drafts and do not affect rankings until a human approves them.",
    );
  }

  const ranking = await (dependencies.rank ?? listResearchOpportunities)(actor, options);
  const [updatedConnection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId))
    .limit(1);
  const eligibleSymbols = ranking.totalEligible;
  const excludedSymbols = Math.max(0, screened - eligibleSymbols);
  const limitations = [...issues.values()];
  const coverageStatus = universe.length === 0 || universe.length > MAX_DISCOVERY_SYMBOLS || haltedByProvider || limitations.some((issue) =>
    issue.code === "SEC_COVERAGE_UNAVAILABLE" || issue.code === "SEC_SOURCE_UNAVAILABLE")
    ? "LIMITED"
    : "COMPLETE_KNOWN_UNIVERSE";
  const result = {
    ...ranking,
    discovery: {
      status: coverageStatus === "LIMITED" ? "LIMITED" as const : "COMPLETED" as const,
      progress: {
        phase: "COMPLETED" as const,
        completed: screened,
        total: selectedSymbols.length,
        message: "Connection verification, permitted provider reads, evidence staging, and deterministic ranking completed.",
      },
      knownUniverseCount: universe.length,
      symbolsSelected: selectedSymbols.length,
      symbolsScreened: screened,
      symbolsEligible: eligibleSymbols,
      symbolsExcluded: excludedSymbols,
      finalCandidateCount: ranking.opportunities.length,
      marketDraftsCreated,
      secDraftsCreated,
      secSnapshotsReused,
      exclusionReasons: limitations,
      provider: {
        schwabConnectionStatus: connection.status,
        schwabTokenStatus: "CURRENT" as const,
        schwabLastSuccessfulReadAt: updatedConnection?.lastSuccessfulReadAt?.toISOString()
          ?? connection.lastSuccessfulReadAt?.toISOString()
          ?? null,
        schwabFreshness: marketDraftsCreated > 0 ? "REFRESHED" as const : "NOT_REFRESHED" as const,
        secStatus: secDraftsCreated > 0 ? "REFRESHED" as const : secSnapshotsReused > 0 ? "CURRENT" as const : "LIMITED" as const,
        coverageStatus,
        providerWideDiscovery: false as const,
        symbolLimit: MAX_DISCOVERY_SYMBOLS,
        rateLimit: observedRateLimit,
      },
    },
  };
  await appendAuditEvent({
    householdId: actor.householdId,
    actor: actor.userId,
    eventType: "research_opportunity_discovery_completed",
    entity: "research_opportunity_discovery",
    entityId: actor.householdId,
    reason: "Read-only provider discovery completed; new observations remain pending human review",
    metadata: {
      knownUniverseCount: universe.length,
      symbolsScreened: screened,
      symbolsEligible: eligibleSymbols,
      finalCandidateCount: ranking.opportunities.length,
      marketDraftsCreated,
      secDraftsCreated,
      coverageStatus,
      advisoryOnly: true,
      executionAuthority: "none",
      noTradingOrMoneyMovement: true,
    },
  });
  return result;
}