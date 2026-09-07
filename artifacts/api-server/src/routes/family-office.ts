import { Router, type IRouter } from "express";
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
  const body = CreateFamilyOfficeResearchBody.parse(req.body);
  const result = await runFamilyOfficeResearch(actorFrom(res), body);
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
  res.status(201).json(CreateFamilyOfficeResearchResponse.parse(result));
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