import { and, desc, eq, sql } from "drizzle-orm";
import {
  auditEvents,
  db,
  familyOfficeAnalystScorecards,
  familyOfficeEvidence,
  familyOfficeProposals,
  familyOfficeReports,
  familyOfficeRuns,
  shadowOrderIntents,
  shadowPortfolioOutcomes,
  shadowPortfolios,
  taxLienCandidates,
  taxLienCertificateCandidates,
} from "@workspace/db";
import { assertPermission, GovernanceError } from "../domain/governance";
import { parseMoneyToCents } from "../domain/finance";
import {
  assertShadowOnlyDecision,
  classifyDataFreshness,
  familyOfficeProviderStatus,
  reviewTaxLienCandidate,
  shadowGuardrails,
  sourcePriorityFor,
  type ResearchOutput,
} from "../domain/family-office";
import { assessTaxLienCandidate, realEstateGuardrails } from "../domain/real-estate-intelligence";
import { reviewPropertyIntelligence } from "../domain/property-underwriting";
import { ProviderUnavailableError, XaiIntelligenceProvider } from "./family-office-provider";
import { getPropertyUnderwriting } from "./property-underwriting";
import type { Actor } from "./capital-os";

type ResearchInput = { analyst?: string; scope: string; prompt: string };

const defaultAnalysts = [
  ["CIO Analyst", "portfolio research", 5000],
  ["Risk Analyst", "risk and confidence calibration", 4000],
  ["Operations Analyst", "workforce and report quality", 3000],
] as const;

const defaultReports = [
  ["morning", "Morning Family Office brief", 1],
  ["weekly", "Weekly Shadow performance review", 7],
  ["monthly", "Monthly Family Office report", 30],
] as const;

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

function outcomeView(outcome: typeof shadowPortfolioOutcomes.$inferSelect) {
  return {
    id: outcome.id,
    shadowPortfolioId: outcome.shadowPortfolioId,
    shadowIntentId: outcome.shadowIntentId,
    periodStart: outcome.periodStart,
    periodEnd: outcome.periodEnd,
    status: outcome.status,
    shadowReturnBps: outcome.shadowReturnBps === null ? null : Number(outcome.shadowReturnBps),
    benchmarkReturnBps: outcome.benchmarkReturnBps === null ? null : Number(outcome.benchmarkReturnBps),
    attributionBps: outcome.attributionBps === null ? null : Number(outcome.attributionBps),
    maxDrawdownBps: outcome.maxDrawdownBps === null ? null : Number(outcome.maxDrawdownBps),
    confidence: Number(outcome.confidence),
    evidenceIds: outcome.evidenceIds,
    asOf: outcome.asOf,
    advisoryOnly: true,
    householdCapitalIncluded: false,
    executionAuthorization: false,
  };
}

function scorecardView(scorecard: typeof familyOfficeAnalystScorecards.$inferSelect) {
  return {
    id: scorecard.id,
    analyst: scorecard.analyst,
    specialty: scorecard.specialty,
    status: scorecard.status,
    assignmentCount: scorecard.assignmentCount,
    completedCount: scorecard.completedCount,
    retryCount: scorecard.retryCount,
    failureCount: scorecard.failureCount,
    qualityScore: Number(scorecard.qualityScore),
    calibrationScore: Number(scorecard.calibrationScore),
    budgetCents: scorecard.budgetCents,
    spentCents: scorecard.spentCents,
    valueCents: scorecard.valueCents,
    authority: scorecard.authority,
    budgetRemainingCents: Math.max(0, scorecard.budgetCents - scorecard.spentCents),
    updatedAt: scorecard.updatedAt,
    advisoryOnly: true,
    executionAuthorization: false,
  };
}

function reportView(report: typeof familyOfficeReports.$inferSelect) {
  return {
    id: report.id,
    reportType: report.reportType,
    title: report.title,
    status: report.status,
    freshness: report.freshness,
    summary: report.summary,
    citations: report.citations,
    scheduledFor: report.scheduledFor,
    generatedAt: report.generatedAt,
    executionDisabled: report.executionDisabled,
    updatedAt: report.updatedAt,
    advisoryOnly: true,
  };
}

