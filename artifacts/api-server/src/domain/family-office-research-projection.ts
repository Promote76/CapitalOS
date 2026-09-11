export type ProjectionFreshness = "fresh" | "stale" | "unknown";
export type ResearchProjectionStatus = "available" | "empty";

export type ResearchProjectionProposal = {
  id: string;
  householdId: string;
  title: string;
  thesis: string;
  label: string;
  analyticalDirection: string;
  confidence: string | number;
  risks: string[];
  ticker: string | null;
  dossierKind: string;
  evidenceIds: string[];
  status: string;
  reviewedAt: Date | string | null;
};

export type ResearchProjectionEvidence = {
  id: string;
  householdId: string;
  title: string;
  sourceKind: string;
  classification: string;
  freshness: string;
  retrievedAt: Date | string | null;
  createdAt: Date | string;
};

export type ApprovedResearchProjection = {
  id: string;
  ticker: string;
  title: string;
  thesis: string;
  direction: string;
  confidence: number;
  portfolioFit: {
    posture: "constructive" | "neutral" | "caution";
    concentrationContext: string;
    suitability: "advisory_review";
  };
  thesisRisk: {
    risks: string[];
    reviewNeeded: boolean;
  };
  evidenceQuality: {
    level: "high" | "medium";
    sourceCount: number;
    freshness: "fresh";
    reviewedAt: string;
    sources: Array<{
      id: string;
      title: string;
      sourceKind: string;
      freshness: "fresh";
    }>;
  };
  monitoring: {
    signals: string[];
    changeDetected: boolean;
    deteriorationDetected: boolean;
    stale: false;
    lastReviewedAt: string;
  };
  advisoryOnly: true;
  executionAuthorization: false;
  householdCapitalIncluded: false;
};

export type ApprovedResearchProjectionContext = {
  status: ResearchProjectionStatus;
  projections: ApprovedResearchProjection[];
  excludedCount: number;
  policy: "human-reviewed shadow-approved research with fresh evidence only";
  advisoryOnly: true;
  executionAuthorization: false;
  householdCapitalIncluded: false;
};

const approvedSourceKinds = new Set([
  "PRIMARY_SOURCE",
  "UPLOADED_LICENSED_RESEARCH",
  "SCHWAB_MARKET_OBSERVATION",
  "PUBLIC_WEB_RETRIEVAL",
  "SEC_FILING",
  "SEC_EDGAR",
]);

const approvedClassifications = new Set([
  "reviewed_uploaded_evidence",
  "server_observation",
  "public_web_retrieval",
  "reviewed",
  "approved",
]);

const dayMs = 24 * 60 * 60 * 1000;
const maxFreshAgeDays = 30;

function boundedText(value: string, maxLength: number) {
  return value.trim().slice(0, maxLength);
}

function normalizedDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function evidenceFreshness(
  evidence: ResearchProjectionEvidence,
  now: Date,
): ProjectionFreshness {
  const explicit = evidence.freshness.trim().toLowerCase();
  if (["stale", "expired"].includes(explicit)) return "stale";
  if (["fresh", "current", "as_filed"].includes(explicit)) return "fresh";

  const asOf = normalizedDate(evidence.retrievedAt) ?? normalizedDate(evidence.createdAt);
  if (!asOf) return "unknown";
  return now.getTime() - asOf.getTime() <= maxFreshAgeDays * dayMs ? "fresh" : "stale";
}

function posture(direction: string): ApprovedResearchProjection["portfolioFit"]["posture"] {
  if (direction === "BULLISH") return "constructive";
  if (direction === "BEARISH") return "caution";
  return "neutral";
}

function monitoringSignals(proposal: ResearchProjectionProposal) {
  const signals: string[] = [];
  if (proposal.risks.length > 0) signals.push("Review thesis risks and invalidation conditions.");
  if (Number(proposal.confidence) < 70) signals.push("Confidence is below the 70% monitoring threshold.");
  if (proposal.label === "AVOID" || proposal.label === "RISK_REVIEW_REQUIRED") {
    signals.push("Research label requires continued risk review.");
  }
  return signals;
}

