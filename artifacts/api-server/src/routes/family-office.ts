import { Router, type IRouter } from "express";
import {
  CreateFamilyOfficeResearchBody,
  CreateFamilyOfficeResearchResponse,
  CreateShadowIntentBody,
  CreateShadowIntentResponse,
  CreateShadowPortfolioBody,
  CreateShadowPortfolioResponse,
  DecideFamilyOfficeProposalBody,
  DecideFamilyOfficeProposalParams,
  DecideFamilyOfficeProposalResponse,
  GetFamilyOfficeResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createShadowOrderIntent,
  createShadowPortfolio,
  decideFamilyOfficeProposal,
  getFamilyOfficeSnapshot,
  runFamilyOfficeResearch,
} from "../services/family-office";

const router: IRouter = Router();

router.get("/family-office", asyncRoute(async (_req, res) => {
  res.json(GetFamilyOfficeResponse.parse(await getFamilyOfficeSnapshot(actorFrom(res))));
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

export default router;