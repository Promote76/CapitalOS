import { and, desc, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  familyOfficeEvidence,
  familyOfficeProposals,
  familyOfficeRuns,
  shadowOrderIntents,
  shadowPortfolios,
  taxLienCandidates,
} from "@workspace/db";
import { assertPermission, GovernanceError } from "../domain/governance";
import { parseMoneyToCents } from "../domain/finance";
import {
  assertShadowOnlyDecision,
  familyOfficeProviderStatus,
  shadowGuardrails,
  type ResearchOutput,
} from "../domain/family-office";
import { assessTaxLienCandidate, realEstateGuardrails } from "../domain/real-estate-intelligence";
import { ProviderUnavailableError, XaiIntelligenceProvider } from "./family-office-provider";
import { getPropertyUnderwriting } from "./property-underwriting";
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

function taxLienView(candidate: typeof taxLienCandidates.$inferSelect) {
  return {
    id: candidate.id,
    jurisdiction: candidate.jurisdiction,
    county: candidate.county,
    parcelId: candidate.parcelId,
    certificateNumber: candidate.certificateNumber,
    propertyAddress: candidate.propertyAddress,
    sourceKind: candidate.sourceKind,
    sourceUrl: candidate.sourceUrl,
    sourceRetrievedAt: candidate.sourceRetrievedAt,
    sourceFreshness: candidate.sourceFreshness,
    officialParcelId: candidate.officialParcelId,
    officialCertificateNumber: candidate.officialCertificateNumber,
    redemptionStatus: candidate.redemptionStatus,
    redemptionDeadline: candidate.redemptionDeadline,
    liveAvailability: candidate.liveAvailability,
    availabilityCheckedAt: candidate.availabilityCheckedAt,
    faceAmount: candidate.faceAmount,
    estimatedTotalExposure: candidate.estimatedTotalExposure,
    estimatedPropertyValue: candidate.estimatedPropertyValue,
    householdSafeToDeploy: candidate.householdSafeToDeploy,
    requiredReserveFloor: candidate.requiredReserveFloor,
    reconciliationStatus: candidate.reconciliationStatus,
    reserveStatus: candidate.reserveStatus,
    reviewStatus: candidate.reviewStatus,
    hardStops: candidate.hardStops,
    notes: candidate.notes,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    advisoryOnly: true,
    purchaseAuthorized: false,
    bidAuthorized: false,
  };
}

export async function getRealEstateIntelligence(actor: Actor) {
  assertPermission(actor.role, "read");
  const [property, taxLiens] = await Promise.all([
    getPropertyUnderwriting(actor),
    db.select().from(taxLienCandidates).where(eq(taxLienCandidates.householdId, actor.householdId)).orderBy(desc(taxLienCandidates.updatedAt)).limit(50),
  ]);
  return {
    property: {
      ...property,
      authority: "deterministic_capital_os",
      advisoryOnly: true,
      purchaseAuthorized: false,
      capitalCommitmentAuthorized: false,
    },
    taxLiens: taxLiens.map(taxLienView),
    guardrails: realEstateGuardrails(),
    summary: {
      taxLienCount: taxLiens.length,
      blockedTaxLienCount: taxLiens.filter((candidate) => candidate.reviewStatus === "blocked").length,
      purchaseAuthorized: false,
      biddingAuthorized: false,
      householdCapitalAccessible: false,
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

export type TaxLienCandidateInput = {
  jurisdiction: string;
  county: string;
  parcelId: string;
  certificateNumber: string;
  propertyAddress: string;
  sourceKind: string;
  sourceUrl?: string;
  sourceRetrievedAt?: string | Date;
  sourceFreshness: string;
  officialParcelId?: string;
  officialCertificateNumber?: string;
  redemptionStatus: string;
  redemptionDeadline?: string;
  liveAvailability: string;
  availabilityCheckedAt?: string | Date;
  faceAmount: string;
  estimatedTotalExposure: string;
  estimatedPropertyValue: string;
  householdSafeToDeploy: string;
  requiredReserveFloor: string;
  notes?: string;
};

export async function createTaxLienCandidate(actor: Actor, input: TaxLienCandidateInput) {
  assertPermission(actor.role, "manage_risk");
  if (input.jurisdiction.trim().toLowerCase() !== "florida") {
    throw new GovernanceError("INVALID_STATE", "This desk currently supports Florida tax-lien research only");
  }
  const assessment = assessTaxLienCandidate({
    sourceKind: input.sourceKind,
    parcelId: input.parcelId,
    officialParcelId: input.officialParcelId,
    certificateNumber: input.certificateNumber,
    officialCertificateNumber: input.officialCertificateNumber,
    redemptionStatus: input.redemptionStatus,
    liveAvailability: input.liveAvailability,
    sourceFreshness: input.sourceFreshness,
    estimatedTotalExposureCents: parseMoneyToCents(input.estimatedTotalExposure),
    householdSafeToDeployCents: parseMoneyToCents(input.householdSafeToDeploy),
    requiredReserveFloorCents: parseMoneyToCents(input.requiredReserveFloor),
    estimatedPropertyValueCents: parseMoneyToCents(input.estimatedPropertyValue),
  });
  const toTimestamp = (value?: string | Date) => value ? (value instanceof Date ? value : new Date(value)) : null;
  const [candidate] = await db.insert(taxLienCandidates).values({
    householdId: actor.householdId,
    jurisdiction: "Florida",
    county: input.county.trim(),
    parcelId: input.parcelId.trim(),
    certificateNumber: input.certificateNumber.trim(),
    propertyAddress: input.propertyAddress.trim(),
    sourceKind: input.sourceKind,
    sourceUrl: input.sourceUrl?.trim() || null,
    sourceRetrievedAt: toTimestamp(input.sourceRetrievedAt),
    sourceFreshness: input.sourceFreshness,
    officialParcelId: input.officialParcelId?.trim() || null,
    officialCertificateNumber: input.officialCertificateNumber?.trim() || null,
    redemptionStatus: input.redemptionStatus,
    redemptionDeadline: input.redemptionDeadline?.trim() || null,
    liveAvailability: input.liveAvailability,
    availabilityCheckedAt: toTimestamp(input.availabilityCheckedAt),
    faceAmount: input.faceAmount,
    estimatedTotalExposure: input.estimatedTotalExposure,
    estimatedPropertyValue: input.estimatedPropertyValue,
    householdSafeToDeploy: input.householdSafeToDeploy,
    requiredReserveFloor: input.requiredReserveFloor,
    reconciliationStatus: assessment.reconciliationStatus,
    reserveStatus: assessment.reserveStatus,
    reviewStatus: assessment.reviewStatus,
    hardStops: assessment.hardStops,
    notes: input.notes?.trim() || null,
  }).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    eventType: "family_office_tax_lien_recorded",
    actor: actor.userId,
    entity: "tax_lien_candidate",
    entityId: candidate.id,
    reason: "Florida tax-lien candidate recorded for research; no bid, purchase, or capital commitment was created.",
    metadata: {
      advisoryOnly: true,
      purchaseAuthorized: false,
      biddingAuthorized: false,
      hardStopCount: assessment.hardStops.length,
    },
  });
  return taxLienView(candidate);
}