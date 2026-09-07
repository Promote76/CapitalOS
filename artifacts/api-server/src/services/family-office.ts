import { and, desc, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  familyOfficeEvidence,
  familyOfficeProposals,
  familyOfficeRuns,
  shadowOrderIntents,
  shadowPortfolios,
} from "@workspace/db";
import { assertPermission, GovernanceError } from "../domain/governance";
import {
  assertShadowOnlyDecision,
  familyOfficeProviderStatus,
  shadowGuardrails,
  type ResearchOutput,
} from "../domain/family-office";
import { ProviderUnavailableError, XaiIntelligenceProvider } from "./family-office-provider";
import type { Actor } from "./capital-os";

type ResearchInput = { analyst?: string; scope: string; prompt: string };

function runView(run: typeof familyOfficeRuns.$inferSelect) {
  return {
    id: run.id,
    analyst: run.analyst,
    scope: run.scope,
    status: run.status,
    providerStatus: run.providerStatus,
    errorCode: run.errorCode,
    outputSummary: run.outputSummary,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
    advisoryOnly: true,
  };
}

function proposalView(proposal: typeof familyOfficeProposals.$inferSelect) {
  return {
    id: proposal.id,
    title: proposal.title,
    thesis: proposal.thesis,
    label: proposal.label,
    analyticalDirection: proposal.analyticalDirection,
    confidence: Number(proposal.confidence),
    facts: proposal.facts,
    assumptions: proposal.assumptions,
    risks: proposal.risks,
    evidenceIds: proposal.evidenceIds,
    status: proposal.status,
    createdAt: proposal.createdAt,
    reviewedAt: proposal.reviewedAt,
    reviewReason: proposal.reviewReason,
    advisoryOnly: true,
    executionAuthorization: false,
  };
}

function portfolioView(portfolio: typeof shadowPortfolios.$inferSelect) {
  return {
    id: portfolio.id,
    name: portfolio.name,
    benchmark: portfolio.benchmark,
    strategy: portfolio.strategy,
    capitalModel: portfolio.capitalModel,
    riskPolicy: portfolio.riskPolicy,
    enabled: portfolio.enabled,
    createdAt: portfolio.createdAt,
    authoritativeHouseholdAsset: false,
    liveExecutionEnabled: false,
  };
}

export async function getFamilyOfficeSnapshot(actor: Actor) {
  assertPermission(actor.role, "read");
  const [runs, proposals, portfolios, intents] = await Promise.all([
    db.select().from(familyOfficeRuns).where(eq(familyOfficeRuns.householdId, actor.householdId)).orderBy(desc(familyOfficeRuns.createdAt)).limit(20),
    db.select().from(familyOfficeProposals).where(eq(familyOfficeProposals.householdId, actor.householdId)).orderBy(desc(familyOfficeProposals.createdAt)).limit(20),
    db.select().from(shadowPortfolios).where(eq(shadowPortfolios.householdId, actor.householdId)).orderBy(desc(shadowPortfolios.createdAt)),
    db.select().from(shadowOrderIntents).where(eq(shadowOrderIntents.householdId, actor.householdId)).orderBy(desc(shadowOrderIntents.createdAt)).limit(20),
  ]);
  const status = familyOfficeProviderStatus();
  return {
    provider: { state: status.state, enabled: status.enabled, model: status.model },
    guardrails: shadowGuardrails(),
    runs: runs.map(runView),
    proposals: proposals.map(proposalView),
    shadowPortfolios: portfolios.map(portfolioView),
    shadowIntents: intents.map((intent) => ({
      id: intent.id,
      proposalId: intent.proposalId,
      shadowPortfolioId: intent.shadowPortfolioId,
      symbol: intent.symbol,
      direction: intent.direction,
      hypotheticalQuantity: Number(intent.hypotheticalQuantity),
      hypotheticalNotional: intent.hypotheticalNotional,
      referencePrice: Number(intent.referencePrice),
      referenceTimestamp: intent.referenceTimestamp,
      timeHorizon: intent.timeHorizon,
      status: intent.status,
      advisoryOnly: true,
      transmitted: false,
    })),
    summary: {
      liveExecutionEnabled: false,
      realOrdersSent: 0,
      moneyMovedCents: 0,
      shadowOnly: true,
    },
  };
}

