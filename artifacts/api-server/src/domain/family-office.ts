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
  "UPLOADED_LICENSED_RESEARCH",
  "PRIMARY_SOURCE",
  "SERVER_FETCHED_PUBLIC_RESEARCH",
  "PUBLIC_WEB_RETRIEVAL",
  "SCHWAB_MARKET_OBSERVATION",
  "CAPITAL_OS_CALCULATION",
  "STRUCTURED_RESEARCH_DIGESTION",
  "USER_SUPPLIED_INFERENCE",
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

export function sanitizeProviderEvidence(output: ResearchOutput): ResearchOutput {
  return { ...output, evidence: output.evidence.map((item) => ({ ...item, sourceKind: "GROK_INFERENCE" })) };
}

export function remapAdvisorySections(
  sections: ResearchAdvisorySections,
  idsByProvenance: Partial<Record<ResearchProvenanceCategory, string[]>>,
  exactReferenceIds: Readonly<Record<string, string>> = {},
  exactReferenceProvenance: Readonly<Record<string, ResearchProvenanceCategory>> = {},
): ResearchAdvisorySections {
  let unresolved = 0;
  const mapped = Object.fromEntries(Object.entries(sections).map(([key, section]) => {
    const exactRequested = section.evidenceIds.filter((id) => id.startsWith("STRUCTURED:") || id.startsWith("INFERENCE:") || id.startsWith("REVIEWED:"));
    const exactIds = exactRequested.map((id) => exactReferenceIds[id]).filter((id): id is string => Boolean(id));
    unresolved += exactRequested.length - exactIds.length;
    const provenance = section.provenance.filter((category) => {
      if (category === "STRUCTURED_RESEARCH_DIGESTION") return exactRequested.some((id) => id.startsWith("STRUCTURED:") && Boolean(exactReferenceIds[id]));
      if (category === "USER_SUPPLIED_INFERENCE") return exactRequested.some((id) => id.startsWith("INFERENCE:") && Boolean(exactReferenceIds[id]));
      if (category === "UPLOADED_LICENSED_RESEARCH" || category === "PRIMARY_SOURCE") {
        return exactRequested.some((id) => exactReferenceProvenance[id] === category && Boolean(exactReferenceIds[id]));
      }
      return (idsByProvenance[category] ?? []).length > 0;
    });
    const categoryIds = provenance
      .filter((category) => !["STRUCTURED_RESEARCH_DIGESTION", "USER_SUPPLIED_INFERENCE", "UPLOADED_LICENSED_RESEARCH", "PRIMARY_SOURCE"].includes(category))
      .flatMap((category) => idsByProvenance[category] ?? []);
    return [key, { ...section, provenance, evidenceIds: [...new Set([...exactIds, ...categoryIds])].slice(0, 20) }];
  })) as ResearchAdvisorySections;
  if (unresolved > 0) mapped.evidenceQuality = {
    ...mapped.evidenceQuality,
    content: [...mapped.evidenceQuality.content, `${unresolved} structured evidence reference(s) were unresolved and removed.`].slice(0, 20),
  };
  return mapped;
}

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
  ticker?: string;
  url?: string;
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
  const url = typeof input.url === "string" && input.url.trim().length <= 2000 ? input.url.trim() : undefined;
  if (!ticker && !url) return null;
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
  return permittedEvidence.every(Boolean) ? { ticker: ticker ?? undefined, url, dossierContext, permittedEvidence: permittedEvidence as PermittedResearchEvidence[] } : null;
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

export type ResearchOutputValidationIssue = {
  path: string;
  code: "required" | "invalid_type" | "invalid_enum" | "out_of_range" | "max_items" | "max_length" | "invalid_url";
  expected: string;
};

export const researchOutputConstraints = {
  titleMaxLength: 180,
  thesisMaxLength: 4000,
  listMaxItems: 20,
  listItemMaxLength: 1000,
  evidenceTitleMaxLength: 180,
  evidenceExcerptMaxLength: 1500,
  evidenceClassificationMaxLength: 80,
  evidenceFreshnessMaxLength: 80,
  evidenceSourceUrlMaxLength: 2000,
} as const;

export const researchEvidenceClassifications = [
  "source_fact",
  "analyst_inference",
  "unverified_claim",
  "reviewed_evidence",
  "provider_observation",
] as const;

function invalid(path: string, code: ResearchOutputValidationIssue["code"], expected: string) {
  return { success: false as const, issues: [{ path, code, expected }] };
}

