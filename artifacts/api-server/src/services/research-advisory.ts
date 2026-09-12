import { and, desc, eq, sql } from "drizzle-orm";
import { db, researchAdvisoryDecisions, schwabObservationSnapshots } from "@workspace/db";
import { appendAuditEvent } from "./audit";
import { GovernanceError, assertPermission } from "../domain/governance";
import type { Actor } from "./capital-os";
import {
  listResearchOpportunities,
  type ResearchOpportunityLens,
  type ResearchOpportunityPortfolioFit,
} from "./research-opportunities";

export type ResearchAdvisoryDecisionKind = "SKIP" | "WATCH" | "REVIEW" | "SHADOW" | "OPEN_SCHWAB";

type DecisionInput = {
  ticker: string;
  decision: ResearchAdvisoryDecisionKind;
  reason?: string;
};

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase().slice(0, 16);
}

function positionForTicker(positions: unknown, ticker: string) {
  if (!Array.isArray(positions)) return false;
  return positions.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return String(record.symbol ?? record.ticker ?? "").trim().toUpperCase() === ticker;
  });
}

function projectDecision(
  row: typeof researchAdvisoryDecisions.$inferSelect,
  opportunity: Record<string, unknown> | undefined,
  positions: unknown,
  observationAsOf: Date | null,
) {
  const observed = positionForTicker(positions, row.ticker);
  const monitoringStatus = row.decision === "SKIP"
    ? "NOT_STARTED"
    : opportunity
      ? "MONITORING"
      : "NEEDS_REVIEW";
  return {
    id: row.id,
    ticker: row.ticker,
    decision: row.decision,
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isCurrent: row.isCurrent,
    observationStatus: observationAsOf ? (observed ? "OBSERVED_IN_PORTFOLIO" : "NOT_OBSERVED") : "UNKNOWN",
    observationAsOf,
    monitoringStatus,
    manualHandoffPath: row.decision === "OPEN_SCHWAB" ? `/schwab-integration?symbol=${encodeURIComponent(row.ticker)}` : null,
    opportunitySnapshot: row.opportunitySnapshot,
    evidenceSnapshot: row.evidenceSnapshot,
    advisoryOnly: true as const,
    executionAuthorization: false as const,
    noTradingOrMoneyMovement: true as const,
  };
}

async function currentOpportunity(actor: Actor, ticker: string) {
  const response = await listResearchOpportunities(actor, { search: ticker });
  return response.opportunities.find((item) => item.ticker === ticker) as Record<string, unknown> | undefined;
}

export async function createResearchAdvisoryDecision(actor: Actor, input: DecisionInput) {
  assertPermission(actor.role, "contribute");
  const ticker = normalizeTicker(input.ticker);
  const opportunity = await currentOpportunity(actor, ticker);
  if (!opportunity) {
    throw new GovernanceError("CONFLICT", "This opportunity is no longer current and cannot receive a new advisory decision.");
  }
  const reason = input.reason?.trim().slice(0, 500) || null;
  const [row] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`research-advisory:${actor.householdId}:${ticker}`}, 0))`);
    await tx.update(researchAdvisoryDecisions)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(and(
        eq(researchAdvisoryDecisions.householdId, actor.householdId),
        eq(researchAdvisoryDecisions.ticker, ticker),
        eq(researchAdvisoryDecisions.isCurrent, true),
      ));
    return tx.insert(researchAdvisoryDecisions).values({
      householdId: actor.householdId,
      actorUserId: actor.userId,
      ticker,
      decision: input.decision,
      reason,
      opportunitySnapshot: opportunity,
      evidenceSnapshot: Array.isArray(opportunity.evidence) ? opportunity.evidence as Record<string, unknown>[] : [],
      isCurrent: true,
      advisoryOnly: true,
      executionAuthority: "none",
      noTradingOrMoneyMovement: true,
    }).returning();
  });
  await appendAuditEvent({
    householdId: actor.householdId,
    eventType: "research_advisory_decision_created",
    actor: actor.userId,
    entity: "research_advisory_decision",
    entityId: row.id,
    reason: reason ?? `Manual ${input.decision.toLowerCase()} decision for ${ticker}`,
    metadata: {
      ticker,
      decision: input.decision,
      advisoryOnly: true,
      executionAuthorization: false,
      noTradingOrMoneyMovement: true,
      evidenceIds: Array.isArray(opportunity.evidence) ? opportunity.evidence.map((item) => (item as Record<string, unknown>).id) : [],
    },
  });
  const [latestObservation] = await db.select({
    positions: schwabObservationSnapshots.positions,
    createdAt: schwabObservationSnapshots.createdAt,
  }).from(schwabObservationSnapshots)
    .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
    .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
    .limit(1);
  return projectDecision(row, opportunity, latestObservation?.positions, latestObservation?.createdAt ?? null);
}

export async function listResearchAdvisoryDecisions(actor: Actor) {
  const [rows, observations] = await Promise.all([
    db.select().from(researchAdvisoryDecisions)
      .where(eq(researchAdvisoryDecisions.householdId, actor.householdId))
      .orderBy(desc(researchAdvisoryDecisions.createdAt), desc(researchAdvisoryDecisions.id))
      .limit(100),
    db.select({
      positions: schwabObservationSnapshots.positions,
      createdAt: schwabObservationSnapshots.createdAt,
    }).from(schwabObservationSnapshots)
      .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
      .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
      .limit(1),
  ]);
  const latestObservation = observations[0];
  const currentByTicker = new Map(await Promise.all(rows.map(async (row) => [
    row.ticker,
    await currentOpportunity(actor, row.ticker),
  ] as const)));
  return {
    decisions: rows.map((row) => projectDecision(
      row,
      currentByTicker.get(row.ticker),
      latestObservation?.positions,
      latestObservation?.createdAt ?? null,
    )),
    advisoryOnly: true as const,
    executionAuthorization: false as const,
    noTradingOrMoneyMovement: true as const,
  };
}