import { appendAuditEvent, appendAuditEvents } from "../services/audit";
import { Router, type IRouter } from "express";
import { auditEvents, db, familyOfficeRuns } from "@workspace/db";
import { assertPermission } from "../domain/governance";
import {
  CreateFamilyOfficeResearchBody,
  CreateFamilyOfficeResearchResponse,
  CreateFamilyOfficeRefreshBody,
  CreateFamilyOfficeRefreshResponse,
  CreateShadowIntentBody,
  CreateShadowIntentResponse,
  CreateShadowPortfolioBody,
  CreateShadowPortfolioResponse,
  CreateTaxLienCandidateBody,
  CreateTaxLienCandidateResponse,
  DecideFamilyOfficeProposalBody,
  DecideFamilyOfficeProposalParams,
  DecideFamilyOfficeProposalResponse,
  GetFamilyOfficeResponse,
  GetRealEstateIntelligenceResponse,
  type FamilyOfficeResearchFailure,
  PreviewFamilyOfficeResearchDigestionBody,
  PreviewFamilyOfficeResearchDigestionResponse,
  RequestResearchEvidenceUploadBody,
  RequestResearchEvidenceUploadResponse,
  RegisterResearchEvidenceBody,
  RegisterResearchEvidenceResponse,
  ReviewResearchEvidenceBody,
  ReviewResearchEvidenceResponse,
  ListResearchDossiersResponse,
  CreateResearchDossierBody,
  CreateResearchDossierResponse,
  ListResearchOpportunitiesResponse,
  ListResearchAdvisoryDecisionsResponse,
  CreateResearchAdvisoryDecisionBody,
  CreateResearchAdvisoryDecisionResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createShadowOrderIntent,
  createShadowPortfolio,
  decideFamilyOfficeProposal,
  getFamilyOfficeSnapshot,
  getRealEstateIntelligence,
  createTaxLienCandidate,
  requestFamilyOfficeRefresh,
  runFamilyOfficeResearch,
} from "../services/family-office";
import type { ResearchOptions } from "../services/family-office";
import { ingestPublicResearchUrl } from "../services/public-research-ingestion";
import { parseResearchDigestion, type NormalizedResearchDigestion } from "../domain/research-digestion";
import { createInvestmentResearchDossier, listResearchDossiers, registerResearchEvidence, requestResearchEvidenceUpload, reviewResearchEvidence } from "../services/research-dossier";
import { listResearchOpportunities } from "../services/research-opportunities";
import { createResearchAdvisoryDecision, listResearchAdvisoryDecisions } from "../services/research-advisory";

const router: IRouter = Router();

router.post("/family-office/research-evidence/upload-url", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const body = RequestResearchEvidenceUploadBody.parse(req.body);
  res.status(201).json(RequestResearchEvidenceUploadResponse.parse(await requestResearchEvidenceUpload(actorFrom(res), body)));
}));

router.get("/family-office/research-dossiers", asyncRoute(async (_req, res) => {
  res.json(ListResearchDossiersResponse.parse(await listResearchDossiers(actorFrom(res))));
}));

router.get("/research/opportunities", asyncRoute(async (req, res) => {
  const lens = typeof req.query.lens === "string" ? req.query.lens : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const minScore = typeof req.query.minScore === "string" && req.query.minScore.trim() ? Number(req.query.minScore) : undefined;
  const portfolioFit = typeof req.query.portfolioFit === "string" ? req.query.portfolioFit : undefined;
  res.json(ListResearchOpportunitiesResponse.parse(await listResearchOpportunities(actorFrom(res), {
    lens: lens as "Income" | "Compounders" | "Balanced" | undefined,
    search,
    minScore: Number.isFinite(minScore) ? minScore : undefined,
    portfolioFit: portfolioFit as "Constructive" | "Review" | "Caution" | undefined,
  })));
}));

router.get("/research/advisory-decisions", asyncRoute(async (_req, res) => {
  res.json(ListResearchAdvisoryDecisionsResponse.parse(await listResearchAdvisoryDecisions(actorFrom(res))));
}));

router.post("/research/advisory-decisions", asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "contribute");
  const body = CreateResearchAdvisoryDecisionBody.parse(req.body);
  res.status(201).json(CreateResearchAdvisoryDecisionResponse.parse(await createResearchAdvisoryDecision(actor, body)));
}));

router.post("/family-office/research-evidence", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const body = RegisterResearchEvidenceBody.parse(req.body);
  res.status(201).json(RegisterResearchEvidenceResponse.parse(await registerResearchEvidence(actorFrom(res), body)));
}));

