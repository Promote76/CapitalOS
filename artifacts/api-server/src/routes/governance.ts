import { Router, type IRouter } from "express";
import {
  ActivateEmergencyStopBody,
  ActivateEmergencyStopResponse,
  DecideRecommendationBody,
  DecideRecommendationParams,
  DecideRecommendationResponse,
  GetRiskResponse,
  ListAuditEventsResponse,
  ListRecommendationsResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  activateEmergencyStop,
  decideRecommendation,
  getAuditEvents,
  getRisk,
  listRecommendations,
} from "../services/capital-os";

const router: IRouter = Router();

router.get("/risk", asyncRoute(async (_req, res) => {
  res.json(GetRiskResponse.parse(await getRisk(actorFrom(res))));
}));

router.post("/risk/emergency-stop", asyncRoute(async (req, res) => {
  const body = ActivateEmergencyStopBody.parse(req.body);
  res.json(ActivateEmergencyStopResponse.parse(await activateEmergencyStop(actorFrom(res), body.confirmed, body.reason)));
}));

router.get("/recommendations", asyncRoute(async (_req, res) => {
  res.json(ListRecommendationsResponse.parse(await listRecommendations(actorFrom(res))));
}));

router.post("/recommendations/:recommendationId/decision", asyncRoute(async (req, res) => {
  const params = DecideRecommendationParams.parse(req.params);
  const body = DecideRecommendationBody.parse(req.body);
  res.json(DecideRecommendationResponse.parse(await decideRecommendation(actorFrom(res), params.recommendationId, body.decision, body.reason)));
}));

router.get("/audit", asyncRoute(async (_req, res) => {
  res.json(ListAuditEventsResponse.parse(await getAuditEvents(actorFrom(res))));
}));

export default router;