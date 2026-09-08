import { Router, type IRouter } from "express";
import {
  GetVariableBudgetIntelligenceResponse,
  RecalculateVariableIncomeProfileBody,
  RecalculateVariableIncomeProfileResponse,
  CreateVehicleScenarioBody,
  CreateVehicleScenarioResponse,
  GetCapitalGovernorV2Response,
  RunCapitalWaterfallBody,
  RunCapitalWaterfallHeader,
  RunCapitalWaterfallResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createVehicleScenario,
  getVariableBudgetIntelligence,
  recalculateVariableIncomeProfile,
} from "../services/variable-income";
import { getCapitalGovernorV2, runCapitalWaterfall } from "../services/capital-governor";

const router: IRouter = Router();

router.get("/variable-budget/intelligence", asyncRoute(async (req, res) => {
  const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
  res.json(GetVariableBudgetIntelligenceResponse.parse(await getVariableBudgetIntelligence(actorFrom(res), asOf)));
}));

router.post("/variable-budget/profile/recalculate", asyncRoute(async (req, res) => {
  const body = RecalculateVariableIncomeProfileBody.parse(req.body);
  res.json(RecalculateVariableIncomeProfileResponse.parse(await recalculateVariableIncomeProfile(actorFrom(res), body)));
}));

router.post("/variable-budget/vehicle-scenarios", asyncRoute(async (req, res) => {
  const body = CreateVehicleScenarioBody.parse(req.body);
  res.status(201).json(CreateVehicleScenarioResponse.parse(await createVehicleScenario(actorFrom(res), body)));
}));

router.get("/capital-governor/v2", asyncRoute(async (req, res) => {
  const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;
  res.json(GetCapitalGovernorV2Response.parse(await getCapitalGovernorV2(actorFrom(res), asOf)));
}));

router.post("/capital-governor/v2/waterfall", asyncRoute(async (req, res) => {
  const input = RunCapitalWaterfallBody.parse(req.body ?? {});
  const headers = RunCapitalWaterfallHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(RunCapitalWaterfallResponse.parse(await runCapitalWaterfall(actorFrom(res), {
    ...input,
    asOf: input.asOf?.toISOString().slice(0, 10),
  }, headers["Idempotency-Key"])));
}));

export default router;