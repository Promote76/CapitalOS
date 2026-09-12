import { and, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  db,
  householdMembers,
  reviewedResearchEvidence,
  researchAdvisoryDecisions,
  schwabConnections,
  schwabMarketSnapshots,
  schwabObservationSnapshots,
  users,
} from "@workspace/db";

async function activeIdentity(externalAuthId: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const [identity] = await db
      .select({ userId: users.id, householdId: householdMembers.householdId })
      .from(users)
      .innerJoin(householdMembers, and(
        eq(householdMembers.userId, users.id),
        eq(householdMembers.active, true),
      ))
      .where(and(eq(users.externalAuthId, externalAuthId), eq(users.status, "active")));
    if (identity) return identity;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected an active household membership for ${externalAuthId}`);
}

export async function setupResearchAdvisoryBrowserFixture(externalAuthId: string, runId: string) {
  const identity = await activeIdentity(externalAuthId);
  const now = new Date();
  const tickers = ["INCM", "CMPD"];
  const sourceIds: string[] = [];
  const evidenceIds: string[] = [];

  for (const ticker of tickers) {
    const [source] = await db.insert(schwabMarketSnapshots).values({
      householdId: identity.householdId,
      ticker,
      content: {
        instrument: { description: ticker === "INCM" ? "Income Browser Holdings" : "Compounder Browser Holdings" },
        quote: { lastPrice: 100, totalVolume: 250000 },
      },
      provenance: { provider: "Research browser Schwab observation", sourceUrl: `https://example.invalid/research/${runId}/${ticker}` },
      requestedAt: now,
      retrievedAt: now,
      freshness: "CURRENT",
      reviewStatus: "APPROVED",
      createdBy: identity.userId,
      reviewedBy: identity.userId,
      reviewedAt: now,
      reviewReason: `Authenticated Research browser fixture ${runId}`,
    }).returning({ id: schwabMarketSnapshots.id });
    if (!source?.id) throw new Error(`Could not create the ${ticker} market source`);
    sourceIds.push(source.id);

    const [evidence] = await db.insert(reviewedResearchEvidence).values({
      householdId: identity.householdId,
      snapshotId: source.id,
      ticker,
      canonicalContent: {
        instrument: {
          description: ticker === "INCM" ? "Income Browser Holdings" : "Compounder Browser Holdings",
          fundamental: { epsTrailingTwelveMonths: ticker === "INCM" ? 4 : 6, peRatio: ticker === "INCM" ? 14 : 20, beta: 0.9 },
        },
        quote: { lastPrice: 100, totalVolume: 250000 },
        snapshotContext: { retrievedAt: now.toISOString(), freshness: "CURRENT" },
      },
      canonicalSha256: `${ticker.toLowerCase()}${runId}`.padEnd(64, "0").slice(0, 64),
      provenance: { provider: "Research browser Schwab observation", sourceUrl: `https://example.invalid/research/${runId}/${ticker}`, reviewState: "APPROVED" },
      approvedBy: identity.userId,
      readOnly: true,
      tradingEnabled: false,
      executionAuthority: "none",
      nonAuthoritative: false,
    }).returning({ id: reviewedResearchEvidence.id });
    if (!evidence?.id) throw new Error(`Could not create the ${ticker} reviewed evidence`);
    evidenceIds.push(evidence.id);
  }

  return { ...identity, runId, tickers, sourceIds, evidenceIds };
}

export async function seedResearchObservation(
  fixture: Awaited<ReturnType<typeof setupResearchAdvisoryBrowserFixture>>,
  ticker: string,
) {
  const [connection] = await db.insert(schwabConnections).values({
    householdId: fixture.householdId,
    createdByUserId: fixture.userId,
    status: "LIVE_CONNECTED",
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }).returning({ id: schwabConnections.id });
  if (!connection?.id) throw new Error("Could not create the read-only Schwab observation connection");
  const [snapshot] = await db.insert(schwabObservationSnapshots).values({
    householdId: fixture.householdId,
    connectionId: connection.id,
    positions: [{ symbol: ticker, quantity: 1, marketValue: 100 }],
    freshness: "CURRENT",
    counts: { positions: 1 },
  }).returning({ id: schwabObservationSnapshots.id });
  if (!snapshot?.id) throw new Error("Could not create the persisted Schwab observation");
  return { connectionId: connection.id, snapshotId: snapshot.id };
}

export async function makeResearchOpportunityStale(sourceId: string) {
  await db.update(schwabMarketSnapshots).set({ freshness: "STALE" }).where(eq(schwabMarketSnapshots.id, sourceId));
}

export async function cleanupResearchAdvisoryBrowserFixture(
  fixture: Awaited<ReturnType<typeof setupResearchAdvisoryBrowserFixture>>,
) {
  const decisions = await db
    .select({ id: researchAdvisoryDecisions.id })
    .from(researchAdvisoryDecisions)
    .where(eq(researchAdvisoryDecisions.householdId, fixture.householdId));
  const decisionIds = decisions.map((decision) => decision.id);
  await db.transaction(async (tx) => {
    if (decisionIds.length > 0) {
      await tx.delete(auditEvents).where(and(
        eq(auditEvents.householdId, fixture.householdId),
        inArray(auditEvents.entityId, decisionIds),
      ));
      await tx.delete(researchAdvisoryDecisions).where(inArray(researchAdvisoryDecisions.id, decisionIds));
    }
    await tx.delete(schwabObservationSnapshots).where(eq(schwabObservationSnapshots.householdId, fixture.householdId));
    await tx.delete(schwabConnections).where(eq(schwabConnections.householdId, fixture.householdId));
    await tx.delete(reviewedResearchEvidence).where(inArray(reviewedResearchEvidence.id, fixture.evidenceIds));
    await tx.delete(schwabMarketSnapshots).where(inArray(schwabMarketSnapshots.id, fixture.sourceIds));
  });
}