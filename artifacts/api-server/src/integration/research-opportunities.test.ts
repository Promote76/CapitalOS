import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  db,
  investmentResearchDossiers,
  householdMembers,
  households,
  reviewedResearchEvidence,
  reviewedSecFilingEvidence,
  secFilingSnapshots,
  schwabMarketSnapshots,
  schwabConnections,
  schwabMarketDataConnections,
  schwabObservationSnapshots,
  researchAdvisoryDecisions,
  users,
} from "@workspace/db";
import { listResearchOpportunities } from "../services/research-opportunities";
import { createResearchAdvisoryDecision, listResearchAdvisoryDecisions } from "../services/research-advisory";
import { discoverResearchOpportunities } from "../services/research-discovery";
import { SchwabResearchError } from "../services/schwab-research-adapter";
import type { Actor } from "../services/capital-os";
import { staticUniverseEntries } from "../services/research-universe";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";

async function fixture() {
  const [[user], [otherUser]] = await Promise.all([
    db.insert(users).values({ email: `opportunities-${randomUUID()}@test.local`, displayName: "Opportunities A", status: "active" }).returning(),
    db.insert(users).values({ email: `opportunities-other-${randomUUID()}@test.local`, displayName: "Opportunities B", status: "active" }).returning(),
  ]);
  const [[household], [otherHousehold]] = await Promise.all([
    db.insert(households).values({ name: `Opportunities A ${randomUUID()}`, timezone: "UTC" }).returning(),
    db.insert(households).values({ name: `Opportunities B ${randomUUID()}`, timezone: "UTC" }).returning(),
  ]);
  await db.insert(householdMembers).values([
    { householdId: household.id, userId: user.id, role: "owner", permissions: ["read", "contribute", "approve"], active: true },
    { householdId: otherHousehold.id, userId: otherUser.id, role: "owner", permissions: ["read", "contribute", "approve"], active: true },
  ]);
  return {
    actor: { householdId: household.id, userId: user.id, role: "owner", source: "test-database" } as Actor,
    otherActor: { householdId: otherHousehold.id, userId: otherUser.id, role: "owner", source: "test-database" } as Actor,
  };
}

