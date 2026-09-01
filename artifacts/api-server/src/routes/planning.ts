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
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { addPropertyNote, allocateStrategy, getProperty, getStrategies, promoteStrategy } from "../services/capital-os";

const router: IRouter = Router();

router.get("/properties", asyncRoute(async (_req, res) => {
  res.json(GetPropertiesResponse.parse(await getProperty()));
}));

router.post("/properties", asyncRoute(async (req, res) => {
  const body = AddPropertyNoteBody.parse(req.body);
  res.status(201).json(AddPropertyNoteResponse.parse(await addPropertyNote(actorFrom(res), body.propertyGoalId, body.body)));
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