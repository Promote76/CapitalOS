import { desc, eq } from "drizzle-orm";
import { db, schwabObservationSnapshots } from "@workspace/db";
import { appendAuditEvent } from "./audit";
import { assertPermission, GovernanceError } from "../domain/governance";
import { getGrokPortfolioResearchSnapshot, type BrokerPortfolioSnapshot } from "../adapters/broker-portfolio";
import { XaiIntelligenceProvider } from "./family-office-provider";
import { getApprovedFamilyOfficeResearchProjection } from "./family-office";
import type { Actor } from "./capital-os";

const blockedRequest = /\b(place|submit|cancel|replace|execute|automate)\b.{0,30}\b(order|trade)\b|\b(transfer|withdraw|wire|move money|borrow|leverage)\b/i;

export async function askGroundedPortfolioAgent(actor: Actor, question: string) {
  assertPermission(actor.role, "read");
  if (blockedRequest.test(question)) {
    throw new GovernanceError("FORBIDDEN", "The Portfolio AI Agent cannot execute trades, prepare automatic orders, move money, or change broker settings.");
  }
  const [snapshot, research] = await Promise.all([
    db.select().from(schwabObservationSnapshots)
      .where(eq(schwabObservationSnapshots.householdId, actor.householdId))
      .orderBy(desc(schwabObservationSnapshots.createdAt), desc(schwabObservationSnapshots.id))
      .limit(1)
      .then((rows) => rows[0]),
    getApprovedFamilyOfficeResearchProjection(actor),
  ]);
  if (!snapshot) throw new GovernanceError("INVALID_STATE", "A current Schwab observation is required before the Portfolio AI Agent can explain the portfolio.");

  const portfolio = getGrokPortfolioResearchSnapshot({
    accounts: snapshot.accounts as BrokerPortfolioSnapshot["accounts"],
    balances: snapshot.balances as BrokerPortfolioSnapshot["balances"],
    positions: snapshot.positions as BrokerPortfolioSnapshot["positions"],
    orders: [],
    transactions: snapshot.transactions as BrokerPortfolioSnapshot["transactions"],
    investmentTransactions: [],
    asOf: snapshot.createdAt.toISOString(),
    dataFreshness: snapshot.freshness as BrokerPortfolioSnapshot["dataFreshness"],
    reconciliationStatus: "MATCHED",
  });
  const approvedResearch = research.projections.map((projection) => ({
    ticker: projection.ticker,
    title: projection.title,
    thesis: projection.thesis,
    risks: projection.thesisRisk.risks,
    confidence: projection.confidence,
    evidenceIds: projection.evidenceQuality.sources.map((source) => source.id),
  }));
  const output = await new XaiIntelligenceProvider().research({
    analyst: "portfolio-ai-agent",
    scope: "Educational, informational, advisory explanation of one read-only observed brokerage snapshot",
    prompt: [
      "Answer the user's question in concise plain English first.",
      "Observed facts must come only from PORTFOLIO_OBSERVATION. Keep APPROVED_RESEARCH separate from current holdings.",
      "Every recommendation must include supporting evidence, uncertainty, and relevant risk or capital constraint.",
      "Never promise outcomes, invent missing values, imply execution authority, or reason about protected household/property capital.",
      `SNAPSHOT_AS_OF:${snapshot.createdAt.toISOString()}`,
      `PORTFOLIO_OBSERVATION:${JSON.stringify(portfolio)}`,
      `APPROVED_RESEARCH:${JSON.stringify(approvedResearch)}`,
      `USER_QUESTION:${question}`,
    ].join("\n"),
  });
  await appendAuditEvent({
    householdId: actor.householdId,
    actor: actor.userId,
    eventType: "portfolio_agent_explanation_created",
    entity: "schwab_observation_snapshot",
    entityId: snapshot.id,
    reason: "Generated a grounded educational portfolio explanation.",
    metadata: { advisoryOnly: true, executionAuthorization: false, snapshotAsOf: snapshot.createdAt.toISOString() },
  });
  const recommendationSections = [
    ...output.sections.portfolioFit.content,
    ...output.sections.concentrationLiquidityRisk.content,
  ].slice(0, 8);
  return {
    answer: output.thesis,
    facts: output.facts.slice(0, 12),
    recommendations: recommendationSections,
    risks: output.risks.slice(0, 8),
    uncertainties: output.assumptions.slice(0, 8),
    snapshotAsOf: snapshot.createdAt,
    snapshotFreshness: ["CURRENT", "AGING", "STALE"].includes(snapshot.freshness) ? snapshot.freshness : "UNKNOWN",
    researchContextStatus: approvedResearch.length > 0 ? "available" : "empty",
    advisoryOnly: true as const,
    educationalOnly: true as const,
    executionAuthorization: false as const,
    moneyMovementEnabled: false as const,
    providerStatus: "available" as const,
  };
}