test("research Top 25 is household-isolated, approved/current-only, duplicate-safe, deterministic, and advisory-only", { skip: !enabled }, async () => {
  const f = await fixture();
  const now = new Date();
  const currentRetrievedAt = new Date(now.getTime() - 1_000);
  const currentFilingDate = now.toISOString().slice(0, 10);
  const duplicateDigest = "d".repeat(64);

  const [marketSource] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.actor.householdId,
    ticker: "GOOD",
    content: { instrument: { description: "Good Holdings", fundamental: { epsTrailingTwelveMonths: 4, peRatio: 18 } }, quote: { totalVolume: 250_000 } },
    provenance: { provider: "fixture" },
    requestedAt: currentRetrievedAt,
    retrievedAt: currentRetrievedAt,
    freshness: "CURRENT",
    reviewStatus: "APPROVED",
    createdBy: f.actor.userId,
    reviewedBy: f.actor.userId,
    reviewedAt: currentRetrievedAt,
  }).returning();
  const [goodEvidence] = await db.insert(reviewedResearchEvidence).values({
    householdId: f.actor.householdId,
    snapshotId: marketSource.id,
    ticker: "GOOD",
    canonicalContent: {
      instrument: { description: "Good Holdings", fundamental: { epsTrailingTwelveMonths: 4, peRatio: 18 } },
      quote: { totalVolume: 250_000 },
      snapshotContext: { retrievedAt: currentRetrievedAt.toISOString(), freshness: "CURRENT" },
    },
    canonicalSha256: duplicateDigest,
    provenance: { provider: "fixture" },
    approvedBy: f.actor.userId,
  }).returning();

  const [duplicateSecSource] = await db.insert(secFilingSnapshots).values({
    householdId: f.actor.householdId,
    ticker: "GOOD",
    filingForm: "10-Q",
    filingDate: currentFilingDate,
    accession: `good-${randomUUID()}`,
    sourceUrl: "https://www.sec.gov/fixture",
    content: { metrics: { revenueGrowth: 10 } },
    provenance: { provider: "fixture" },
    evidenceQuality: "HIGH",
    extractionTimestamp: currentRetrievedAt,
    reviewStatus: "APPROVED",
    createdBy: f.actor.userId,
    reviewedBy: f.actor.userId,
    reviewedAt: currentRetrievedAt,
  }).returning();
  await db.insert(reviewedSecFilingEvidence).values({
    householdId: f.actor.householdId,
    snapshotId: duplicateSecSource.id,
    ticker: "GOOD",
    canonicalContent: { metrics: { revenueGrowth: 10 }, filings: [{ filingDate: currentFilingDate }] },
    canonicalSha256: duplicateDigest,
    provenance: { provider: "fixture" },
    approvedBy: f.actor.userId,
  });

  const [staleSource] = await db.insert(secFilingSnapshots).values({
    householdId: f.actor.householdId,
    ticker: "STALE",
    filingForm: "10-Q",
    filingDate: "2020-01-01",
    accession: `stale-${randomUUID()}`,
    sourceUrl: "https://www.sec.gov/fixture",
    content: {},
    provenance: { provider: "fixture" },
    evidenceQuality: "HIGH",
    extractionTimestamp: currentRetrievedAt,
    reviewStatus: "APPROVED",
    createdBy: f.actor.userId,
    reviewedBy: f.actor.userId,
    reviewedAt: currentRetrievedAt,
  }).returning();
  const [staleEvidence] = await db.insert(reviewedSecFilingEvidence).values({
    householdId: f.actor.householdId, snapshotId: staleSource.id, ticker: "STALE",
    canonicalContent: { filings: [{ filingDate: "2020-01-01" }] }, canonicalSha256: "s".repeat(64),
    provenance: { provider: "fixture" }, approvedBy: f.actor.userId,
  }).returning();

  for (const [ticker, reviewStatus] of [["PENDING", "PENDING_HUMAN_REVIEW"], ["BLOCKED", "REJECTED"]] as const) {
    const [source] = await db.insert(secFilingSnapshots).values({
      householdId: f.actor.householdId, ticker, filingForm: "10-Q", filingDate: currentFilingDate,
      accession: `${ticker.toLowerCase()}-${randomUUID()}`, sourceUrl: "https://www.sec.gov/fixture",
      content: {}, provenance: { provider: "fixture" }, evidenceQuality: "HIGH",
      extractionTimestamp: currentRetrievedAt, reviewStatus, createdBy: f.actor.userId,
    }).returning();
    await db.insert(reviewedSecFilingEvidence).values({
      householdId: f.actor.householdId, snapshotId: source.id, ticker,
      canonicalContent: { filings: [{ filingDate: currentFilingDate }] },
      canonicalSha256: `${ticker.toLowerCase()}${"x".repeat(64 - ticker.length)}`,
      provenance: { provider: "fixture" }, approvedBy: f.actor.userId,
    });
  }

  const [unknownSource] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.actor.householdId, ticker: "UNKNOWN",
    content: { instrument: { description: "Unknown Holdings" } }, provenance: { provider: "fixture" },
    requestedAt: currentRetrievedAt, retrievedAt: currentRetrievedAt, freshness: "UNKNOWN",
    reviewStatus: "APPROVED", createdBy: f.actor.userId, reviewedBy: f.actor.userId, reviewedAt: currentRetrievedAt,
  }).returning();
  await db.insert(reviewedResearchEvidence).values({
    householdId: f.actor.householdId, snapshotId: unknownSource.id, ticker: "UNKNOWN",
    canonicalContent: { snapshotContext: { freshness: "UNKNOWN", retrievedAt: currentRetrievedAt.toISOString() } },
    canonicalSha256: "u".repeat(64), provenance: { provider: "fixture" }, approvedBy: f.actor.userId,
  });

  const [foreignSource] = await db.insert(secFilingSnapshots).values({
    householdId: f.otherActor.householdId, ticker: "FOREIGN", filingForm: "10-Q", filingDate: currentFilingDate,
    accession: `foreign-${randomUUID()}`, sourceUrl: "https://www.sec.gov/fixture", content: {},
    provenance: { provider: "fixture" }, evidenceQuality: "HIGH", extractionTimestamp: currentRetrievedAt,
    reviewStatus: "APPROVED", createdBy: f.otherActor.userId, reviewedBy: f.otherActor.userId, reviewedAt: currentRetrievedAt,
  }).returning();
  await db.insert(reviewedSecFilingEvidence).values({
    householdId: f.otherActor.householdId, snapshotId: foreignSource.id, ticker: "FOREIGN",
    canonicalContent: { filings: [{ filingDate: currentFilingDate }] }, canonicalSha256: "f".repeat(64),
    provenance: { provider: "fixture" }, approvedBy: f.otherActor.userId,
  });

  await db.insert(investmentResearchDossiers).values({
    householdId: f.actor.householdId, ticker: "GOOD", title: "Blocked stale dossier",
    evidenceIds: [staleEvidence.id], report: {
      run: { status: "blocked" }, proposal: { thesis: "This blocked or stale thesis must never appear." },
    }, reviewStatus: "APPROVED", createdBy: f.actor.userId,
  });

  const before = await Promise.all([
    db.select({ id: reviewedResearchEvidence.id }).from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.householdId, f.actor.householdId)),
    db.select({ id: reviewedSecFilingEvidence.id }).from(reviewedSecFilingEvidence).where(eq(reviewedSecFilingEvidence.householdId, f.actor.householdId)),
  ]);
  const first = await listResearchOpportunities(f.actor);
  const second = await listResearchOpportunities(f.actor);

  assert.deepEqual(first.opportunities, second.opportunities);
  assert.deepEqual(first.opportunities.map((item) => item.ticker), ["GOOD"]);
  assert.equal(first.opportunities[0]?.sourceCount, 1);
  assert.equal(first.opportunities[0]?.evidence.length, 1);
  assert.equal(first.opportunities[0]?.thesis.includes("blocked or stale"), false);
  assert.equal(first.excludedStaleOrUnreviewed, 5);
  assert.equal(first.advisoryOnly, true);
  assert.equal(first.executionAuthorization, false);
  assert.equal(first.householdCapitalIncluded, false);
  assert.equal(first.noTradingOrMoneyMovement, true);
  assert.equal(first.opportunities[0]?.advisoryOnly, true);
  assert.equal(first.opportunities[0]?.noExecution, true);
  assert.equal((await listResearchOpportunities(f.otherActor)).opportunities.some((item) => item.ticker === "GOOD"), false);

  const after = await Promise.all([
    db.select({ id: reviewedResearchEvidence.id }).from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.householdId, f.actor.householdId)),
    db.select({ id: reviewedSecFilingEvidence.id }).from(reviewedSecFilingEvidence).where(eq(reviewedSecFilingEvidence.householdId, f.actor.householdId)),
  ]);
  assert.deepEqual(after, before);
});

