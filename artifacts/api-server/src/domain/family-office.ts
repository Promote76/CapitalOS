export const familyOfficeLabels = [
  "RESEARCH_ONLY",
  "WATCH",
  "REVIEW_CANDIDATE",
  "INVESTMENT_CANDIDATE",
  "RISK_REVIEW_REQUIRED",
  "AVOID",
  "INSUFFICIENT_EVIDENCE",
] as const;

/** Immutable provenance classes accepted by research dossiers.  A provider may
 * infer from these classes, but it may never relabel an inference as evidence. */
export const researchProvenanceCategories = [
  "SIMPLY_WALL_ST_PERMITTED_EVIDENCE",
  "SCHWAB_MARKET_OBSERVATION",
  "CAPITAL_OS_CALCULATION",
  "GROK_INFERENCE",
] as const;
export type ResearchProvenanceCategory = (typeof researchProvenanceCategories)[number];

export const analyticalDirections = ["BULLISH", "NEUTRAL", "BEARISH"] as const;
export const proposalDecisions = ["watch", "reject", "request_more_research", "approve_shadow"] as const;

export const floridaSourceHierarchy = [
  "county_tax_collector",
  "property_appraiser",
  "clerk_recorder",
  "state_statute",
  "official_state_guidance",
  "county_gis",
  "government_record",
  "third_party_property",
  "informal",
] as const;
export const liveAvailabilityStates = ["verified_available", "unverified", "unavailable", "redeemed"] as const;
export const reconciliationStates = ["matched", "partial", "unresolved", "conflict", "unknown"] as const;
export const redemptionAssessments = ["high", "moderate", "low", "unknown"] as const;
export const taxLienDecisions = ["WATCH", "REVIEW_REQUIRED", "REJECT"] as const;

export type FloridaSourceKind = (typeof floridaSourceHierarchy)[number];
export type LiveAvailability = (typeof liveAvailabilityStates)[number];
export type ReconciliationState = (typeof reconciliationStates)[number];
export type RedemptionAssessment = (typeof redemptionAssessments)[number];

export function sourcePriorityFor(sourceKind: string | null | undefined): number {
  const normalized = sourceKind?.trim().toLowerCase() as FloridaSourceKind | undefined;
  const index = normalized ? floridaSourceHierarchy.indexOf(normalized) : -1;
  return index === -1 ? floridaSourceHierarchy.length + 1 : index + 1;
}

export function classifyDataFreshness(
  lastVerifiedAt: Date | string | null | undefined,
  now = new Date(),
  staleAfterDays = 30,
): "fresh" | "stale" | "unknown" {
  if (!lastVerifiedAt) return "unknown";
  const verified = lastVerifiedAt instanceof Date ? lastVerifiedAt : new Date(lastVerifiedAt);
  if (Number.isNaN(verified.getTime())) return "unknown";
  const ageMs = now.getTime() - verified.getTime();
  return ageMs <= staleAfterDays * 24 * 60 * 60 * 1000 ? "fresh" : "stale";
}

export type TaxLienReviewInput = {
  currentPurchaseAmountCents: number;
  conservativeValueCents: number;
  totalLienExposureCents: number;
  sourcePriority: number;
  dataFreshness: "fresh" | "stale" | "unknown";
  liveAvailability: LiveAvailability;
  parcelReconciliation: ReconciliationState;
  certificateReconciliation: ReconciliationState;
  stackRisk: "low" | "moderate" | "high" | "unknown";
  redemptionAssessment: RedemptionAssessment;
  access: string;
  buildability: string;
  homesteadStatus: string;
  flood: string;
  wetland: string;
  codeStatus: string;
  titleRisk: string;
  bankruptcyOrLitigation: string;
  opportunityReserveAfterCents: number;
  strategicReserveAfterCents: number;
  positionLimitCents?: number;
  opportunityReserveMinimumCents?: number;
  strategicReserveMinimumCents?: number;
};

