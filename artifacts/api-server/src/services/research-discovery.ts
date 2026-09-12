import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { db, schwabMarketDataConnections } from "@workspace/db";
import type { Actor } from "./capital-os";
import { appendAuditEvent } from "./audit";
import { collectSchwabMarketSnapshotDraft } from "./schwab-research-collection";
import { SchwabResearchError } from "./schwab-research-adapter";
import { retrieveSecFiling } from "./sec-research";
import {
  listResearchOpportunities,
  type ResearchOpportunityOptions,
} from "./research-opportunities";
import {
  BROAD_DISCOVERY_INSTRUMENT_POLICY,
  RESEARCH_UNIVERSE_LABELS,
  broadDiscoveryPolicyExclusions,
  normalizeCustomSymbols,
  researchUniverseSnapshot,
  staticUniverseEntries,
} from "./research-universe";

const MAX_DISCOVERY_SYMBOLS = 25;

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

  const selectedUniverse = options.universe ?? "BROAD_US_MARKET";
  const instrumentPolicyExclusions = broadDiscoveryPolicyExclusions();
  const customIdentity = normalizeCustomSymbols(options.customSymbols).join(",");
  const cursorVersion = `${researchUniverseSnapshot.source.version}:${selectedUniverse}:${crypto
    .createHash("sha256")
    .update(customIdentity)
    .digest("hex")
    .slice(0, 12)}`;
  // The SEC snapshot is the authoritative, attributed directory source. Keep its
  // generated order: it is the stable SHA-256(version:ticker) order recorded
  // in the source metadata and therefore makes offset pagination reproducible.
  const universe = staticUniverseEntries(selectedUniverse, options.customSymbols)
    .map((entry) => symbolFrom(entry.ticker))
    .filter((symbol): symbol is string => symbol !== null);
  const versionedOffset = options.universeVersion && options.universeVersion !== cursorVersion
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
  let fullyProcessedSymbols = 0;
  let haltedByProvider = false;
  let firstIncompleteOffset: number | null = null;
  let schwabFailures = 0;
  let secFailures = 0;
  let observedRateLimit: Record<string, unknown> | null = null;

  for (const [selectedIndex, ticker] of selectedSymbols.entries()) {
    if (haltedByProvider) break;
    screened += 1;
    let marketCollected = false;
    try {
      const marketDraft = await collectMarket(actor, { ticker });
      marketDraftsCreated += 1;
      marketCollected = true;
      const provenance = record(marketDraft.provenance);
      const requests = Array.isArray(provenance.requests) ? provenance.requests.map(record) : [];
      const rateLimits = requests.map((request) => record(request.rateLimit)).filter((item) => Object.keys(item).length > 0);
      if (rateLimits.length) observedRateLimit = rateLimits.at(-1)!;
    } catch (error) {
      if (firstIncompleteOffset === null) firstIncompleteOffset = runOffset + selectedIndex;
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
    let secCollected = false;
    try {
      const sec = await collectSec(actor, { ticker });
      if (sec.alreadyCollected) secSnapshotsReused += 1;
      else secDraftsCreated += 1;
      secCollected = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEC source retrieval failed";
      const code = /issuer index|10-Q filing/i.test(message) ? "SEC_COVERAGE_UNAVAILABLE" : "SEC_SOURCE_UNAVAILABLE";
      addIssue(issues, code, message.slice(0, 240));
      secFailures += 1;
    }
    if (marketCollected && secCollected) fullyProcessedSymbols += 1;
  }

  if (marketDraftsCreated + secDraftsCreated > 0) {
    addIssue(
      issues,
      "PENDING_HUMAN_REVIEW",
      "New provider observations were retained as non-authoritative drafts and do not affect rankings until a human approves them.",
    );
  }

  const ranking = await (dependencies.rank ?? listResearchOpportunities)(actor, {
    ...options,
    universe: selectedUniverse,
  });
  const [updatedConnection] = await db.select().from(schwabMarketDataConnections)
    .where(eq(schwabMarketDataConnections.householdId, actor.householdId))
    .limit(1);
  const eligibleSymbols = ranking.totalEligible;
  const omittedSymbols = Math.max(0, selectedSymbols.length - marketDraftsCreated);
  const excludedSymbols = Math.max(0, selectedSymbols.length - marketDraftsCreated);
  const providerFailures = schwabFailures + secFailures;
  const completedOffset = runOffset + screened;
  const nextOffset = firstIncompleteOffset ?? (completedOffset < universe.length ? completedOffset : null);
  if (omittedSymbols > 0) {
    addIssue(
      issues,
      "PROVIDER_OMISSIONS",
      `${omittedSymbols} selected symbols did not receive successful Schwab enrichment and will be retried from the first incomplete offset.`,
    );
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
      universe: selectedUniverse,
      universeLabel: RESEARCH_UNIVERSE_LABELS[selectedUniverse],
      cursorVersion,
      domesticOnly: true as const,
      classificationUnknownExcluded: true as const,
      instrumentPolicy: {
        version: BROAD_DISCOVERY_INSTRUMENT_POLICY.version,
        unknownPolicy: BROAD_DISCOVERY_INSTRUMENT_POLICY.unknownPolicy,
        withheld: instrumentPolicyExclusions,
      },
      progress: {
        phase: coverageStatus === "LIMITED" ? "LIMITED" as const : "COMPLETED" as const,
        completed: fullyProcessedSymbols,
        total: selectedSymbols.length,
        message: coverageStatus === "LIMITED"
          ? "The bounded run remains incomplete because more symbols remain or one or more permitted provider reads were unavailable."
          : "Connection verification, permitted provider reads, evidence staging, and deterministic ranking completed.",
      },
      knownUniverseCount: universe.length,
      rawSourceRowCount: researchUniverseSnapshot.source.sourceRowCount,
      availableSymbolCount: universe.length,
      source: {
        provider: researchUniverseSnapshot.source.provider,
        title: researchUniverseSnapshot.source.title,
        url: researchUniverseSnapshot.source.url,
        version: researchUniverseSnapshot.source.version,
        retrievedAt: researchUniverseSnapshot.source.retrievedAt,
        sourceSha256: researchUniverseSnapshot.source.sourceSha256,
        classificationPolicyVersion: researchUniverseSnapshot.source.classificationPolicyVersion,
        issuerClassificationSource: researchUniverseSnapshot.source.issuerClassificationSource,
      },
      sourceExclusions: {
        total: researchUniverseSnapshot.counts.excluded,
        counts: researchUniverseSnapshot.counts.exclusions,
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
        ...researchUniverseSnapshot.source.limitations,
        "Broad discovery admits only verified common stock, ETF, closed-end fund, and preferred classifications. Warrants, units, rights, other instruments, and unknown classifications are withheld pending classification review.",
        `${RESEARCH_UNIVERSE_LABELS[selectedUniverse]} is a verified-domestic selection. Foreign issuers and unknown domicile classifications are excluded rather than inferred from exchange.`,
        ["INCOME", "GROWTH_COMPOUNDERS", "SMALL_CAP", "MID_CAP", "LARGE_CAP"].includes(selectedUniverse)
          ? "Financial style and capitalization eligibility use only current, human-approved evidence; newly collected provider evidence remains pending."
          : "Directory security classification is applied before symbol-targeted provider enrichment.",
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
      universe: selectedUniverse,
      universeVersion: researchUniverseSnapshot.source.version,
      cursorVersion,
      classificationPolicyVersion: researchUniverseSnapshot.source.classificationPolicyVersion,
      instrumentPolicyVersion: BROAD_DISCOVERY_INSTRUMENT_POLICY.version,
      instrumentPolicyWithheld: instrumentPolicyExclusions,
      rawSourceRowCount: researchUniverseSnapshot.source.sourceRowCount,
      availableSymbolCount: universe.length,
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