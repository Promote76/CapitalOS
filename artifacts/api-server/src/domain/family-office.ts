export const familyOfficeLabels = [
  "RESEARCH_ONLY",
  "WATCH",
  "REVIEW_CANDIDATE",
  "INVESTMENT_CANDIDATE",
  "RISK_REVIEW_REQUIRED",
  "AVOID",
  "INSUFFICIENT_EVIDENCE",
] as const;

export const analyticalDirections = ["BULLISH", "NEUTRAL", "BEARISH"] as const;
export const proposalDecisions = ["watch", "reject", "request_more_research", "approve_shadow"] as const;

export type ResearchOutput = {
  title: string;
  thesis: string;
  label: (typeof familyOfficeLabels)[number];
  analyticalDirection: (typeof analyticalDirections)[number];
  confidence: number;
  facts: string[];
  assumptions: string[];
  risks: string[];
  evidence: Array<{
    title: string;
    sourceKind: string;
    sourceUrl?: string;
    excerpt: string;
    classification: string;
    freshness: string;
    confidence: number;
  }>;
};

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
  if (!Array.isArray(record.evidence) || record.evidence.length > 20) return null;
  const evidence = record.evidence.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const itemTitle = boundedString(item.title, 180);
    const excerpt = boundedString(item.excerpt, 1500);
    const sourceKind = boundedString(item.sourceKind ?? "unverified", 80);
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
  return { title, thesis, label, analyticalDirection, confidence, facts, assumptions, risks, evidence };
}

export const researchOutputSchema = {
  safeParse(value: unknown): { success: true; data: ResearchOutput } | { success: false } {
    const data = parseResearchOutput(value);
    return data ? { success: true, data } : { success: false };
  },
};

export type FamilyOfficeProviderStatus = {
  enabled: boolean;
  state: "disabled" | "ready";
  model: string;
};

export function familyOfficeProviderStatus(env: NodeJS.ProcessEnv = process.env): FamilyOfficeProviderStatus {
  const model = env.XAI_MODEL?.trim() || "grok-configured-model";
  return {
    enabled: env.GROK_INTELLIGENCE_ENABLED === "true" && Boolean(env.XAI_ENABLED === "true" && env.XAI_API_KEY),
    state: env.GROK_INTELLIGENCE_ENABLED === "true" && env.XAI_ENABLED === "true" && Boolean(env.XAI_API_KEY) ? "ready" : "disabled",
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