export function reviewTaxLienCandidate(input: TaxLienReviewInput) {
  const positionLimitCents = input.positionLimitCents ?? 30_000;
  const opportunityReserveMinimumCents = input.opportunityReserveMinimumCents ?? 50_000;
  const strategicReserveMinimumCents = input.strategicReserveMinimumCents ?? 100_000;
  const hardStops: string[] = [];
  if (input.parcelReconciliation !== "matched") hardStops.push("Parcel cannot be reconciled to an authoritative record.");
  if (input.certificateReconciliation !== "matched") hardStops.push("Certificate cannot be reconciled to an authoritative county record.");
  if (input.liveAvailability !== "verified_available") {
    hardStops.push(
      input.liveAvailability === "redeemed"
        ? "Certificate is recorded as redeemed."
        : "Current live availability is not verified; historical evidence is watch-only.",
    );
  }
  if (input.currentPurchaseAmountCents > positionLimitCents) hardStops.push("Position exceeds the Florida proof-of-process hard cap.");
  if (input.opportunityReserveAfterCents < opportunityReserveMinimumCents) hardStops.push("Opportunity reserve would fall below the required floor.");
  if (input.strategicReserveAfterCents < strategicReserveMinimumCents) hardStops.push("Strategic reserve would fall below the required floor.");
  if (input.access.toLowerCase() === "unresolved" || input.access.toLowerCase() === "landlocked") hardStops.push("Access is unresolved or landlocked.");
  if (input.buildability.toLowerCase() === "non_buildable" || input.buildability.toLowerCase() === "non-buildable") hardStops.push("Parcel is not buildable.");
  if (["material", "high", "unresolved"].includes(input.flood.toLowerCase()) || ["material", "high", "unresolved"].includes(input.wetland.toLowerCase())) {
    hardStops.push("Material flood or wetland risk remains unresolved.");
  }
  if (["unresolved", "active", "high"].includes(input.codeStatus.toLowerCase())) hardStops.push("Code or demolition risk remains unresolved.");
  if (["unresolved", "active", "high"].includes(input.titleRisk.toLowerCase())) hardStops.push("Title risk remains unresolved.");
  if (["unresolved", "active", "high"].includes(input.bankruptcyOrLitigation.toLowerCase())) hardStops.push("Bankruptcy or litigation risk remains unresolved.");
  if (input.homesteadStatus.toLowerCase() === "restricted") hardStops.push("Homestead restrictions cannot be bypassed.");
  if (input.conservativeValueCents <= 0) hardStops.push("Conservative collateral value is unknown.");

  const certToValue = input.conservativeValueCents > 0
    ? input.currentPurchaseAmountCents / input.conservativeValueCents
    : Number.POSITIVE_INFINITY;
  const totalExposureToValue = input.conservativeValueCents > 0
    ? input.totalLienExposureCents / input.conservativeValueCents
    : Number.POSITIVE_INFINITY;
  const scoreParts = [
    input.conservativeValueCents >= 2_000_000 ? 20 : input.conservativeValueCents >= 1_500_000 ? 14 : 5,
    certToValue <= 0.02 ? 15 : certToValue <= 0.05 ? 9 : 2,
    input.redemptionAssessment === "high" ? 15 : input.redemptionAssessment === "moderate" ? 10 : input.redemptionAssessment === "low" ? 4 : 0,
    input.redemptionAssessment === "high" ? 10 : input.redemptionAssessment === "moderate" ? 6 : 2,
    input.stackRisk === "low" ? 10 : input.stackRisk === "moderate" ? 6 : 2,
    ["verified", "clear", "normal"].includes(input.access.toLowerCase()) && ["buildable", "normal", "verified"].includes(input.buildability.toLowerCase()) ? 10 : 3,
    input.homesteadStatus.toLowerCase() === "clear" ? 10 : input.homesteadStatus.toLowerCase() === "pending" ? 5 : 1,
    input.dataFreshness === "fresh" && input.sourcePriority <= 3 ? 5 : input.dataFreshness === "stale" ? 2 : 0,
    input.currentPurchaseAmountCents <= 27_500 ? 5 : input.currentPurchaseAmountCents <= positionLimitCents ? 3 : 0,
  ];
  const score = Math.min(100, scoreParts.reduce((sum, part) => sum + part, 0));
  const intrinsicDisqualifier = input.currentPurchaseAmountCents > positionLimitCents
    || input.opportunityReserveAfterCents < opportunityReserveMinimumCents
    || input.strategicReserveAfterCents < strategicReserveMinimumCents
    || ["unavailable", "redeemed"].includes(input.liveAvailability)
    || input.access.toLowerCase() === "landlocked"
    || ["non_buildable", "non-buildable"].includes(input.buildability.toLowerCase())
    || ["material", "high"].includes(input.flood.toLowerCase())
    || ["material", "high"].includes(input.wetland.toLowerCase())
    || ["active", "high"].includes(input.codeStatus.toLowerCase())
    || ["active", "high"].includes(input.titleRisk.toLowerCase())
    || ["active", "high"].includes(input.bankruptcyOrLitigation.toLowerCase())
    || input.homesteadStatus.toLowerCase() === "restricted";
  const decision = intrinsicDisqualifier
    ? "REJECT"
    : hardStops.length > 0 || input.dataFreshness !== "fresh" || input.redemptionAssessment === "unknown"
      ? "REVIEW_REQUIRED"
      : "WATCH";
  return {
    score,
    decision,
    hardStops,
    certToValue,
    totalExposureToValue,
    redemptionUncertainty: input.redemptionAssessment === "unknown",
    capitalGovernor: {
      positionLimitCents,
      opportunityReserveMinimumCents,
      strategicReserveMinimumCents,
      opportunityReserveAfterCents: input.opportunityReserveAfterCents,
      strategicReserveAfterCents: input.strategicReserveAfterCents,
      passes: input.currentPurchaseAmountCents <= positionLimitCents
        && input.opportunityReserveAfterCents >= opportunityReserveMinimumCents
        && input.strategicReserveAfterCents >= strategicReserveMinimumCents,
    },
    advisoryOnly: true,
    purchaseAuthority: false,
  };
}