router.post("/family-office/research-evidence/:evidenceId/review", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const body = ReviewResearchEvidenceBody.parse(req.body);
  res.json(ReviewResearchEvidenceResponse.parse(await reviewResearchEvidence(actorFrom(res), String(req.params.evidenceId), body.status)));
}));

router.post("/family-office/research-dossiers", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const body = CreateResearchDossierBody.parse(req.body);
  res.status(201).json(CreateResearchDossierResponse.parse(await createInvestmentResearchDossier(actorFrom(res), body)));
}));

function isFamilyOfficeFailureCode(value: unknown): value is FamilyOfficeResearchFailure["code"] {
  return typeof value === "string" && [
    "AI_PROVIDER_DISABLED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_AUTHENTICATION_FAILED",
    "AI_PROVIDER_MODEL_UNAVAILABLE",
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_UPSTREAM_ERROR",
    "AI_PROVIDER_INVALID_RESPONSE",
    "AI_RESEARCH_PERSISTENCE_ERROR",
  ].includes(value);
}

router.get("/family-office", asyncRoute(async (_req, res) => {
  res.json(GetFamilyOfficeResponse.parse(await getFamilyOfficeSnapshot(actorFrom(res))));
}));

router.get("/family-office/real-estate", asyncRoute(async (_req, res) => {
  res.json(GetRealEstateIntelligenceResponse.parse(await getRealEstateIntelligence(actorFrom(res))));
}));

router.post("/family-office/refresh", asyncRoute(async (req, res) => {
  const body = CreateFamilyOfficeRefreshBody.parse(req.body);
  res.status(200).json(CreateFamilyOfficeRefreshResponse.parse(await requestFamilyOfficeRefresh(actorFrom(res), body)));
}));

router.post("/family-office/research", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const body = CreateFamilyOfficeResearchBody.parse(req.body);
  const digestionPayload = (req.body as Record<string, unknown>).digestionPayload;
  let normalizedDigestion: NormalizedResearchDigestion | undefined;
  let researchInput = body;
  if (digestionPayload !== undefined) {
    const parsed = parseResearchDigestion(digestionPayload as string);
    if (!parsed.success) {
      res.status(422).json({ code: "DIGESTION_VALIDATION_FAILED", message: "Investment research could not be normalized safely.", issues: parsed.issues, advisoryOnly: true });
      return;
    }
    normalizedDigestion = parsed.data;
    researchInput = { ...body, ticker: body.ticker ?? parsed.data.ticker, prompt: body.prompt ?? "Provide general investment analysis.", digestionPayload: digestionPayload as string };
  }
  let publicWebEvidence: ResearchOptions["publicWebEvidence"];
  let sourceRetrieval: { finalUrl: string; retrievedAt: string; freshness: "fresh" | "stale" | "unknown"; provenance: "PUBLIC_WEB_RETRIEVAL" } | null = null;
  if (body.url) {
    const fetched = await ingestPublicResearchUrl({ url: body.url, ticker: body.ticker ?? normalizedDigestion?.ticker });
    if (fetched.status !== "extracted") {
      const actor = actorFrom(res);
      const [blockedRun] = await db.insert(familyOfficeRuns).values({
        householdId: actor.householdId, analyst: body.analyst ?? "Research Analyst", scope: body.scope,
        status: "blocked", providerStatus: "not_started", errorCode: fetched.status,
        outputSummary: fetched.limitation ?? null, createdBy: actor.userId, completedAt: new Date(),
      }).returning();
      await appendAuditEvent({
        householdId: actor.householdId,
        eventType: "family_office_public_research_blocked",
        actor: actor.userId,
        entity: "family_office_public_research",
        entityId: "url-ingestion",
        reason: "Public research URL ingestion was blocked safely.",
        metadata: { status: fetched.status, hostname: (() => { try { return new URL(body.url!).hostname; } catch { return "invalid"; } })() },
      });
      const message = body.url.includes("simplywall.st")
        ? "Simply Wall St content could not be accessed. Please provide an authorized excerpt or connect an authorized data source."
        : fetched.limitation ?? "The requested public page could not be safely accessed.";
      res.status(fetched.status === "ticker_required" ? 400 : 422).json({ code: fetched.status, message, fetchStatus: fetched.status, accessLimitation: message, run: blockedRun, proposal: null, advisoryOnly: true });
      return;
    }
    sourceRetrieval = fetched.sourceRetrieval ?? (fetched.finalUrl && fetched.retrievedAt ? {
      finalUrl: fetched.finalUrl, retrievedAt: fetched.retrievedAt, freshness: "fresh", provenance: "PUBLIC_WEB_RETRIEVAL",
    } : null);
    if (!body.ticker && !fetched.ticker) {
      res.status(400).json({ code: "ticker_required", message: "Please provide a ticker so the research can be scoped safely.", advisoryOnly: true });
      return;
    }
    publicWebEvidence = {
      title: fetched.title ?? fetched.finalUrl ?? "Public research page",
      finalUrl: fetched.finalUrl!, excerpt: (fetched.text ?? fetched.facts.join(" ")).slice(0, 3000),
      retrievedAt: fetched.retrievedAt!, freshness: fetched.freshness, status: "extracted", accessLimitation: null,
    };
    researchInput = {
      ...researchInput,
      ticker: researchInput.ticker ?? fetched.ticker!,
      prompt: researchInput.prompt ?? "Provide general investment analysis.",
    };
  }
  const result = await runFamilyOfficeResearch(actorFrom(res), researchInput, { publicWebEvidence, structuredResearchDigestion: normalizedDigestion });
  if (result.run.status !== "completed" || !result.proposal) {
    const code = isFamilyOfficeFailureCode(result.run.errorCode)
      ? result.run.errorCode
      : "AI_PROVIDER_UPSTREAM_ERROR";
    const failure = {
      code,
      message: "Family Office research is temporarily unavailable. The blocked run was retained for review.",
      correlationId: res.locals.correlationId ?? null,
      run: result.run,
      proposal: null,
      advisoryOnly: result.advisoryOnly,
    } satisfies FamilyOfficeResearchFailure;
    res.status(503).json(failure);
    return;
  }
  res.status(201).json(CreateFamilyOfficeResearchResponse.parse({
    ...result,
    sourceRetrieval,
  }));
}));

