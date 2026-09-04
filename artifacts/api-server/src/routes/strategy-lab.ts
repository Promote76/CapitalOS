import { Router, type IRouter } from "express";
import {
  CreateResearchJournalEntryBody,
  CreateResearchJournalEntryResponse,
  CreateResearchStrategyBody,
  CreateResearchStrategyResponse,
  CreateStrategyVersionBody,
  CreateStrategyVersionParams,
  CreateStrategyVersionResponse,
  EvaluateStrategyGraduationParams,
  EvaluateStrategyGraduationResponse,
  GetStrategyLabResponse,
  RunStrategyExperimentBody,
  RunStrategyExperimentResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createResearchJournalEntry,
  createResearchStrategy,
  createStrategyVersion,
  evaluateStrategyGraduation,
  getStrategyLabSnapshot,
  runStrategyExperiment,
} from "../services/strategy-lab";

const router: IRouter = Router();

router.get("/strategy-lab", asyncRoute(async (_req, res) => {
  res.json(GetStrategyLabResponse.parse(await getStrategyLabSnapshot(actorFrom(res))));
}));

router.post("/strategy-lab/strategies", asyncRoute(async (req, res) => {
  const body = CreateResearchStrategyBody.parse(req.body);
  res.status(201).json(CreateResearchStrategyResponse.parse(await createResearchStrategy(actorFrom(res), body)));
}));

router.post("/strategy-lab/strategies/:strategyId/versions", asyncRoute(async (req, res) => {
  const params = CreateStrategyVersionParams.parse(req.params);
  const body = CreateStrategyVersionBody.parse(req.body);
  res.status(201).json(CreateStrategyVersionResponse.parse(await createStrategyVersion(actorFrom(res), params.strategyId, body)));
}));

router.post("/strategy-lab/experiments", asyncRoute(async (req, res) => {
  const body = RunStrategyExperimentBody.parse(req.body);
  res.status(201).json(RunStrategyExperimentResponse.parse(await runStrategyExperiment(actorFrom(res), body)));
}));

router.post("/strategy-lab/strategies/:strategyId/graduation", asyncRoute(async (req, res) => {
  const params = EvaluateStrategyGraduationParams.parse(req.params);
  res.json(EvaluateStrategyGraduationResponse.parse(await evaluateStrategyGraduation(actorFrom(res), params.strategyId)));
}));

router.post("/strategy-lab/journal", asyncRoute(async (req, res) => {
  const body = CreateResearchJournalEntryBody.parse(req.body);
  res.status(201).json(CreateResearchJournalEntryResponse.parse(await createResearchJournalEntry(actorFrom(res), body)));
}));

export default router;