export type ResearchOutput = {
  title: string;
  thesis: string;
  label: (typeof familyOfficeLabels)[number];
  analyticalDirection: (typeof analyticalDirections)[number];
  confidence: number;
  facts: string[];
  assumptions: string[];
  risks: string[];
  sections: ResearchAdvisorySections;
  evidence: Array<{
    title: string;
    sourceKind: ResearchProvenanceCategory;
    sourceUrl?: string;
    excerpt: string;
    classification: string;
    freshness: string;
    confidence: number;
  }>;
};

export type ResearchAdvisorySection = {
  content: string[];
  evidenceIds: string[];
  provenance: ResearchProvenanceCategory[];
};

export type ResearchAdvisorySections = {
  fundamentals: ResearchAdvisorySection;
  valuation: ResearchAdvisorySection;
  catalysts: ResearchAdvisorySection;
  risks: ResearchAdvisorySection;
  downsideCase: ResearchAdvisorySection;
  peerContext: ResearchAdvisorySection;
  portfolioFit: ResearchAdvisorySection;
  concentrationLiquidityRisk: ResearchAdvisorySection;
  thesisInvalidationConditions: ResearchAdvisorySection;
  evidenceQuality: ResearchAdvisorySection;
};

export type MultiAgentSynthesis = {
  agreements: string[];
  disagreements: string[];
  evidenceGaps: string[];
  recommendation: (typeof familyOfficeLabels)[number];
  advisoryOnly: true;
  pendingHumanApproval: true;
  agentSummaries: Array<{ agent: string; thesis: string; confidence: number }>;
};

export type PermittedResearchEvidence = {
  title: string;
  sourceUrl?: string;
  excerpt: string;
  permissionConfirmed: true;
};

export type InvestmentDossierInput = {
  ticker: string;
  dossierContext?: string;
  permittedEvidence?: PermittedResearchEvidence[];
};

export function normalizeTicker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ticker = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker) ? ticker : null;
}

