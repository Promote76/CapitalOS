import { Router, type IRouter } from "express";
import {
  CreateFamilyOfficeResearchBody,
  CreateFamilyOfficeResearchResponse,
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
  runFamilyOfficeResearch,
} from "../services/family-office";

const router: IRouter = Router();

router.get("/family-office", asyncRoute(async (_req, res) => {
  res.json(GetFamilyOfficeResponse.parse(await getFamilyOfficeSnapshot(actorFrom(res))));
}));

router.get("/family-office/real-estate", asyncRoute(async (_req, res) => {
  res.json(GetRealEstateIntelligenceResponse.parse(await getRealEstateIntelligence(actorFrom(res))));
}));

router.post("/family-office/research", asyncRoute(async (req, res) => {
  const body = CreateFamilyOfficeResearchBody.parse(req.body);
  res.status(201).json(CreateFamilyOfficeResearchResponse.parse(await runFamilyOfficeResearch(actorFrom(res), body)));
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