async function persistProviderOutput(actor: Actor, runId: string, output: ResearchOutput) {
  const evidenceRows = output.evidence.length
    ? await db.insert(familyOfficeEvidence).values(output.evidence.map((evidence) => ({
      householdId: actor.householdId,
      runId,
      sourceKind: evidence.sourceKind,
      title: evidence.title,
      sourceUrl: evidence.sourceUrl,
      excerpt: evidence.excerpt,
      classification: evidence.classification,
      freshness: evidence.freshness,
      confidence: evidence.confidence.toFixed(2),
    }))).returning({ id: familyOfficeEvidence.id })
    : [];
  const [proposal] = await db.insert(familyOfficeProposals).values({
    householdId: actor.householdId,
    runId,
    title: output.title,
    thesis: output.thesis,
    label: output.label,
    analyticalDirection: output.analyticalDirection,
    confidence: output.confidence.toFixed(2),
    facts: output.facts,
    assumptions: output.assumptions,
    risks: output.risks,
    evidenceIds: evidenceRows.map((evidence) => evidence.id),
  }).returning();
  return proposal;
}

export async function runFamilyOfficeResearch(actor: Actor, input: ResearchInput) {
  assertPermission(actor.role, "contribute");
  const analyst = input.analyst?.trim() || "Research Analyst";
  const [run] = await db.insert(familyOfficeRuns).values({
    householdId: actor.householdId,
    analyst,
    scope: input.scope.trim(),
    status: "running",
    providerStatus: "checking",
    createdBy: actor.userId,
  }).returning();
  const provider = new XaiIntelligenceProvider();
  try {
    const output = await provider.research({ analyst, scope: input.scope, prompt: input.prompt });
    const proposal = await persistProviderOutput(actor, run.id, output);
    const [updated] = await db.update(familyOfficeRuns).set({
      status: "completed",
      providerStatus: "ready",
      outputSummary: output.title,
      completedAt: new Date(),
    }).where(and(eq(familyOfficeRuns.id, run.id), eq(familyOfficeRuns.householdId, actor.householdId))).returning();
    await db.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "family_office_research_completed",
      actor: actor.userId,
      entity: "family_office_run",
      entityId: run.id,
      reason: "Advisory research completed; proposal remains human-reviewed and shadow-only.",
      metadata: { advisoryOnly: true, executionAuthorization: false },
    });
    return { run: runView(updated), proposal: proposalView(proposal), advisoryOnly: true };
  } catch (error) {
    const unavailable = error instanceof ProviderUnavailableError;
    const [updated] = await db.update(familyOfficeRuns).set({
      status: "blocked",
      providerStatus: unavailable ? "unavailable" : "error",
      errorCode: unavailable ? "AI_PROVIDER_UNAVAILABLE" : "AI_PROVIDER_ERROR",
      completedAt: new Date(),
    }).where(and(eq(familyOfficeRuns.id, run.id), eq(familyOfficeRuns.householdId, actor.householdId))).returning();
    await db.insert(auditEvents).values({
      householdId: actor.householdId,
      eventType: "family_office_research_blocked",
      actor: actor.userId,
      entity: "family_office_run",
      entityId: run.id,
      reason: "Provider unavailable or response invalid; no research was fabricated.",
      metadata: { advisoryOnly: true, executionAuthorization: false, errorCode: updated.errorCode },
    });
    return { run: runView(updated), proposal: null, advisoryOnly: true };
  }
}

