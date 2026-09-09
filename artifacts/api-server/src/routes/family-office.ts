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

const router: IRouter = Router();

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
  let researchInput = body;
  let publicWebEvidence: ResearchOptions["publicWebEvidence"];
  let sourceRetrieval: { finalUrl: string; retrievedAt: string; freshness: "fresh" | "stale" | "unknown"; provenance: "PUBLIC_WEB_RETRIEVAL" } | null = null;
  if (body.url) {
    const fetched = await ingestPublicResearchUrl({ url: body.url, ticker: body.ticker });
    if (fetched.status !== "extracted") {
      const actor = actorFrom(res);
      const [blockedRun] = await db.insert(familyOfficeRuns).values({
        householdId: actor.householdId, analyst: body.analyst ?? "Research Analyst", scope: body.scope,
        status: "blocked", providerStatus: "not_started", errorCode: fetched.status,
        outputSummary: fetched.limitation ?? null, createdBy: actor.userId, completedAt: new Date(),
      }).returning();
      await db.insert(auditEvents).values({
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
    researchInput = { ...body, ticker: body.ticker ?? fetched.ticker!, prompt: body.prompt ?? "Provide general investment analysis." };
  }
  const result = await runFamilyOfficeResearch(actorFrom(res), researchInput, { publicWebEvidence });
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