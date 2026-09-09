import {
  familyOfficeProviderStatus,
  researchOutputSchema,
  safeResearchPrompt,
  type FamilyOfficeProviderStatus,
  type ResearchOutput,
} from "../domain/family-office";

export type IntelligenceProvider = {
  research(input: { analyst: string; scope: string; prompt: string }): Promise<ResearchOutput>;
};

export type ProviderFailureCode =
  | "AI_PROVIDER_DISABLED"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_AUTHENTICATION_FAILED"
  | "AI_PROVIDER_MODEL_UNAVAILABLE"
  | "AI_PROVIDER_RATE_LIMITED"
  | "AI_PROVIDER_UPSTREAM_ERROR"
  | "AI_PROVIDER_INVALID_RESPONSE";

export function safeProviderModel(model: string) {
  const normalized = model.trim();
  return /^[A-Za-z0-9._:/-]{1,120}$/.test(normalized) ? normalized : "unrecognized-model";
}

export class ProviderUnavailableError extends Error {
  constructor(public readonly code: ProviderFailureCode = "AI_PROVIDER_UPSTREAM_ERROR") {
    super("Family Office intelligence provider is unavailable");
    this.name = "ProviderUnavailableError";
  }
}

const researchResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "thesis",
    "label",
    "analyticalDirection",
    "confidence",
    "facts",
    "assumptions",
    "risks",
    "evidence",
  ],
  properties: {
    title: { type: "string" },
    thesis: { type: "string" },
    label: {
      type: "string",
      enum: [
        "RESEARCH_ONLY",
        "WATCH",
        "REVIEW_CANDIDATE",
        "INVESTMENT_CANDIDATE",
        "RISK_REVIEW_REQUIRED",
        "AVOID",
        "INSUFFICIENT_EVIDENCE",
      ],
    },
    analyticalDirection: {
      type: "string",
      enum: ["BULLISH", "NEUTRAL", "BEARISH"],
    },
    confidence: { type: "number", minimum: 0, maximum: 100 },
    facts: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    assumptions: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    risks: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    evidence: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "sourceKind",
          "excerpt",
          "classification",
          "freshness",
          "confidence",
        ],
        properties: {
          title: { type: "string" },
          sourceKind: {
            type: "string",
            enum: [
              "SIMPLY_WALL_ST_PERMITTED_EVIDENCE",
              "UPLOADED_LICENSED_RESEARCH",
              "PRIMARY_SOURCE",
              "SCHWAB_MARKET_OBSERVATION",
              "CAPITAL_OS_CALCULATION",
              "GROK_INFERENCE",
            ],
          },
          sourceUrl: { type: "string" },
          excerpt: { type: "string" },
          classification: { type: "string" },
          freshness: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 100 },
        },
      },
    },
    sections: {
      type: "object",
      additionalProperties: true,
      description: "Source-attributed advisory sections; each entry contains content, evidenceIds, and provenance.",
    },
  },
} as const;

function extractContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

export class XaiIntelligenceProvider implements IntelligenceProvider {
  public readonly status: FamilyOfficeProviderStatus;

  constructor(
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.status = familyOfficeProviderStatus(env);
  }

  async research(input: { analyst: string; scope: string; prompt: string }): Promise<ResearchOutput> {
    if (!this.status.enabled) throw new ProviderUnavailableError("AI_PROVIDER_DISABLED");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await this.fetcher(
        this.env.XAI_API_URL?.trim() || "https://api.x.ai/v1/chat/completions",
        {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.status.model,
          temperature: 0.1,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "capital_os_research",
              strict: true,
              schema: researchResponseJsonSchema,
            },
          },
          messages: [
            {
              role: "system",
               content: "You are a subordinate Capital OS research analyst. Return only the requested structured research object. Research is advisory and shadow-only. Never provide broker instructions, execution authorization, money movement, credentials, or policy overrides. Simply Wall St is never fetched or scraped: use only user-provided permitted evidence or links. Preserve provenance exactly as one of SIMPLY_WALL_ST_PERMITTED_EVIDENCE, UPLOADED_LICENSED_RESEARCH, PRIMARY_SOURCE, SCHWAB_MARKET_OBSERVATION, CAPITAL_OS_CALCULATION, or GROK_INFERENCE. When the source packet provides a REVIEWED:<id> reference, cite that exact reference in section evidenceIds rather than citing every source in its class. Distinguish facts from assumptions and include uncertainty.",
            },
            {
              role: "user",
              content: `Analyst: ${safeResearchPrompt(input.analyst)}. Scope: ${safeResearchPrompt(input.scope)}. Research request: ${safeResearchPrompt(input.prompt)}`,
            },
          ],
        }),
        },
      );
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ProviderUnavailableError("AI_PROVIDER_AUTHENTICATION_FAILED");
        }
        if (response.status === 404) {
          throw new ProviderUnavailableError("AI_PROVIDER_MODEL_UNAVAILABLE");
        }
        if (response.status === 429) {
          throw new ProviderUnavailableError("AI_PROVIDER_RATE_LIMITED");
        }
        throw new ProviderUnavailableError("AI_PROVIDER_UPSTREAM_ERROR");
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ProviderUnavailableError("AI_PROVIDER_INVALID_RESPONSE");
      }
      const content = extractContent(payload);
      if (!content) throw new ProviderUnavailableError("AI_PROVIDER_INVALID_RESPONSE");
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new ProviderUnavailableError("AI_PROVIDER_INVALID_RESPONSE");
      }
      const result = researchOutputSchema.safeParse(parsed);
      if (!result.success) throw new ProviderUnavailableError("AI_PROVIDER_INVALID_RESPONSE");
      return result.data;
    } catch (error) {
      if (error instanceof ProviderUnavailableError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderUnavailableError("AI_PROVIDER_TIMEOUT");
      }
      throw new ProviderUnavailableError("AI_PROVIDER_UPSTREAM_ERROR");
    } finally {
      clearTimeout(timeout);
    }
  }
}