import { and, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  db,
  familyOfficeEvidence,
  familyOfficeProposals,
  familyOfficeRuns,
  households,
  shadowOrderIntents,
  shadowPortfolios,
  taxLienCertificateCandidates,
  users,
  householdMembers,
} from "@workspace/db";

const researchMarker = (runId: string) => `research-isolation-browser:${runId}`;

async function activeIdentity(externalAuthId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
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
  return null;
}

export async function setupFamilyOfficeBrowserFixture(externalAuthId: string, runId: string) {
  const identity = await activeIdentity(externalAuthId);
  if (!identity) throw new Error(`Expected an active household membership for ${externalAuthId}`);

  const [proposal] = await db.insert(familyOfficeProposals).values({
    householdId: identity.householdId,
    title: `Browser Shadow proposal ${runId}`,
    thesis: "A browser-only review fixture; no execution authority.",
    label: "REVIEW_CANDIDATE",
    analyticalDirection: "NEUTRAL",
    confidence: "42",
    facts: ["Browser fixture fact"],
    assumptions: ["Browser fixture assumption"],
    risks: ["Browser fixture risk"],
  }).returning({ id: familyOfficeProposals.id });
  const [portfolio] = await db.insert(shadowPortfolios).values({
    householdId: identity.householdId,
    name: `Browser Shadow portfolio ${runId}`,
    benchmark: "SPY",
    strategy: "Hypothetical browser review only",
  }).returning({ id: shadowPortfolios.id });
  if (!proposal?.id || !portfolio?.id) throw new Error("Could not create the Family Office browser fixture");
  return { ...identity, proposalId: proposal.id, portfolioId: portfolio.id };
}

export async function setupApprovedResearchIsolationBrowserFixture(externalAuthId: string, runId: string) {
  const identity = await activeIdentity(externalAuthId);
  if (!identity) throw new Error(`Expected an active household membership for ${externalAuthId}`);

  const marker = researchMarker(runId);
  const now = new Date();
  const staleAt = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const [isolatedHousehold] = await db.insert(households).values({
    name: `${marker} isolated household`,
  }).returning({ id: households.id });
  if (!isolatedHousehold?.id) throw new Error("Could not create the isolated research household");

  const [run, isolatedRun] = await Promise.all([
    db.insert(familyOfficeRuns).values({
      householdId: identity.householdId,
      analyst: "Approved research browser fixture",
      scope: marker,
      status: "completed",
      providerStatus: "ready",
      outputSummary: "Approved-only projection browser fixture.",
      createdBy: identity.userId,
      completedAt: now,
    }).returning({ id: familyOfficeRuns.id }),
    db.insert(familyOfficeRuns).values({
      householdId: isolatedHousehold.id,
      analyst: "Approved research browser fixture",
      scope: marker,
      status: "completed",
      providerStatus: "ready",
      outputSummary: "Cross-household research must remain isolated.",
      completedAt: now,
    }).returning({ id: familyOfficeRuns.id }),
  ]);
  const householdRun = run[0];
  const isolatedHouseholdRun = isolatedRun[0];
  if (!householdRun?.id || !isolatedHouseholdRun?.id) throw new Error("Could not create the research browser runs");

  const [approvedEvidence, pendingEvidence, staleEvidence, isolatedEvidence] = await Promise.all([
    db.insert(familyOfficeEvidence).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      sourceKind: "PRIMARY_SOURCE",
      title: `${marker} approved source`,
      excerpt: "Reviewed primary source for the approved browser thesis.",
      classification: "reviewed",
      freshness: "fresh",
      retrievedAt: now,
      confidence: "0.92",
    }).returning({ id: familyOfficeEvidence.id }),
    db.insert(familyOfficeEvidence).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      sourceKind: "PRIMARY_SOURCE",
      title: `${marker} pending source`,
      excerpt: "Pending source must not reach downstream advisory views.",
      classification: "unverified",
      freshness: "fresh",
      retrievedAt: now,
      confidence: "0.42",
    }).returning({ id: familyOfficeEvidence.id }),
    db.insert(familyOfficeEvidence).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      sourceKind: "PRIMARY_SOURCE",
      title: `${marker} stale source`,
      excerpt: "Stale source must not reach downstream advisory views.",
      classification: "reviewed",
      freshness: "stale",
      retrievedAt: staleAt,
      confidence: "0.81",
    }).returning({ id: familyOfficeEvidence.id }),
    db.insert(familyOfficeEvidence).values({
      householdId: isolatedHousehold.id,
      runId: isolatedHouseholdRun.id,
      sourceKind: "PRIMARY_SOURCE",
      title: `${marker} cross-household source`,
      excerpt: "A separate household's approved source must not be visible.",
      classification: "reviewed",
      freshness: "fresh",
      retrievedAt: now,
      confidence: "0.88",
    }).returning({ id: familyOfficeEvidence.id }),
  ]);
  const approvedEvidenceId = approvedEvidence[0]?.id;
  const pendingEvidenceId = pendingEvidence[0]?.id;
  const staleEvidenceId = staleEvidence[0]?.id;
  const isolatedEvidenceId = isolatedEvidence[0]?.id;
  if (!approvedEvidenceId || !pendingEvidenceId || !staleEvidenceId || !isolatedEvidenceId) {
    throw new Error("Could not create the research browser evidence fixture");
  }

  const [approvedProposal, pendingProposal, staleProposal, malformedProposal, isolatedProposal] = await Promise.all([
    db.insert(familyOfficeProposals).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      title: `${marker} approved fresh thesis`,
      thesis: "The approved browser thesis is suitable for advisory monitoring only.",
      label: "WATCH",
      analyticalDirection: "BULLISH",
      confidence: "82",
      facts: ["Reviewed browser fixture fact"],
      assumptions: ["The source remains current."],
      risks: ["Valuation can change."],
      ticker: "BRWS",
      dossierKind: "investment",
      evidenceIds: [approvedEvidenceId],
      status: "shadow_approved",
      reviewedAt: now,
      reviewedBy: identity.userId,
      reviewReason: "Approved browser fixture evidence.",
    }).returning({ id: familyOfficeProposals.id }),
    db.insert(familyOfficeProposals).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      title: `${marker} pending thesis`,
      thesis: "Pending research must not be projected.",
      ticker: "PEND",
      dossierKind: "investment",
      evidenceIds: [pendingEvidenceId],
      status: "proposed",
    }).returning({ id: familyOfficeProposals.id }),
    db.insert(familyOfficeProposals).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      title: `${marker} stale thesis`,
      thesis: "Stale research must not be projected.",
      ticker: "STAL",
      dossierKind: "investment",
      evidenceIds: [staleEvidenceId],
      status: "shadow_approved",
      reviewedAt: now,
      reviewedBy: identity.userId,
    }).returning({ id: familyOfficeProposals.id }),
    db.insert(familyOfficeProposals).values({
      householdId: identity.householdId,
      runId: householdRun.id,
      title: "",
      thesis: "Malformed research must not be projected.",
      label: "WATCH",
      ticker: null,
      dossierKind: "investment",
      evidenceIds: [],
      status: "shadow_approved",
      reviewedAt: now,
      reviewedBy: identity.userId,
    }).returning({ id: familyOfficeProposals.id }),
    db.insert(familyOfficeProposals).values({
      householdId: isolatedHousehold.id,
      runId: isolatedHouseholdRun.id,
      title: `${marker} cross-household thesis`,
      thesis: "A separate household's approved research must not be projected.",
      label: "WATCH",
      analyticalDirection: "BULLISH",
      confidence: "91",
      ticker: "ISOL",
      dossierKind: "investment",
      evidenceIds: [isolatedEvidenceId],
      status: "shadow_approved",
      reviewedAt: now,
      reviewReason: "Cross-household isolation fixture.",
    }).returning({ id: familyOfficeProposals.id }),
  ]);

  if (!approvedProposal[0]?.id || !pendingProposal[0]?.id || !staleProposal[0]?.id || !malformedProposal[0]?.id || !isolatedProposal[0]?.id) {
    throw new Error("Could not create the research browser proposal fixture");
  }
  return {
    ...identity,
    marker,
    householdRunId: householdRun.id,
    isolatedHouseholdId: isolatedHousehold.id,
    isolatedRunId: isolatedHouseholdRun.id,
    approvedProposalId: approvedProposal[0].id,
    approvedTitle: `${marker} approved fresh thesis`,
  };
}