test("research advisory decisions persist provenance and project later Schwab observations without execution authority", { skip: !enabled }, async () => {
  const f = await fixture();
  const now = new Date();
  const retrievedAt = new Date(now.getTime() - 1_000);
  const [source] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.actor.householdId,
    ticker: "CSCO",
    content: {
      instrument: { description: "Advisory Holdings", fundamental: { epsTrailingTwelveMonths: 3, peRatio: 16 } },
      quote: { totalVolume: 125_000 },
    },
    provenance: { provider: "fixture", sourceUrl: "https://fixture.invalid/csco" },
    requestedAt: retrievedAt,
    retrievedAt,
    freshness: "CURRENT",
    reviewStatus: "APPROVED",
    createdBy: f.actor.userId,
    reviewedBy: f.actor.userId,
    reviewedAt: retrievedAt,
  }).returning();
  await db.insert(reviewedResearchEvidence).values({
    householdId: f.actor.householdId,
    snapshotId: source.id,
    ticker: "CSCO",
    canonicalContent: {
      instrument: { description: "Advisory Holdings", fundamental: { epsTrailingTwelveMonths: 3, peRatio: 16 } },
      quote: { totalVolume: 125_000 },
      snapshotContext: { retrievedAt: retrievedAt.toISOString(), freshness: "CURRENT" },
    },
    canonicalSha256: "a".repeat(64),
    provenance: { provider: "fixture", sourceUrl: "https://fixture.invalid/csco" },
    approvedBy: f.actor.userId,
  });

  const opportunity = await listResearchOpportunities(f.actor, { search: "CSCO" });
  assert.equal(opportunity.opportunities[0]?.ticker, "CSCO");
  const created = await createResearchAdvisoryDecision(f.actor, {
    ticker: "CSCO",
    decision: "WATCH",
    reason: "Keep the thesis under manual review.",
  });
  assert.equal(created.ticker, "CSCO");
  assert.equal(created.decision, "WATCH");
  assert.equal(created.advisoryOnly, true);
  assert.equal(created.executionAuthorization, false);
  assert.equal(created.noTradingOrMoneyMovement, true);
  assert.equal(created.evidenceSnapshot[0]?.canonicalSha256, "a".repeat(64));
  assert.equal((await db.select({ id: researchAdvisoryDecisions.id }).from(researchAdvisoryDecisions).where(eq(researchAdvisoryDecisions.householdId, f.actor.householdId))).length, 1);

  const [connection] = await db.insert(schwabConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "CONNECTED",
  }).returning();
  await db.insert(schwabObservationSnapshots).values({
    householdId: f.actor.householdId,
    connectionId: connection.id,
    positions: [{ symbol: "CSCO", quantity: 1 }],
    freshness: "CURRENT",
  });
  const observed = await listResearchAdvisoryDecisions(f.actor);
  assert.equal(observed.decisions[0]?.observationStatus, "OBSERVED_IN_PORTFOLIO");
  assert.equal(observed.decisions[0]?.monitoringStatus, "MONITORING");
  assert.equal(observed.decisions[0]?.executionAuthorization, false);
  assert.equal((await listResearchAdvisoryDecisions(f.otherActor)).decisions.length, 0);
});