export function validateInvestmentDossierInput(value: unknown): InvestmentDossierInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const ticker = normalizeTicker(input.ticker);
  if (!ticker) return null;
  const dossierContext = input.dossierContext === undefined ? undefined : boundedString(input.dossierContext, 2000) ?? undefined;
  if (input.dossierContext !== undefined && !dossierContext) return null;
  if (input.permittedEvidence !== undefined && (!Array.isArray(input.permittedEvidence) || input.permittedEvidence.length > 20)) return null;
  const permittedEvidence = (input.permittedEvidence ?? []).map((item) => {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const title = boundedString(row.title, 180);
    const excerpt = boundedString(row.excerpt, 3000);
    const sourceUrl = row.sourceUrl === undefined ? undefined : boundedString(row.sourceUrl, 2000);
    if (!title || !excerpt || row.permissionConfirmed !== true || (row.sourceUrl !== undefined && !sourceUrl)) return null;
    if (sourceUrl) try { new URL(sourceUrl); } catch { return null; }
    return { title, excerpt, ...(sourceUrl ? { sourceUrl } : {}), permissionConfirmed: true as const };
  });
  return permittedEvidence.every(Boolean) ? { ticker, dossierContext, permittedEvidence: permittedEvidence as PermittedResearchEvidence[] } : null;
}

export function capitalOsDossierContext() {
  return {
    firstDuplexReserveExcluded: true,
    protectedHouseholdCapitalExcluded: true,
    deployableAuthority: false,
    note: "Capital OS calculations are advisory context only; no deployable authority exists.",
  } as const;
}

const sectionNames = [
  "fundamentals", "valuation", "catalysts", "risks", "downsideCase",
  "peerContext", "portfolioFit", "concentrationLiquidityRisk",
  "thesisInvalidationConditions", "evidenceQuality",
] as const;

function parseSection(value: unknown): ResearchAdvisorySection | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const content = boundedStringArray(record.content, 20, 1000);
  const evidenceIds = boundedStringArray(record.evidenceIds, 30, 100);
  const provenance = Array.isArray(record.provenance) && record.provenance.every((item) =>
    researchProvenanceCategories.includes(item as ResearchProvenanceCategory),
  ) ? record.provenance as ResearchProvenanceCategory[] : null;
  return content && evidenceIds && provenance ? { content, evidenceIds, provenance } : null;
}

/** Deterministic, advisory-only reduction of independent analyst outputs. */
export function synthesizeResearch(outputs: readonly ResearchOutput[]): MultiAgentSynthesis {
  const agreements = outputs.length
    ? [...new Set(outputs.flatMap((output) => output.facts))].slice(0, 20)
    : [];
  const directions = new Set(outputs.map((output) => output.analyticalDirection));
  const disagreements = directions.size > 1
    ? [`Analysts disagree on direction: ${[...directions].join(", ")}.`]
    : [];
  const evidenceGaps = outputs.length
    ? [...new Set(outputs.flatMap((output) => output.sections.evidenceQuality.content))].slice(0, 20)
    : ["No analyst evidence was available."];
  const recommendation = outputs.length
    ? outputs.reduce((least, output) => output.confidence < least.confidence ? output : least).label
    : "INSUFFICIENT_EVIDENCE";
  return {
    agreements, disagreements, evidenceGaps, recommendation, advisoryOnly: true, pendingHumanApproval: true,
    agentSummaries: outputs.map((output, index) => ({
      agent: ["fundamentals-valuation", "risk-downside", "portfolio-cio"][index] ?? `agent-${index + 1}`,
      thesis: output.thesis, confidence: output.confidence,
    })),
  };
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

function boundedStringArray(value: unknown, maxLength: number, maxItemLength: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxLength) return null;
  const items = value.map((item) => boundedString(item, maxItemLength));
  return items.every((item): item is string => Boolean(item)) ? items : null;
}

