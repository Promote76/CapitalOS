import assert from "node:assert/strict";
import test from "node:test";
import { ProviderUnavailableError, researchResponseJsonSchema, safeProviderModel, XaiIntelligenceProvider } from "../services/family-office-provider.ts";
import {
  assertShadowOnlyDecision,
  familyOfficeProviderStatus,
  researchOutputConstraints,
  reviewTaxLienCandidate,
  safeResearchPrompt,
  sourcePriorityFor,
} from "./family-office.ts";

test("Family Office provider is disabled unless both feature flags and a key are present", () => {
  assert.equal(familyOfficeProviderStatus({}).state, "disabled");
  assert.equal(familyOfficeProviderStatus({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
  }).enabled, false);
  assert.equal(familyOfficeProviderStatus({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  }).state, "configured");
});

test("disabled provider fails closed without making a network request", async () => {
  let called = false;
  const provider = new XaiIntelligenceProvider({}, async () => {
    called = true;
    return new Response("{}");
  });
  await assert.rejects(
    provider.research({ analyst: "CIO", scope: "research", prompt: "test" }),
    (error: unknown) => error instanceof ProviderUnavailableError && error.code === "AI_PROVIDER_DISABLED",
  );
  assert.equal(called, false);
});

test("saved provider provenance only retains a bounded model identifier", () => {
  assert.equal(safeProviderModel("grok-4-1-fast"), "grok-4-1-fast");
  assert.equal(safeProviderModel("Bearer secret-value"), "unrecognized-model");
  assert.equal(safeProviderModel("x".repeat(121)), "unrecognized-model");
});

test("provider rejects malformed output and sanitizes control characters in prompts", async () => {
  let requestBody = "";
  const provider = new XaiIntelligenceProvider({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  }, async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ title: "missing required fields" }) } }],
    }), { status: 200 });
  });
  await assert.rejects(provider.research({
    analyst: "CIO\u0000 analyst",
    scope: "market\u0007 scope",
    prompt: "question\u001b[31m",
  }), ProviderUnavailableError);
  const parsedBody = JSON.parse(requestBody) as {
    response_format?: {
      type?: string;
      json_schema?: {
        name?: string;
        strict?: boolean;
        schema?: { required?: string[] };
      };
    };
  };
  assert.equal(parsedBody.response_format?.type, "json_schema");
  assert.equal(parsedBody.response_format?.json_schema?.name, "capital_os_research");
  assert.equal(parsedBody.response_format?.json_schema?.strict, true);
  assert.deepEqual(parsedBody.response_format?.json_schema?.schema?.required, [
    "title",
    "thesis",
    "label",
    "analyticalDirection",
    "confidence",
    "facts",
    "assumptions",
    "risks",
    "evidence",
  ]);
  assert.equal(requestBody.includes("\u0000"), false);
  assert.equal(requestBody.includes("\u0007"), false);
  assert.equal(requestBody.includes("\u001b"), false);
});

test("provider-facing response bounds match the application parser", () => {
  const properties = researchResponseJsonSchema.properties;
  assert.equal(properties.title.maxLength, researchOutputConstraints.titleMaxLength);
  assert.equal(properties.thesis.maxLength, researchOutputConstraints.thesisMaxLength);
  for (const key of ["facts", "assumptions", "risks"] as const) {
    assert.equal(properties[key].maxItems, researchOutputConstraints.listMaxItems);
    assert.equal(properties[key].items.maxLength, researchOutputConstraints.listItemMaxLength);
  }
  const evidence = properties.evidence;
  assert.equal(evidence.maxItems, researchOutputConstraints.listMaxItems);
  assert.equal(evidence.items.properties.title.maxLength, researchOutputConstraints.evidenceTitleMaxLength);
  assert.equal(evidence.items.properties.excerpt.maxLength, researchOutputConstraints.evidenceExcerptMaxLength);
  assert.equal(evidence.items.properties.classification.maxLength, researchOutputConstraints.evidenceClassificationMaxLength);
  assert.equal(evidence.items.properties.freshness.maxLength, researchOutputConstraints.evidenceFreshnessMaxLength);
  assert.equal(evidence.items.properties.sourceUrl.maxLength, researchOutputConstraints.evidenceSourceUrlMaxLength);
  assert.equal(evidence.items.properties.sourceUrl.format, "uri");
});

test("provider classifies rate limits and invalid structured output without exposing payloads", async () => {
  const env = {
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  };
  const rateLimited = new XaiIntelligenceProvider(env, async () => new Response("limited", { status: 429 }));
  await assert.rejects(
    rateLimited.research({ analyst: "CIO", scope: "research", prompt: "test" }),
    (error: unknown) => error instanceof ProviderUnavailableError && error.code === "AI_PROVIDER_RATE_LIMITED",
  );
  const invalid = new XaiIntelligenceProvider(env, async () => new Response(JSON.stringify({
    choices: [{ message: { content: "{}" } }],
  }), { status: 200 }));
  await assert.rejects(
    invalid.research({ analyst: "CIO", scope: "research", prompt: "test" }),
    (error: unknown) => error instanceof ProviderUnavailableError
      && error.code === "AI_PROVIDER_INVALID_RESPONSE"
      && error.diagnostic?.analyst === "CIO"
      && error.diagnostic.stage === "schema_mismatch"
      && error.diagnostic.path === "$.title"
      && error.diagnostic.code === "required"
      && !JSON.stringify(error.diagnostic).includes("{}"),
  );
});