async function ensureFamilyOfficeWorkspace(householdId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`family-office-workspace:${householdId}`}))`);
    const existingScorecards = await tx.select({ id: familyOfficeAnalystScorecards.id })
      .from(familyOfficeAnalystScorecards)
      .where(eq(familyOfficeAnalystScorecards.householdId, householdId))
      .limit(1);
    if (!existingScorecards[0]) {
      await tx.insert(familyOfficeAnalystScorecards).values(defaultAnalysts.map(([analyst, specialty, budgetCents]) => ({
        householdId,
        analyst,
        specialty,
        authority: "advisory_only",
        budgetCents,
      })));
    }

    const existingReports = await tx.select({ id: familyOfficeReports.id })
      .from(familyOfficeReports)
      .where(eq(familyOfficeReports.householdId, householdId))
      .limit(1);
    if (!existingReports[0]) {
      const now = Date.now();
      await tx.insert(familyOfficeReports).values(defaultReports.map(([reportType, title, days]) => ({
        householdId,
        reportType,
        title,
        status: "unknown",
        freshness: "unknown",
        summary: "No report has been generated. The provider and execution path are disabled.",
        citations: [],
        scheduledFor: new Date(now + days * 86_400_000),
        executionDisabled: true,
      })));
    }
  });
}

export async function getFamilyOfficeSnapshot(actor: Actor) {
  assertPermission(actor.role, "read");
  await ensureFamilyOfficeWorkspace(actor.householdId);
  const [runs, proposals, portfolios, intents, outcomes, scorecards, reports, taxLienCandidates, underwriting] = await Promise.all([
    db.select().from(familyOfficeRuns).where(eq(familyOfficeRuns.householdId, actor.householdId)).orderBy(desc(familyOfficeRuns.createdAt)).limit(20),
    db.select().from(familyOfficeProposals).where(eq(familyOfficeProposals.householdId, actor.householdId)).orderBy(desc(familyOfficeProposals.createdAt)).limit(20),
    db.select().from(shadowPortfolios).where(eq(shadowPortfolios.householdId, actor.householdId)).orderBy(desc(shadowPortfolios.createdAt)),
    db.select().from(shadowOrderIntents).where(eq(shadowOrderIntents.householdId, actor.householdId)).orderBy(desc(shadowOrderIntents.createdAt)).limit(20),
    db.select().from(shadowPortfolioOutcomes).where(eq(shadowPortfolioOutcomes.householdId, actor.householdId)).orderBy(desc(shadowPortfolioOutcomes.asOf)).limit(50),
    db.select().from(familyOfficeAnalystScorecards).where(eq(familyOfficeAnalystScorecards.householdId, actor.householdId)).orderBy(desc(familyOfficeAnalystScorecards.updatedAt)),
    db.select().from(familyOfficeReports).where(eq(familyOfficeReports.householdId, actor.householdId)).orderBy(desc(familyOfficeReports.scheduledFor)),
    db.select().from(taxLienCertificateCandidates).where(eq(taxLienCertificateCandidates.householdId, actor.householdId)).orderBy(desc(taxLienCertificateCandidates.updatedAt)),
    getPropertyUnderwriting(actor),
  ]);
  const status = familyOfficeProviderStatus();
  const latestRun = runs[0];
  const lastResult = !latestRun
    ? "never" as const
    : latestRun.status === "running"
      ? "checking" as const
      : latestRun.status === "completed" && latestRun.providerStatus === "ready"
        ? "verified" as const
        : "failed" as const;
  const provider = {
    state: !status.enabled
      ? "disabled" as const
      : lastResult === "verified"
        ? "verified" as const
        : lastResult === "failed"
          ? "unavailable" as const
          : "configured" as const,
    enabled: status.enabled,
    model: status.model,
    lastCheckedAt: latestRun?.completedAt ?? latestRun?.createdAt ?? null,
    lastResult,
    lastErrorCode: lastResult === "failed"
      ? latestRun?.errorCode ?? "AI_PROVIDER_UPSTREAM_ERROR"
      : null,
  };
  const propertyCandidates = underwriting.candidates.map((candidate) => ({
    id: candidate.id,
    propertyGoalId: candidate.propertyGoalId,
    addressLabel: candidate.addressLabel,
    city: candidate.city,
    county: candidate.county,
    state: candidate.state,
    zip: candidate.zip,
    askingPrice: candidate.askingPrice,
    estimatedRent: candidate.estimatedRent,
    annualPropertyTaxes: candidate.annualPropertyTaxes,
    insurance: candidate.insurance,
    propertyType: candidate.propertyType,
    units: candidate.units,
    bedrooms: candidate.bedrooms,
    bathrooms: candidate.bathrooms,
    zoning: candidate.zoning,
    floodZone: candidate.floodZone,
    condition: candidate.condition,
    sourceKind: candidate.sourceKind ?? "unknown",
    sourcePriority: candidate.sourcePriority === null ? 10 : Number(candidate.sourcePriority),
    sourceRecords: candidate.sourceRecords,
    dataFreshness: candidate.dataFreshness,
    liveAvailability: candidate.liveAvailability,
    parcelReconciliation: candidate.parcelReconciliation,
    buyBox: candidate.deal.buyBox,
    intelligence: reviewPropertyIntelligence({
      sourceKind: candidate.sourceKind,
      sourcePriority: candidate.sourcePriority === null ? 10 : Number(candidate.sourcePriority),
      dataFreshness: candidate.dataFreshness,
      liveAvailability: candidate.liveAvailability,
      parcelReconciliation: candidate.parcelReconciliation,
      buyBoxFailures: candidate.deal.buyBox.failures,
    }),
    status: candidate.status,
    advisoryOnly: true,
    purchaseAuthority: false,
  }));
  return {
    provider,
    guardrails: shadowGuardrails(),
    runs: runs.map(runView),
    proposals: proposals.map(proposalView),
    shadowPortfolios: portfolios.map(portfolioView),
    realEstate: {
      propertyCandidates,
      taxLienCandidates: taxLienCandidates.map(taxLienView),
      sourceHierarchy: [
        "County Tax Collector",
        "Property Appraiser",
        "Clerk / Recorder",
        "State Statutes",
        "Official State Guidance",
        "County GIS",
        "Other Government Records",
        "Third-Party Property Sources",
        "Social / Informal Sources",
      ],
      policy: {
        jurisdiction: "Florida county-held certificates",
        startingBankrollCents: 200_000,
        initialDeploymentCapCents: 50_000,
        preferredPositionRangeCents: [10_000, 27_500],
        singlePositionHardCapCents: 30_000,
        opportunityReserveMinimumCents: 50_000,
        strategicReserveMinimumCents: 100_000,
        primaryOutcome: "REDEMPTION",
        autonomousPurchase: false,
      },
      advisoryOnly: true,
      purchaseAuthority: false,
    },
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
    shadowOutcomes: outcomes.map(outcomeView),
    workforce: {
      analysts: scorecards.map(scorecardView),
      authority: "Human review is required for every decision. Analysts cannot place orders or access household capital.",
      budgetGovernor: "Assignments are bounded by the persisted per-analyst budget; over-budget work remains blocked.",
    },
    reports: reports.map(reportView),
    summary: {
      liveExecutionEnabled: false,
      realOrdersSent: 0,
      moneyMovedCents: 0,
      shadowOnly: true,
      outcomesWithAttribution: outcomes.filter((outcome) => outcome.attributionBps !== null).length,
      confidenceCalibration: outcomes.length
        ? Number((outcomes.reduce((total, outcome) => total + Number(outcome.confidence), 0) / outcomes.length).toFixed(2))
        : null,
    },
  };
}

function legacyTaxLienView(candidate: typeof taxLienCandidates.$inferSelect) {
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

function taxLienView(candidate: typeof taxLienCertificateCandidates.$inferSelect) {
  const sourcePriority = candidate.sourceRecords.length
    ? Math.min(...candidate.sourceRecords.map((record) => sourcePriorityFor(record.sourceKind)))
    : sourcePriorityFor(undefined);
  const review = reviewTaxLienCandidate({
    currentPurchaseAmountCents: Math.round(Number(candidate.currentPurchaseAmount) * 100),
    conservativeValueCents: Math.round(Number(candidate.conservativeValue ?? "0") * 100),
    totalLienExposureCents: Math.round(Number(candidate.totalLienExposure ?? candidate.currentPurchaseAmount) * 100),
    sourcePriority,
    dataFreshness: candidate.dataFreshness as "fresh" | "stale" | "unknown",
    liveAvailability: candidate.liveAvailability as "verified_available" | "unverified" | "unavailable" | "redeemed",
    parcelReconciliation: candidate.parcelReconciliation as "matched" | "partial" | "unresolved" | "conflict" | "unknown",
    certificateReconciliation: candidate.certificateReconciliation as "matched" | "partial" | "unresolved" | "conflict" | "unknown",
    stackRisk: candidate.openCertificates.length > 1 ? "high" : candidate.openCertificates.length === 1 ? "moderate" : "low",
    redemptionAssessment: candidate.redemptionAssessment as "high" | "moderate" | "low" | "unknown",
    access: candidate.access,
    buildability: candidate.buildability,
    homesteadStatus: candidate.homesteadStatus,
    flood: candidate.flood,
    wetland: candidate.wetland,
    codeStatus: candidate.codeStatus,
    titleRisk: candidate.titleRisk,
    bankruptcyOrLitigation: candidate.riskFlags.some((flag) => /bankrupt|litigat/i.test(flag)) ? "unresolved" : "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 100_000,
  });
  return {
    id: candidate.id,
    jurisdictionPolicy: candidate.jurisdictionPolicy,
    county: candidate.county,
    state: candidate.state,
    certificateNumber: candidate.certificateNumber,
    parcelNumber: candidate.parcelNumber,
    taxYear: candidate.taxYear,
    faceAmount: candidate.faceAmount,
    currentPurchaseAmount: candidate.currentPurchaseAmount,
    statedRate: candidate.statedRate,
    status: candidate.status,
    owner: candidate.owner,
    propertyAddress: candidate.propertyAddress,
    legalDescription: candidate.legalDescription,
    propertyUse: candidate.propertyUse,
    acreage: candidate.acreage,
    assessedValue: candidate.assessedValue,
    justValue: candidate.justValue,
    conservativeValue: candidate.conservativeValue,
    certToValue: review.certToValue,
    totalLienExposure: candidate.totalLienExposure,
    totalExposureToValue: review.totalExposureToValue,
    homesteadStatus: candidate.homesteadStatus,
    priorCertificates: candidate.priorCertificates,
    openCertificates: candidate.openCertificates,
    redeemedCertificates: candidate.redeemedCertificates,
    taxDeedHistory: candidate.taxDeedHistory,
    access: candidate.access,
    buildability: candidate.buildability,
    flood: candidate.flood,
    wetland: candidate.wetland,
    codeStatus: candidate.codeStatus,
    titleRisk: candidate.titleRisk,
    redemptionAssessment: candidate.redemptionAssessment,
    redemptionUncertainty: review.redemptionUncertainty,
    riskFlags: candidate.riskFlags,
    liveAvailability: candidate.liveAvailability,
    parcelReconciliation: candidate.parcelReconciliation,
    certificateReconciliation: candidate.certificateReconciliation,
    sourcePriority,
    sourceRecords: candidate.sourceRecords,
    dataFreshness: candidate.dataFreshness,
    score: review.score,
    decision: review.decision,
    hardStops: review.hardStops,
    capitalGovernor: review.capitalGovernor,
    lastVerifiedAt: candidate.lastVerifiedAt,
    advisoryOnly: true,
    purchaseAuthority: false,
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
    taxLiens: taxLiens.map(legacyTaxLienView),
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

export async function runFamilyOfficeResearch(actor: Actor, input: ResearchInput) {
  assertPermission(actor.role, "contribute");
  await ensureFamilyOfficeWorkspace(actor.householdId);
  const analyst = input.analyst?.trim() || "Research Analyst";
  const { scorecard, run } = await db.transaction(async (tx) => {
    let [currentScorecard] = await tx.select({ id: familyOfficeAnalystScorecards.id })
      .from(familyOfficeAnalystScorecards)
      .where(and(
        eq(familyOfficeAnalystScorecards.householdId, actor.householdId),
        sql`lower(${familyOfficeAnalystScorecards.analyst}) = lower(${analyst})`,
      ))
      .limit(1);
    if (!currentScorecard) {
      [currentScorecard] = await tx.insert(familyOfficeAnalystScorecards).values({
        householdId: actor.householdId,
        analyst,
        specialty: "advisory research",
        authority: "advisory_only",
      }).returning({ id: familyOfficeAnalystScorecards.id });
    }
    await tx.update(familyOfficeAnalystScorecards).set({
      assignmentCount: sql`${familyOfficeAnalystScorecards.assignmentCount} + 1`,
      status: "working",
      updatedAt: new Date(),
    }).where(eq(familyOfficeAnalystScorecards.id, currentScorecard.id));
    const [currentRun] = await tx.insert(familyOfficeRuns).values({
      householdId: actor.householdId,
      analyst,
      scope: input.scope.trim(),
      status: "running",
      providerStatus: "checking",
      createdBy: actor.userId,
    }).returning();
    return { scorecard: currentScorecard, run: currentRun };
  });
  const provider = new XaiIntelligenceProvider();
  let output: ResearchOutput;
  try {
    output = await provider.research({ analyst, scope: input.scope, prompt: input.prompt });
  } catch (error) {
    const errorCode = error instanceof ProviderUnavailableError ? error.code : "AI_PROVIDER_UPSTREAM_ERROR";
    const updated = await db.transaction(async (tx) => {
      const [blockedRun] = await tx.update(familyOfficeRuns).set({
        status: "blocked",
        providerStatus: "unavailable",
        errorCode,
        completedAt: new Date(),
      }).where(and(eq(familyOfficeRuns.id, run.id), eq(familyOfficeRuns.householdId, actor.householdId))).returning();
      await tx.update(familyOfficeAnalystScorecards).set({
        failureCount: sql`${familyOfficeAnalystScorecards.failureCount} + 1`,
        status: "blocked",
        updatedAt: new Date(),
      }).where(eq(familyOfficeAnalystScorecards.id, scorecard.id));
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "family_office_research_blocked",
        actor: actor.userId,
        entity: "family_office_run",
        entityId: run.id,
        reason: "Provider unavailable or response invalid; no research was fabricated.",
        metadata: { advisoryOnly: true, executionAuthorization: false, errorCode },
      });
      return blockedRun;
    });
    return { run: runView(updated), proposal: null, advisoryOnly: true };
  }

  try {
    return await db.transaction(async (tx) => {
      const evidenceRows = output.evidence.length
        ? await tx.insert(familyOfficeEvidence).values(output.evidence.map((evidence) => ({
          householdId: actor.householdId,
          runId: run.id,
          sourceKind: evidence.sourceKind,
          title: evidence.title,
          sourceUrl: evidence.sourceUrl,
          excerpt: evidence.excerpt,
          classification: evidence.classification,
          freshness: evidence.freshness,
          confidence: evidence.confidence.toFixed(2),
        }))).returning({ id: familyOfficeEvidence.id })
        : [];
      const [proposal] = await tx.insert(familyOfficeProposals).values({
        householdId: actor.householdId,
        runId: run.id,
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
      const [updated] = await tx.update(familyOfficeRuns).set({
        status: "completed",
        providerStatus: "ready",
        errorCode: null,
        outputSummary: output.title,
        completedAt: new Date(),
      }).where(and(eq(familyOfficeRuns.id, run.id), eq(familyOfficeRuns.householdId, actor.householdId))).returning();
      await tx.update(familyOfficeAnalystScorecards).set({
        completedCount: sql`${familyOfficeAnalystScorecards.completedCount} + 1`,
        status: "available",
        updatedAt: new Date(),
      }).where(eq(familyOfficeAnalystScorecards.id, scorecard.id));
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "family_office_research_completed",
        actor: actor.userId,
        entity: "family_office_run",
        entityId: run.id,
        reason: "Advisory research completed; proposal remains human-reviewed and shadow-only.",
        metadata: { advisoryOnly: true, executionAuthorization: false },
      });
      return { run: runView(updated), proposal: proposalView(proposal), advisoryOnly: true };
    });
  } catch {
    const updated = await db.transaction(async (tx) => {
      const [blockedRun] = await tx.update(familyOfficeRuns).set({
        status: "blocked",
        providerStatus: "error",
        errorCode: "AI_RESEARCH_PERSISTENCE_ERROR",
        completedAt: new Date(),
      }).where(and(eq(familyOfficeRuns.id, run.id), eq(familyOfficeRuns.householdId, actor.householdId))).returning();
      await tx.update(familyOfficeAnalystScorecards).set({
        failureCount: sql`${familyOfficeAnalystScorecards.failureCount} + 1`,
        status: "blocked",
        updatedAt: new Date(),
      }).where(eq(familyOfficeAnalystScorecards.id, scorecard.id));
      await tx.insert(auditEvents).values({
        householdId: actor.householdId,
        eventType: "family_office_research_blocked",
        actor: actor.userId,
        entity: "family_office_run",
        entityId: run.id,
        reason: "Research output could not be committed atomically; no proposal was retained.",
        metadata: { advisoryOnly: true, executionAuthorization: false, errorCode: "AI_RESEARCH_PERSISTENCE_ERROR" },
      });
      return blockedRun;
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
  const [intent] = await db.transaction(async (tx) => {
    const referenceTimestamp = new Date();
    const [created] = await tx.insert(shadowOrderIntents).values({
      householdId: actor.householdId,
      proposalId: proposal.id,
      shadowPortfolioId: portfolio.id,
      symbol: input.symbol.trim().toUpperCase().slice(0, 32),
      direction: input.direction,
      hypotheticalQuantity: input.hypotheticalQuantity.toFixed(8),
      hypotheticalNotional: input.hypotheticalNotional,
      referencePrice: input.referencePrice.toFixed(8),
      referenceTimestamp,
      timeHorizon: input.timeHorizon.trim().slice(0, 120),
    }).returning();
    await tx.insert(shadowPortfolioOutcomes).values({
      householdId: actor.householdId,
      shadowPortfolioId: portfolio.id,
      shadowIntentId: created.id,
      periodStart: referenceTimestamp,
      status: "pending",
      confidence: "0",
      evidenceIds: [],
      asOf: referenceTimestamp,
    });
    return [created];
  });
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
  return legacyTaxLienView(candidate);
}