router.post("/family-office/research/digestion/preview", asyncRoute(async (req, res) => {
  assertPermission(actorFrom(res).role, "contribute");
  const previewBody = PreviewFamilyOfficeResearchDigestionBody.parse(req.body);
  const parsed = parseResearchDigestion(previewBody.digestionPayload);
  if (!parsed.success) {
    res.status(422).json({ code: "DIGESTION_VALIDATION_FAILED", message: "Investment research could not be normalized safely.", issues: parsed.issues, advisoryOnly: true });
    return;
  }
  const d = parsed.data;
  res.status(200).json(PreviewFamilyOfficeResearchDigestionResponse.parse({
    ticker: d.ticker,
    company: d.company,
    sources: d.sources.map(({ id, title, url, publisher, sourceType, asOf }) => ({ id, title, url: url ?? null, publisher: publisher ?? null, sourceType: sourceType ?? null, asOf: asOf ?? null })),
    sourceCount: d.sources.length,
    sourceClaimCount: d.sourceClaims.length,
    inferenceCount: d.inferences?.length ?? 0,
    sourceClaims: d.sourceClaims,
    inferences: d.inferences ?? [],
    warnings: ["Structured digestion is advisory only.", "Third-party source claims are unverified and do not receive authority elevation.", "Inferences are kept separate from source claims."],
    unverifiedThirdPartyAuthority: true,
    fingerprint: d.fingerprint,
     advisoryOnly: true,
   }));
}));

router.post("/family-office/proposals/:proposalId/decision", asyncRoute(async (req, res) => {
  const params = DecideFamilyOfficeProposalParams.parse(req.params);
  const body = DecideFamilyOfficeProposalBody.parse(req.body);
  res.json(DecideFamilyOfficeProposalResponse.parse(await decideFamilyOfficeProposal(actorFrom(res), params.proposalId, body.decision, body.reason)));
}));

router.post("/family-office/shadow/portfolios", asyncRoute(async (req, res) => {
  const body = CreateShadowPortfolioBody.parse(req.body);
  res.status(201).json(CreateShadowPortfolioResponse.parse(await createShadowPortfolio(actorFrom(res), body)));
}));

router.post("/family-office/shadow/intents", asyncRoute(async (req, res) => {
  const body = CreateShadowIntentBody.parse(req.body);
  res.status(201).json(CreateShadowIntentResponse.parse(await createShadowOrderIntent(actorFrom(res), body)));
}));

router.post("/family-office/tax-liens", asyncRoute(async (req, res) => {
  const body = CreateTaxLienCandidateBody.parse(req.body);
  res.status(201).json(CreateTaxLienCandidateResponse.parse(await createTaxLienCandidate(actorFrom(res), body)));
}));

export default router;