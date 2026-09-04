import { Router, type IRouter } from "express";
import {
  GetIntelligenceResponse,
  RecordIntelligenceFeedbackBody,
  RecordIntelligenceFeedbackResponse,
  RunIntelligenceScenarioBody,
  RunIntelligenceScenarioResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  getIntelligenceSnapshot,
  refreshIntelligence,
  runContributionScenario,
  recordRecommendationFeedback,
} from "../services/intelligence";

const router: IRouter = Router();

router.get("/intelligence", asyncRoute(async (_req, res) => {
  res.json(GetIntelligenceResponse.parse(await getIntelligenceSnapshot(actorFrom(res))));
}));

router.post("/intelligence/refresh", asyncRoute(async (_req, res) => {
  res.json(GetIntelligenceResponse.parse(await refreshIntelligence(actorFrom(res))));
}));

router.post("/intelligence/scenario", asyncRoute(async (req, res) => {
  const body = RunIntelligenceScenarioBody.parse(req.body);
  res.json(RunIntelligenceScenarioResponse.parse(await runContributionScenario(body.proposedWeekly, actorFrom(res))));
}));

router.post("/intelligence/feedback", asyncRoute(async (req, res) => {
  const body = RecordIntelligenceFeedbackBody.parse(req.body);
  res.status(201).json(RecordIntelligenceFeedbackResponse.parse(await recordRecommendationFeedback(actorFrom(res), body)));
}));

export default router;