test("provider diagnostics classify envelope, content, and JSON failures without retaining payloads", async () => {
  const env = { GROK_INTELLIGENCE_ENABLED: "true", XAI_ENABLED: "true", XAI_API_KEY: "server-only" };
  const cases = [
    ["invalid_api_envelope", new Response("private raw body", { status: 200 })],
    ["missing_text_content", new Response(JSON.stringify({ choices: [{ message: {} }], private: "payload" }), { status: 200 })],
    ["non_json_content", new Response(JSON.stringify({ choices: [{ message: { content: "private non-json content" } }] }), { status: 200 })],
  ] as const;
  for (const [stage, response] of cases) {
    const provider = new XaiIntelligenceProvider(env, async () => response);
    await assert.rejects(
      provider.research({ analyst: "risk-downside", scope: "research", prompt: "private prompt" }),
      (error: unknown) => error instanceof ProviderUnavailableError
        && error.diagnostic?.stage === stage
        && error.diagnostic.analyst === "risk-downside"
        && !JSON.stringify(error.diagnostic).includes("private"),
    );
  }
});

test("provider classifies aborted requests as timeouts", async () => {
  const provider = new XaiIntelligenceProvider({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  }, async () => {
    throw new DOMException("The operation was aborted", "AbortError");
  });
  await assert.rejects(
    provider.research({ analyst: "CIO", scope: "research", prompt: "test" }),
    (error: unknown) => error instanceof ProviderUnavailableError && error.code === "AI_PROVIDER_TIMEOUT",
  );
});

test("Shadow decisions have no execution decision and unsupported decisions fail", () => {
  assert.equal(assertShadowOnlyDecision("approve_shadow"), "shadow_approved");
  assert.equal(assertShadowOnlyDecision("watch"), "watching");
  assert.throws(() => assertShadowOnlyDecision("submit_order"));
  assert.equal(safeResearchPrompt("  hello\nworld  "), "hello world");
});

test("Florida source hierarchy gives official county records priority over informal sources", () => {
  assert.equal(sourcePriorityFor("county_tax_collector"), 1);
  assert.equal(sourcePriorityFor("property_appraiser"), 2);
  assert.equal(sourcePriorityFor("informal"), 9);
  assert.equal(sourcePriorityFor(undefined), 10);
});

test("tax-lien review rejects unknown availability, reconciliation gaps, and reserve violations", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 31_000,
    conservativeValueCents: 2_000_000,
    totalLienExposureCents: 31_000,
    sourcePriority: 1,
    dataFreshness: "fresh",
    liveAvailability: "unverified",
    parcelReconciliation: "partial",
    certificateReconciliation: "partial",
    stackRisk: "low",
    redemptionAssessment: "high",
    access: "verified",
    buildability: "buildable",
    homesteadStatus: "clear",
    flood: "clear",
    wetland: "clear",
    codeStatus: "clear",
    titleRisk: "clear",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 90_000,
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.capitalGovernor.passes, false);
  assert.ok(result.hardStops.some((stop) => stop.includes("live availability")));
  assert.ok(result.hardStops.some((stop) => stop.includes("Parcel")));
  assert.ok(result.hardStops.some((stop) => stop.includes("Certificate")));
  assert.ok(result.hardStops.some((stop) => stop.includes("reserve")));
  assert.equal(result.purchaseAuthority, false);
});

test("tax-lien review keeps a fully verified certificate advisory and human-reviewed", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 23_552,
    conservativeValueCents: 2_909_700,
    totalLienExposureCents: 23_552,
    sourcePriority: 1,
    dataFreshness: "fresh",
    liveAvailability: "verified_available",
    parcelReconciliation: "matched",
    certificateReconciliation: "matched",
    stackRisk: "low",
    redemptionAssessment: "high",
    access: "verified",
    buildability: "buildable",
    homesteadStatus: "clear",
    flood: "clear",
    wetland: "clear",
    codeStatus: "clear",
    titleRisk: "clear",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 100_000,
  });
  assert.equal(result.decision, "WATCH");
  assert.equal(result.redemptionUncertainty, false);
  assert.equal(result.capitalGovernor.passes, true);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.purchaseAuthority, false);
});

test("historical certificates remain review candidates until live records reconcile", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 23_552,
    conservativeValueCents: 2_909_700,
    totalLienExposureCents: 23_552,
    sourcePriority: 1,
    dataFreshness: "stale",
    liveAvailability: "unverified",
    parcelReconciliation: "partial",
    certificateReconciliation: "partial",
    stackRisk: "low",
    redemptionAssessment: "unknown",
    access: "unknown",
    buildability: "unknown",
    homesteadStatus: "unknown",
    flood: "unknown",
    wetland: "unknown",
    codeStatus: "unknown",
    titleRisk: "unknown",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 100_000,
  });
  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.ok(result.hardStops.length > 0);
  assert.equal(result.purchaseAuthority, false);
});