test("Find Opportunities runs the permitted provider collection pipeline before deterministic ranking", { skip: !enabled }, async () => {
  const f = await fixture();
  await db.insert(schwabMarketDataConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "LIVE_CONNECTED",
    lifecycleGeneration: randomUUID(),
    accessTokenCiphertext: "fixture-ciphertext",
    accessTokenNonce: "fixture-nonce",
    accessTokenAuthTag: "fixture-tag",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  await db.insert(schwabMarketSnapshots).values({
    householdId: f.actor.householdId,
    ticker: "AHT-PF",
    content: {},
    provenance: { provider: "fixture" },
    requestedAt: new Date(),
    retrievedAt: new Date(),
    freshness: "CURRENT",
    createdBy: f.actor.userId,
  });
  const marketReads: string[] = [];
  const secReads: string[] = [];
  let refreshed = false;
  const result = await discoverResearchOpportunities(f.actor, {}, {
    collectMarket: (async (_actor: Actor, input: { ticker: string }) => {
      marketReads.push(input.ticker);
      refreshed = true;
      return { provenance: {} };
    }) as never,
    collectSec: (async (_actor: Actor, input: { ticker: string }) => {
      secReads.push(input.ticker);
      return { alreadyCollected: false };
    }) as never,
    rank: (async () => {
      const base = await listResearchOpportunities(f.actor);
      return refreshed
        ? {
            ...base,
            opportunities: [{
              ticker: "FRESH",
              companyName: "Fresh Research Company",
              platinumScore: 88,
              category: "Balanced" as const,
              thesis: "Fresh approved evidence changed the deterministic result.",
              whyNow: "The refreshed approved evidence now qualifies.",
              redFlags: [],
              evidenceFreshness: "Current" as const,
              portfolioFit: "Constructive" as const,
              concentrationImpact: "No observed position",
              maximumExposure: "Review up to 10%",
              bullCase: "Approved evidence remains constructive.",
              baseCase: "Approved evidence remains within range.",
              bearCase: "Approved evidence deteriorates.",
              invalidationConditions: ["Fresh approved evidence no longer supports the thesis."],
              protectedCapitalStatus: "Protected-capital screen",
              humanReviewStatus: "Human review required",
              factorSubScores: { incomeQuality: 80, growthQuality: 80, earningsQuality: 80, balanceSheet: 80, valuation: 80, liquidity: 80, risk: 80, evidenceFreshness: 80, portfolioFit: 80 },
              sourceCount: 1,
              advisoryOnly: true as const,
              noExecution: true as const,
              evidence: [],
              factors: { incomeQuality: 80, growthQuality: 80, earningsQuality: 80, balanceSheet: 80, valuation: 80, liquidity: 80, risk: 80, evidenceFreshness: 80, portfolioFit: 80 },
            }],
            totalEligible: 1,
            lensCounts: { Income: 0, Compounders: 0, Balanced: 1 },
          }
        : base;
    }) as never,
  });
  assert.equal(marketReads.length, 25);
  assert.equal(secReads.length, 25);
  assert.deepEqual(marketReads.slice(0, 2), staticUniverseEntries("BROAD_US_MARKET").slice(0, 2).map((entry) => entry.ticker));
  assert.equal(result.opportunities[0]?.ticker, "FRESH");
  assert.equal(result.discovery.symbolsScreened, 25);
  assert.equal(result.discovery.finalCandidateCount, 1);
  assert.equal(result.discovery.marketDraftsCreated, 25);
  assert.equal(result.discovery.secDraftsCreated, 25);
  assert.equal(result.discovery.provider.providerWideDiscovery, false);
  assert.equal(result.discovery.provider.universeProvider, "SEC");
  assert.equal(result.discovery.provider.schwabSuppliedUniverse, false);
  assert.equal(result.discovery.runOffset, 0);
  assert.equal(result.discovery.runCap, 25);
  assert.equal(result.discovery.selected, 25);
  assert.equal(result.discovery.source.provider, "U.S. Securities and Exchange Commission");
  assert.equal(result.discovery.nextOffset, 25);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.executionAuthorization, false);
  assert.equal(result.noTradingOrMoneyMovement, true);
});

