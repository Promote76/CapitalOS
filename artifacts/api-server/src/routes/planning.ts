import { Router, type IRouter } from "express";
import {
  AddPropertyNoteBody,
  AddPropertyNoteResponse,
  GetPropertiesResponse,
  ListStrategiesResponse,
  PromoteStrategyBody,
  PromoteStrategyParams,
  PromoteStrategyResponse,
  AllocateStrategyBody,
  AllocateStrategyHeader,
  AllocateStrategyParams,
  AllocateStrategyResponse,
  UpdateBuyBoxBody,
  CreatePropertyCandidateBody,
  AnalyzePropertyCandidateParams,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { addPropertyNote, allocateStrategy, getProperty, getStrategies, promoteStrategy } from "../services/capital-os";
import { analyzePropertyCandidate, createPropertyCandidate, getPropertyUnderwriting, updateBuyBox } from "../services/property-underwriting";

const router: IRouter = Router();

router.get("/properties", asyncRoute(async (_req, res) => {
  res.json(GetPropertiesResponse.parse(await getProperty()));
}));

router.post("/properties", asyncRoute(async (req, res) => {
  const body = AddPropertyNoteBody.parse(req.body);
  res.status(201).json(AddPropertyNoteResponse.parse(await addPropertyNote(actorFrom(res), body.propertyGoalId, body.body)));
}));

router.get("/properties/underwriting", asyncRoute(async (_req, res) => {
  res.json(await getPropertyUnderwriting());
}));

router.patch("/properties/buy-box", asyncRoute(async (req, res) => {
  const body = UpdateBuyBoxBody.parse(req.body);
  res.json(await updateBuyBox(actorFrom(res), body));
}));

router.post("/properties/candidates", asyncRoute(async (req, res) => {
  const body = CreatePropertyCandidateBody.parse(req.body);
  res.status(201).json(await createPropertyCandidate(actorFrom(res), body as Parameters<typeof createPropertyCandidate>[1]));
}));

router.post("/properties/candidates/:candidateId/analyze", asyncRoute(async (req, res) => {
  const params = AnalyzePropertyCandidateParams.parse(req.params);
  res.json(await analyzePropertyCandidate(actorFrom(res), params.candidateId));
}));

router.get("/strategies", asyncRoute(async (_req, res) => {
  res.json(ListStrategiesResponse.parse(await getStrategies()));
}));

router.post("/strategies/:strategyId/promote", asyncRoute(async (req, res) => {
  const params = PromoteStrategyParams.parse(req.params);
  const body = PromoteStrategyBody.parse(req.body);
  res.json(PromoteStrategyResponse.parse(await promoteStrategy(actorFrom(res), params.strategyId, body)));
}));

router.post("/strategies/:strategyId/allocation", asyncRoute(async (req, res) => {
  const params = AllocateStrategyParams.parse(req.params);
  const body = AllocateStrategyBody.parse(req.body);
  const headers = AllocateStrategyHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(AllocateStrategyResponse.parse(await allocateStrategy(actorFrom(res), params.strategyId, body, headers["Idempotency-Key"])));
}));

export default router;