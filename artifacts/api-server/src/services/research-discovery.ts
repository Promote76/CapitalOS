import { eq } from "drizzle-orm";
import { db, schwabMarketDataConnections } from "@workspace/db";
import secUniverseSnapshot from "../data/sec-us-equity-universe.json";
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

type SecUniverseSnapshot = {
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
    selectionMethod: string;
    limitations: string[];
  };
  counts: {
    available: number;
    excluded: number;
    exclusions: Record<string, number>;
  };
  entries: Array<{ ticker: string; cik: string; name: string; exchange: string }>;
};

const secUniverse = secUniverseSnapshot as SecUniverseSnapshot;

type DiscoveryDependencies = {
  collectMarket?: typeof collectSchwabMarketSnapshotDraft;
  collectSec?: typeof retrieveSecFiling;
  rank?: typeof listResearchOpportunities;
};
type DiscoveryOptions = ResearchOpportunityOptions & {
  offset?: number;
  universeVersion?: string;
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

export async function discoverResearchOpportunities(
  actor: Actor,
  options: DiscoveryOptions = {},
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

  // The SEC snapshot is the authoritative, attributed universe.  Keep its
  // generated order: it is the stable SHA-256(version:ticker) order recorded
  // in the source metadata and therefore makes offset pagination reproducible.
  const universe = secUniverse.entries
    .map((entry) => symbolFrom(entry.ticker))
    .filter((symbol): symbol is string => symbol !== null);
  const versionedOffset = options.universeVersion && options.universeVersion !== secUniverse.source.version
    ? 0
    : options.offset ?? 0;
  const runOffset = Math.min(Math.max(0, Math.floor(versionedOffset)), universe.length);
  const selectedSymbols = universe.slice(runOffset, runOffset + MAX_DISCOVERY_SYMBOLS);
  const issues = new Map<string, DiscoveryIssue>();
  addIssue(
    issues,
    "PROVIDER_WIDE_SCREENER_UNAVAILABLE",
    "The authorized Schwab APIs expose symbol-targeted fundamentals, quotes, and price history, but no provider-wide opportunity screener.",
  );
  if (universe.length > MAX_DISCOVERY_SYMBOLS) {
    addIssue(issues, "BOUNDED_SYMBOL_LIMIT", `This run screened at most ${MAX_DISCOVERY_SYMBOLS} symbols in deterministic SEC snapshot order to respect provider request limits.`);
  }

  const collectMarket = dependencies.collectMarket ?? collectSchwabMarketSnapshotDraft;
  const collectSec = dependencies.collectSec ?? retrieveSecFiling;
  let marketDraftsCreated = 0;
  let secDraftsCreated = 0;
  let secSnapshotsReused = 0;
  let screened = 0;
  let haltedByProvider = false;
  let schwabFailures = 0;
  let secFailures = 0;
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
        schwabFailures += 1;
        observedRateLimit = record(error.metadata.providerSafeHeaders);
        if (["PROVIDER_ENTITLEMENT_REQUIRED", "PROVIDER_RATE_LIMITED", "TOKEN_REFRESH_REQUIRED", "MARKET_DATA_DISCONNECTED", "PROVIDER_UNAVAILABLE", "CONNECTION_CHANGED"].includes(error.code)) {
          haltedByProvider = true;
        }
      } else {
        addIssue(issues, "SCHWAB_COLLECTION_FAILED", "Schwab data could not be collected for one or more symbols.");
        schwabFailures += 1;
      }
    }
    // SEC retrieval is an independent permitted read.  It may proceed after
    // a non-halting Schwab omission, but a provider halt stops the run.
    if (haltedByProvider) continue;
    try {
      const sec = await collectSec(actor, { ticker });
      if (sec.alreadyCollected) secSnapshotsReused += 1;
      else secDraftsCreated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEC source retrieval failed";
      const code = /issuer index|10-Q filing/i.test(message) ? "SEC_COVERAGE_UNAVAILABLE" : "SEC_SOURCE_UNAVAILABLE";
      addIssue(issues, code, message.slice(0, 240));
      secFailures += 1;
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
  const omittedSymbols = Math.max(0, selectedSymbols.length - screened);
  const excludedSymbols = Math.max(0, selectedSymbols.length - marketDraftsCreated);
  const providerFailures = schwabFailures + secFailures;
  const nextOffset = runOffset + screened < universe.length ? runOffset + screened : null;
  if (omittedSymbols > 0) {
    addIssue(issues, "PROVIDER_OMISSIONS", `${omittedSymbols} selected SEC symbols were not screened because the provider halted the run.`);
  }
  const limitations = [...issues.values()];
  const coverageStatus = nextOffset !== null || haltedByProvider || limitations.some((issue) =>
    issue.code === "SEC_COVERAGE_UNAVAILABLE" || issue.code === "SEC_SOURCE_UNAVAILABLE")
    ? "LIMITED"
    : "COMPLETE_BOUNDED_RUN";
  const pendingReview = marketDraftsCreated + secDraftsCreated;
  const finalCandidateCount = ranking.opportunities.length;
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
      rawSourceRowCount: secUniverse.source.sourceRowCount,
      availableSymbolCount: secUniverse.counts.available,
      source: {
        provider: secUniverse.source.provider,
        title: secUniverse.source.title,
        url: secUniverse.source.url,
        version: secUniverse.source.version,
        retrievedAt: secUniverse.source.retrievedAt,
        sourceSha256: secUniverse.source.sourceSha256,
      },
      sourceExclusions: {
        total: secUniverse.counts.excluded,
        counts: secUniverse.counts.exclusions,
      },
      runOffset,
      runCap: MAX_DISCOVERY_SYMBOLS,
      selected: selectedSymbols.length,
      screened,
      symbolsSelected: selectedSymbols.length,
      symbolsScreened: screened,
      symbolsEligible: eligibleSymbols,
      symbolsExcluded: excludedSymbols,
      successfulSchwabEnrichments: marketDraftsCreated,
      providerFailures,
      schwabFailures,
      secFailures,
      providerOmissions: omittedSymbols,
      pendingReview,
      approvedEligible: eligibleSymbols,
      finalCandidates: finalCandidateCount,
      nextOffset,
      limitations: [
        ...secUniverse.source.limitations,
        "Schwab did not supply the universe; it was used only for symbol-targeted read-only enrichments.",
        ...limitations.map((issue) => issue.message),
      ],
      finalCandidateCount,
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
        universeProvider: "SEC",
        schwabSuppliedUniverse: false as const,
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
      rawSourceRowCount: secUniverse.source.sourceRowCount,
      availableSymbolCount: secUniverse.counts.available,
      runOffset,
      runCap: MAX_DISCOVERY_SYMBOLS,
      symbolsScreened: screened,
      symbolsEligible: eligibleSymbols,
      successfulSchwabEnrichments: marketDraftsCreated,
      providerFailures,
      schwabFailures,
      secFailures,
      providerOmissions: omittedSymbols,
      pendingReview,
      approvedEligible: eligibleSymbols,
      finalCandidates: finalCandidateCount,
      nextOffset,
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