test("Find Opportunities fails explicitly before collection when Schwab Market Data is disconnected", { skip: !enabled }, async () => {
  const f = await fixture();
  let collectionTouched = false;
  await assert.rejects(
    discoverResearchOpportunities(f.actor, {}, {
      collectMarket: (async () => {
        collectionTouched = true;
        throw new Error("must not run");
      }) as never,
    }),
    (error) => error instanceof SchwabResearchError && error.code === "MARKET_DATA_DISCONNECTED",
  );
  assert.equal(collectionTouched, false);
});

test("Find Opportunities paginates the SEC universe in deterministic non-overlapping batches", { skip: !enabled }, async () => {
  const f = await fixture();
  await db.insert(schwabMarketDataConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "LIVE_CONNECTED",
    lifecycleGeneration: randomUUID(),
    accessTokenCiphertext: "fixture-ciphertext",
    accessTokenNonce: "fixture-nonce",
    accessTokenAuthTag: "fixture-tag",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  const first: string[] = [];
  const second: string[] = [];
  const dependencies = (seen: string[]) => ({
    collectMarket: (async (_actor: Actor, input: { ticker: string }) => {
      seen.push(input.ticker);
      return { provenance: {} };
    }) as never,
    collectSec: (async () => ({ alreadyCollected: false })) as never,
    rank: (async () => ({
      opportunities: [],
      totalEligible: 0,
      advisoryOnly: true,
      executionAuthorization: false,
      householdCapitalIncluded: false,
      noTradingOrMoneyMovement: true,
    })) as never,
  });
  const pageOne = await discoverResearchOpportunities(f.actor, { offset: 0 }, dependencies(first));
  const pageTwo = await discoverResearchOpportunities(f.actor, { offset: 25 }, dependencies(second));
  const reset: string[] = [];
  const resetPage = await discoverResearchOpportunities(
    f.actor,
    { offset: 25, universeVersion: "stale-universe-version" },
    dependencies(reset),
  );
  assert.equal(first.length, 25);
  assert.equal(second.length, 25);
  assert.deepEqual(first.slice(0, 2), staticUniverseEntries("BROAD_US_MARKET").slice(0, 2).map((entry) => entry.ticker));
  assert.equal(new Set([...first, ...second]).size, 50);
  assert.equal(pageOne.discovery.nextOffset, 25);
  assert.equal(pageOne.discovery.status, "LIMITED");
  assert.equal(pageOne.discovery.progress.phase, "LIMITED");
  assert.equal(pageOne.discovery.progress.completed, 25);
  assert.equal(pageTwo.discovery.runOffset, 25);
  assert.equal(pageTwo.discovery.nextOffset, 50);
  assert.equal(resetPage.discovery.runOffset, 0);
  assert.deepEqual(reset, first);
});

test("Find Opportunities reports a provider halt and retries the incomplete symbol without eligibility", { skip: !enabled }, async () => {
  const f = await fixture();
  await db.insert(schwabMarketDataConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "LIVE_CONNECTED",
    lifecycleGeneration: randomUUID(),
    accessTokenCiphertext: "fixture-ciphertext",
    accessTokenNonce: "fixture-nonce",
    accessTokenAuthTag: "fixture-tag",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  const secReads: string[] = [];
  const result = await discoverResearchOpportunities(f.actor, {}, {
    collectMarket: (async () => {
      throw new SchwabResearchError("PROVIDER_RATE_LIMITED", 429, "fixture provider halt");
    }) as never,
    collectSec: (async (_actor: Actor, input: { ticker: string }) => {
      secReads.push(input.ticker);
      return { alreadyCollected: false };
    }) as never,
    rank: (async () => ({ opportunities: [], totalEligible: 0 })) as never,
  });
  assert.equal(result.discovery.symbolsScreened, 1);
  assert.equal(result.discovery.providerFailures, 1);
  assert.equal(result.discovery.schwabFailures, 1);
  assert.equal(result.discovery.secFailures, 0);
  assert.equal(result.discovery.providerOmissions, 25);
  assert.equal(result.discovery.pendingReview, 0);
  assert.equal(result.discovery.approvedEligible, 0);
  assert.equal(result.discovery.finalCandidates, 0);
  assert.equal(result.discovery.nextOffset, 0);
  assert.equal(result.discovery.status, "LIMITED");
  assert.equal(result.discovery.progress.phase, "LIMITED");
  assert.equal(result.discovery.progress.completed, 0);
  assert.match(result.discovery.progress.message, /remains incomplete/i);
  assert.match(result.discovery.exclusionReasons.find((issue) => issue.code === "PROVIDER_OMISSIONS")?.message ?? "", /retried from the first incomplete offset/i);
  assert.deepEqual(secReads, []);
});

test("Find Opportunities retries the first symbol with a non-halting Schwab failure", { skip: !enabled }, async () => {
  const f = await fixture();
  await db.insert(schwabMarketDataConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "LIVE_CONNECTED",
    lifecycleGeneration: randomUUID(),
    accessTokenCiphertext: "fixture-ciphertext",
    accessTokenNonce: "fixture-nonce",
    accessTokenAuthTag: "fixture-tag",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  let marketAttempts = 0;
  const secReads: string[] = [];
  const result = await discoverResearchOpportunities(f.actor, {}, {
    collectMarket: (async () => {
      marketAttempts += 1;
      if (marketAttempts === 1) throw new Error("fixture symbol-level Schwab failure");
      return { provenance: {} };
    }) as never,
    collectSec: (async (_actor: Actor, input: { ticker: string }) => {
      secReads.push(input.ticker);
      return { alreadyCollected: false };
    }) as never,
    rank: (async () => ({ opportunities: [], totalEligible: 0 })) as never,
  });
  assert.equal(result.discovery.symbolsScreened, 25);
  assert.equal(result.discovery.successfulSchwabEnrichments, 24);
  assert.equal(result.discovery.schwabFailures, 1);
  assert.equal(result.discovery.providerOmissions, 1);
  assert.equal(result.discovery.nextOffset, 0);
  assert.equal(result.discovery.status, "LIMITED");
  assert.equal(result.discovery.progress.phase, "LIMITED");
  assert.equal(result.discovery.progress.completed, 24);
  assert.match(result.discovery.exclusionReasons.find((issue) => issue.code === "PROVIDER_OMISSIONS")?.message ?? "", /retried from the first incomplete offset/i);
  assert.equal(secReads.length, 25);
});

test("Find Opportunities keeps newly collected drafts pending and out of approved eligibility", { skip: !enabled }, async () => {
  const f = await fixture();
  await db.insert(schwabMarketDataConnections).values({
    householdId: f.actor.householdId,
    createdByUserId: f.actor.userId,
    status: "LIVE_CONNECTED",
    lifecycleGeneration: randomUUID(),
    accessTokenCiphertext: "fixture-ciphertext",
    accessTokenNonce: "fixture-nonce",
    accessTokenAuthTag: "fixture-tag",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
  });
  const result = await discoverResearchOpportunities(f.actor, {}, {
    collectMarket: (async () => ({ provenance: {} })) as never,
    collectSec: (async () => ({ alreadyCollected: false })) as never,
    rank: (async () => ({
      opportunities: [],
      totalEligible: 0,
      advisoryOnly: true,
      executionAuthorization: false,
      householdCapitalIncluded: false,
      noTradingOrMoneyMovement: true,
    })) as never,
  });
  assert.equal(result.discovery.successfulSchwabEnrichments, 25);
  assert.equal(result.discovery.pendingReview, 50);
  assert.equal(result.discovery.approvedEligible, 0);
  assert.equal(result.discovery.finalCandidates, 0);
  assert.equal(result.executionAuthorization, false);
  assert.equal(result.noTradingOrMoneyMovement, true);
});