export function buildApprovedResearchProjection(input: {
  householdId: string;
  proposals: ResearchProjectionProposal[];
  evidence: ResearchProjectionEvidence[];
  now?: Date;
}): ApprovedResearchProjectionContext {
  const now = input.now ?? new Date();
  const evidenceById = new Map(
    input.evidence
      .filter((item) => item.householdId === input.householdId)
      .map((item) => [item.id, item]),
  );
  let excludedCount = 0;
  const projections: ApprovedResearchProjection[] = [];

  for (const proposal of input.proposals) {
    const approved =
      proposal.householdId === input.householdId
      && proposal.status === "shadow_approved"
      && !!normalizedDate(proposal.reviewedAt)
      && proposal.dossierKind === "investment"
      && !!proposal.ticker?.trim()
      && !!proposal.title.trim()
      && !!proposal.thesis.trim()
      && proposal.evidenceIds.length > 0;

    if (!approved) {
      excludedCount += 1;
      continue;
    }

    const approvedEvidence = proposal.evidenceIds
      .map((id) => evidenceById.get(id))
      .filter((item): item is ResearchProjectionEvidence => (
        !!item
        && approvedSourceKinds.has(item.sourceKind)
        && approvedClassifications.has(item.classification)
      ));
    const freshness = approvedEvidence.map((item) => evidenceFreshness(item, now));
    const confidenceValue = Number(proposal.confidence);
    if (
      approvedEvidence.length === 0
      || proposal.evidenceIds.some((id) => !evidenceById.has(id))
      || freshness.some((value) => value !== "fresh")
      || !Number.isFinite(confidenceValue)
    ) {
      excludedCount += 1;
      continue;
    }

    const reviewedAt = normalizedDate(proposal.reviewedAt);
    if (!reviewedAt) {
      excludedCount += 1;
      continue;
    }

    const confidence = Math.max(0, Math.min(100, confidenceValue));
    const signals = monitoringSignals(proposal);
    projections.push({
      id: proposal.id,
      ticker: proposal.ticker!.trim().toUpperCase(),
      title: boundedText(proposal.title, 160),
      thesis: boundedText(proposal.thesis, 1200),
      direction: proposal.analyticalDirection,
      confidence,
      portfolioFit: {
        posture: posture(proposal.analyticalDirection),
        concentrationContext: "Advisory research context only; balances, positions, and allocations are unchanged.",
        suitability: "advisory_review",
      },
      thesisRisk: {
        risks: proposal.risks.slice(0, 6).map((risk) => boundedText(risk, 300)),
        reviewNeeded: signals.length > 0,
      },
      evidenceQuality: {
        level: approvedEvidence.length >= 2 ? "high" : "medium",
        sourceCount: approvedEvidence.length,
        freshness: "fresh",
        reviewedAt: reviewedAt.toISOString(),
        sources: approvedEvidence.slice(0, 6).map((item) => ({
          id: item.id,
          title: boundedText(item.title, 160),
          sourceKind: item.sourceKind,
          freshness: "fresh" as const,
        })),
      },
      monitoring: {
        signals,
        changeDetected: false,
        deteriorationDetected: proposal.analyticalDirection === "BEARISH" || proposal.label === "AVOID",
        stale: false,
        lastReviewedAt: reviewedAt.toISOString(),
      },
      advisoryOnly: true,
      executionAuthorization: false,
      householdCapitalIncluded: false,
    });
  }

  return {
    status: projections.length > 0 ? "available" : "empty",
    projections,
    excludedCount,
    policy: "human-reviewed shadow-approved research with fresh evidence only",
    advisoryOnly: true,
    executionAuthorization: false,
    householdCapitalIncluded: false,
  };
}