export async function cleanupFamilyOfficeBrowserFixture(runId: string) {
  await db.transaction(async (tx) => {
    const proposals = await tx.select({ id: familyOfficeProposals.id })
      .from(familyOfficeProposals)
      .where(eq(familyOfficeProposals.title, `Browser Shadow proposal ${runId}`));
    const portfolios = await tx.select({ id: shadowPortfolios.id })
      .from(shadowPortfolios)
      .where(eq(shadowPortfolios.name, `Browser Shadow portfolio ${runId}`));
    for (const portfolio of portfolios) {
      await tx.delete(shadowOrderIntents).where(eq(shadowOrderIntents.shadowPortfolioId, portfolio.id));
    }
    for (const proposal of proposals) {
      await tx.delete(shadowOrderIntents).where(eq(shadowOrderIntents.proposalId, proposal.id));
    }
    for (const proposal of proposals) {
      await tx.delete(familyOfficeProposals).where(eq(familyOfficeProposals.id, proposal.id));
    }
    for (const portfolio of portfolios) {
      await tx.delete(shadowPortfolios).where(eq(shadowPortfolios.id, portfolio.id));
    }
    await tx.delete(taxLienCertificateCandidates).where(eq(taxLienCertificateCandidates.county, `Browser fixture ${runId}`));
  });
}

export async function cleanupApprovedResearchIsolationBrowserFixture(runId: string) {
  const marker = researchMarker(runId);
  await db.transaction(async (tx) => {
    const runs = await tx.select({
      id: familyOfficeRuns.id,
      householdId: familyOfficeRuns.householdId,
    }).from(familyOfficeRuns).where(eq(familyOfficeRuns.scope, marker));
    const runIds = runs.map((run) => run.id);
    if (runIds.length > 0) {
      await tx.delete(familyOfficeProposals).where(inArray(familyOfficeProposals.runId, runIds));
      await tx.delete(familyOfficeRuns).where(inArray(familyOfficeRuns.id, runIds));
    }
    const isolatedHouseholds = runs
      .map((run) => run.householdId)
      .filter((householdId, index, all) => all.indexOf(householdId) === index);
    for (const householdId of isolatedHouseholds) {
      await tx.delete(auditEvents).where(eq(auditEvents.householdId, householdId));
      await tx.delete(households).where(eq(households.id, householdId));
    }
  });
}