export async function decideFamilyOfficeProposal(actor: Actor, proposalId: string, decision: string, reason: string) {
  assertPermission(actor.role, "approve");
  const [proposal] = await db.select().from(familyOfficeProposals).where(and(
    eq(familyOfficeProposals.id, proposalId),
    eq(familyOfficeProposals.householdId, actor.householdId),
  )).limit(1);
  if (!proposal) throw new GovernanceError("INVALID_STATE", "Family Office proposal was not found");
  const status = assertShadowOnlyDecision(decision);
  const [updated] = await db.update(familyOfficeProposals).set({
    status,
    reviewedBy: actor.userId,
    reviewedAt: new Date(),
    reviewReason: reason.trim().slice(0, 500),
  }).where(and(eq(familyOfficeProposals.id, proposal.id), eq(familyOfficeProposals.householdId, actor.householdId))).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType: "family_office_proposal_decided",
    actor: actor.userId,
    entity: "family_office_proposal",
    entityId: proposal.id,
    reason: reason.trim().slice(0, 500),
    metadata: { decision, resultingStatus: status, shadowOnly: true, executionAuthorization: false },
  });
  return proposalView(updated);
}

export async function createShadowPortfolio(actor: Actor, input: { name: string; benchmark?: string; strategy?: string }) {
  assertPermission(actor.role, "contribute");
  const [portfolio] = await db.insert(shadowPortfolios).values({
    householdId: actor.householdId,
    name: input.name.trim().slice(0, 120),
    benchmark: input.benchmark?.trim().slice(0, 120) || "Not configured",
    strategy: input.strategy?.trim().slice(0, 500) || "Research only",
  }).returning();
  return portfolioView(portfolio);
}

export async function createShadowOrderIntent(actor: Actor, input: {
  proposalId: string;
  shadowPortfolioId: string;
  symbol: string;
  direction: string;
  hypotheticalQuantity: number;
  hypotheticalNotional: string;
  referencePrice: number;
  timeHorizon: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!["long", "short", "neutral"].includes(input.direction)) throw new GovernanceError("INVALID_STATE", "Shadow direction is invalid");
  if (input.hypotheticalQuantity <= 0 || input.referencePrice <= 0) throw new GovernanceError("INVALID_STATE", "Shadow quantities and prices must be positive");
  const [[proposal], [portfolio]] = await Promise.all([
    db.select({ id: familyOfficeProposals.id, status: familyOfficeProposals.status }).from(familyOfficeProposals).where(and(eq(familyOfficeProposals.id, input.proposalId), eq(familyOfficeProposals.householdId, actor.householdId))).limit(1),
    db.select({ id: shadowPortfolios.id }).from(shadowPortfolios).where(and(eq(shadowPortfolios.id, input.shadowPortfolioId), eq(shadowPortfolios.householdId, actor.householdId))).limit(1),
  ]);
  if (!proposal || !portfolio) throw new GovernanceError("INVALID_STATE", "Shadow proposal or portfolio was not found");
  if (proposal.status !== "shadow_approved") throw new GovernanceError("FORBIDDEN", "A human must approve this proposal for Shadow before creating a hypothetical intent");
  const [intent] = await db.insert(shadowOrderIntents).values({
    householdId: actor.householdId,
    proposalId: proposal.id,
    shadowPortfolioId: portfolio.id,
    symbol: input.symbol.trim().toUpperCase().slice(0, 32),
    direction: input.direction,
    hypotheticalQuantity: input.hypotheticalQuantity.toFixed(8),
    hypotheticalNotional: input.hypotheticalNotional,
    referencePrice: input.referencePrice.toFixed(8),
    referenceTimestamp: new Date(),
    timeHorizon: input.timeHorizon.trim().slice(0, 120),
  }).returning();
  return {
    id: intent.id,
    proposalId: intent.proposalId,
    shadowPortfolioId: intent.shadowPortfolioId,
    symbol: intent.symbol,
    direction: intent.direction,
    hypotheticalQuantity: Number(intent.hypotheticalQuantity),
    hypotheticalNotional: intent.hypotheticalNotional,
    referencePrice: Number(intent.referencePrice),
    referenceTimestamp: intent.referenceTimestamp,
    timeHorizon: intent.timeHorizon,
    status: intent.status,
    advisoryOnly: true,
    transmitted: false,
  };
}