function parseResearchOutput(value: unknown): ResearchOutput | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = boundedString(record.title, 180);
  const thesis = boundedString(record.thesis, 4000);
  const label = familyOfficeLabels.includes(record.label as (typeof familyOfficeLabels)[number]) ? record.label as ResearchOutput["label"] : null;
  const analyticalDirection = analyticalDirections.includes(record.analyticalDirection as (typeof analyticalDirections)[number])
    ? record.analyticalDirection as ResearchOutput["analyticalDirection"]
    : null;
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 100
    ? record.confidence
    : null;
  const facts = boundedStringArray(record.facts, 20, 1000);
  const assumptions = boundedStringArray(record.assumptions, 20, 1000);
  const risks = boundedStringArray(record.risks, 20, 1000);
  if (!title || !thesis || !label || !analyticalDirection || confidence === null || !facts || !assumptions || !risks) return null;
  const sections = sectionNames.reduce((result, name) => {
    const parsed = parseSection((record.sections as Record<string, unknown> | undefined)?.[name]);
    if (parsed) result[name] = parsed;
    return result;
  }, {} as Partial<ResearchAdvisorySections>);
  // Older provider responses are upgraded to explicit, traceable sections.
  for (const name of sectionNames) {
    sections[name] ??= { content: name === "risks" ? risks : [], evidenceIds: [], provenance: [] };
  }
  if (!Array.isArray(record.evidence) || record.evidence.length > 20) return null;
  const evidence = record.evidence.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const itemTitle = boundedString(item.title, 180);
    const excerpt = boundedString(item.excerpt, 1500);
    const sourceKind = researchProvenanceCategories.includes(item.sourceKind as ResearchProvenanceCategory)
      ? item.sourceKind as ResearchProvenanceCategory
      : null;
    const classification = boundedString(item.classification ?? "unverified", 80);
    const freshness = boundedString(item.freshness ?? "unknown", 80);
    const itemConfidence = typeof item.confidence === "number" && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 100 ? item.confidence : 0;
    const sourceUrl = item.sourceUrl === undefined ? undefined : boundedString(item.sourceUrl, 2000);
    if (!itemTitle || !excerpt || !sourceKind || !classification || !freshness || (item.sourceUrl !== undefined && !sourceUrl)) return null;
    if (sourceUrl) {
      try { new URL(sourceUrl); } catch { return null; }
    }
    return { title: itemTitle, sourceKind, sourceUrl: sourceUrl ?? undefined, excerpt, classification, freshness, confidence: itemConfidence };
  });
  if (!evidence.every((item): item is NonNullable<typeof item> => Boolean(item))) return null;
  return { title, thesis, label, analyticalDirection, confidence, facts, assumptions, risks, sections: sections as ResearchAdvisorySections, evidence };
}

export const researchOutputSchema = {
  safeParse(value: unknown): { success: true; data: ResearchOutput } | { success: false } {
    const data = parseResearchOutput(value);
    return data ? { success: true, data } : { success: false };
  },
};

export type FamilyOfficeProviderStatus = {
  enabled: boolean;
  state: "disabled" | "configured";
  model: string;
};

export function familyOfficeProviderStatus(env: NodeJS.ProcessEnv = process.env): FamilyOfficeProviderStatus {
  const model = env.XAI_MODEL?.trim() || "grok-configured-model";
  return {
    enabled: env.GROK_INTELLIGENCE_ENABLED === "true" && Boolean(env.XAI_ENABLED === "true" && env.XAI_API_KEY),
    state: env.GROK_INTELLIGENCE_ENABLED === "true" && env.XAI_ENABLED === "true" && Boolean(env.XAI_API_KEY) ? "configured" : "disabled",
    model,
  };
}

export function safeResearchPrompt(prompt: string): string {
  return prompt.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
}

export function assertShadowOnlyDecision(decision: string) {
  if (!proposalDecisions.includes(decision as (typeof proposalDecisions)[number])) {
    throw new Error("Unsupported Family Office decision");
  }
  if (decision === "approve_shadow") return "shadow_approved" as const;
  if (decision === "reject") return "rejected" as const;
  if (decision === "watch") return "watching" as const;
  return "research_requested" as const;
}

export function shadowGuardrails() {
  return [
    "Shadow portfolios are hypothetical and never authoritative household assets.",
    "Shadow intents never create OMS, brokerage, ledger, Treasury, or Micro-Live records.",
    "Grok cannot move money, submit orders, unlock reserves, change policy, or override controls.",
    "Provider failure is reported as unavailable; no research is fabricated.",
  ];
}