function parseResearchOutput(value: unknown): { success: true; data: ResearchOutput } | { success: false; issues: ResearchOutputValidationIssue[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("$", "invalid_type", "object");
  const record = value as Record<string, unknown>;
  if (record.title === undefined) return invalid("$.title", "required", `non-empty string up to ${researchOutputConstraints.titleMaxLength} characters`);
  if (typeof record.title !== "string") return invalid("$.title", "invalid_type", "string");
  const title = boundedString(record.title, researchOutputConstraints.titleMaxLength);
  if (!title) return invalid("$.title", "max_length", `non-empty string up to ${researchOutputConstraints.titleMaxLength} characters`);
  if (record.thesis === undefined) return invalid("$.thesis", "required", `non-empty string up to ${researchOutputConstraints.thesisMaxLength} characters`);
  if (typeof record.thesis !== "string") return invalid("$.thesis", "invalid_type", "string");
  const thesis = boundedString(record.thesis, researchOutputConstraints.thesisMaxLength);
  if (!thesis) return invalid("$.thesis", "max_length", `non-empty string up to ${researchOutputConstraints.thesisMaxLength} characters`);
  const label = familyOfficeLabels.includes(record.label as (typeof familyOfficeLabels)[number]) ? record.label as ResearchOutput["label"] : null;
  if (!label) return invalid("$.label", record.label === undefined ? "required" : "invalid_enum", "approved research label");
  const analyticalDirection = analyticalDirections.includes(record.analyticalDirection as (typeof analyticalDirections)[number])
    ? record.analyticalDirection as ResearchOutput["analyticalDirection"]
    : null;
  if (!analyticalDirection) return invalid("$.analyticalDirection", record.analyticalDirection === undefined ? "required" : "invalid_enum", "BULLISH, NEUTRAL, or BEARISH");
  const confidence = typeof record.confidence === "number" && Number.isFinite(record.confidence) && record.confidence >= 0 && record.confidence <= 100
    ? record.confidence
    : null;
  if (confidence === null) return invalid("$.confidence", typeof record.confidence === "number" ? "out_of_range" : record.confidence === undefined ? "required" : "invalid_type", "finite number from 0 through 100");
  const parseList = (key: "facts" | "assumptions" | "risks") => {
    const value = record[key];
    if (value === undefined) return invalid(`$.${key}`, "required", `array of up to ${researchOutputConstraints.listMaxItems} strings`);
    if (!Array.isArray(value)) return invalid(`$.${key}`, "invalid_type", "array");
    if (value.length > researchOutputConstraints.listMaxItems) return invalid(`$.${key}`, "max_items", `at most ${researchOutputConstraints.listMaxItems} items`);
    for (let index = 0; index < value.length; index++) {
      if (typeof value[index] !== "string") return invalid(`$.${key}[${index}]`, "invalid_type", "string");
      if (!boundedString(value[index], researchOutputConstraints.listItemMaxLength)) {
        return invalid(`$.${key}[${index}]`, "max_length", `non-empty string up to ${researchOutputConstraints.listItemMaxLength} characters`);
      }
    }
    return { success: true as const, data: value.map((item) => String(item).trim()) };
  };
  const factsResult = parseList("facts");
  if (!factsResult.success) return factsResult;
  const assumptionsResult = parseList("assumptions");
  if (!assumptionsResult.success) return assumptionsResult;
  const risksResult = parseList("risks");
  if (!risksResult.success) return risksResult;
  const facts = factsResult.data;
  const assumptions = assumptionsResult.data;
  const risks = risksResult.data;
  const sections = sectionNames.reduce((result, name) => {
    const parsed = parseSection((record.sections as Record<string, unknown> | undefined)?.[name]);
    if (parsed) result[name] = parsed;
    return result;
  }, {} as Partial<ResearchAdvisorySections>);
  // Older provider responses are upgraded to explicit, traceable sections.
  for (const name of sectionNames) {
    sections[name] ??= { content: name === "risks" ? risks : [], evidenceIds: [], provenance: [] };
  }
  if (!Array.isArray(record.evidence)) return invalid("$.evidence", record.evidence === undefined ? "required" : "invalid_type", "array");
  if (record.evidence.length > researchOutputConstraints.listMaxItems) return invalid("$.evidence", "max_items", `at most ${researchOutputConstraints.listMaxItems} items`);
  const evidence: ResearchOutput["evidence"] = [];
  for (let index = 0; index < record.evidence.length; index++) {
    const raw = record.evidence[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid(`$.evidence[${index}]`, "invalid_type", "object");
    const item = raw as Record<string, unknown>;
    if (typeof item.title !== "string") return invalid(`$.evidence[${index}].title`, item.title === undefined ? "required" : "invalid_type", "string");
    const itemTitle = boundedString(item.title, researchOutputConstraints.evidenceTitleMaxLength);
    if (!itemTitle) return invalid(`$.evidence[${index}].title`, "max_length", `non-empty string up to ${researchOutputConstraints.evidenceTitleMaxLength} characters`);
    if (typeof item.excerpt !== "string") return invalid(`$.evidence[${index}].excerpt`, item.excerpt === undefined ? "required" : "invalid_type", "string");
    const excerpt = boundedString(item.excerpt, researchOutputConstraints.evidenceExcerptMaxLength);
    if (!excerpt) return invalid(`$.evidence[${index}].excerpt`, "max_length", `non-empty string up to ${researchOutputConstraints.evidenceExcerptMaxLength} characters`);
    const sourceKind = researchProvenanceCategories.includes(item.sourceKind as ResearchProvenanceCategory)
      ? item.sourceKind as ResearchProvenanceCategory
      : null;
    if (!sourceKind) return invalid(`$.evidence[${index}].sourceKind`, item.sourceKind === undefined ? "required" : "invalid_enum", "approved provenance category");
    if (typeof item.classification !== "string") return invalid(`$.evidence[${index}].classification`, item.classification === undefined ? "required" : "invalid_type", "string");
    const classification = boundedString(item.classification, researchOutputConstraints.evidenceClassificationMaxLength);
    if (!classification) return invalid(`$.evidence[${index}].classification`, "max_length", `non-empty string up to ${researchOutputConstraints.evidenceClassificationMaxLength} characters`);
    if (!researchEvidenceClassifications.includes(classification as (typeof researchEvidenceClassifications)[number])) {
      return invalid(`$.evidence[${index}].classification`, "invalid_enum", `one of ${researchEvidenceClassifications.join(", ")}`);
    }
    if (typeof item.freshness !== "string") return invalid(`$.evidence[${index}].freshness`, item.freshness === undefined ? "required" : "invalid_type", "string");
    const freshness = boundedString(item.freshness, researchOutputConstraints.evidenceFreshnessMaxLength);
    if (!freshness) return invalid(`$.evidence[${index}].freshness`, "max_length", `non-empty string up to ${researchOutputConstraints.evidenceFreshnessMaxLength} characters`);
    const itemConfidence = typeof item.confidence === "number" && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 100 ? item.confidence : 0;
    if (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 100) {
      return invalid(`$.evidence[${index}].confidence`, typeof item.confidence === "number" ? "out_of_range" : item.confidence === undefined ? "required" : "invalid_type", "finite number from 0 through 100");
    }
    const sourceUrl = item.sourceUrl === undefined ? undefined : boundedString(item.sourceUrl, researchOutputConstraints.evidenceSourceUrlMaxLength);
    if (item.sourceUrl !== undefined && typeof item.sourceUrl !== "string") return invalid(`$.evidence[${index}].sourceUrl`, "invalid_type", "URL string");
    if (item.sourceUrl !== undefined && !sourceUrl) return invalid(`$.evidence[${index}].sourceUrl`, "max_length", `valid URL up to ${researchOutputConstraints.evidenceSourceUrlMaxLength} characters`);
    if (sourceUrl) {
      try { new URL(sourceUrl); } catch { return invalid(`$.evidence[${index}].sourceUrl`, "invalid_url", `valid URL up to ${researchOutputConstraints.evidenceSourceUrlMaxLength} characters`); }
    }
    evidence.push({ title: itemTitle, sourceKind, sourceUrl: sourceUrl ?? undefined, excerpt, classification, freshness, confidence: itemConfidence });
  }
  return { success: true, data: { title, thesis, label, analyticalDirection, confidence, facts, assumptions, risks, sections: sections as ResearchAdvisorySections, evidence } };
}

export const researchOutputSchema = {
  safeParse(value: unknown): { success: true; data: ResearchOutput } | { success: false; issues: ResearchOutputValidationIssue[] } {
    return parseResearchOutput(value);
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