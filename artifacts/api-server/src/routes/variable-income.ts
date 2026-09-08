import { Router, type IRouter } from "express";
import {
  GetVariableBudgetIntelligenceResponse,
  RecalculateVariableIncomeProfileBody,
  RecalculateVariableIncomeProfileResponse,
  CreateVehicleScenarioBody,
  CreateVehicleScenarioResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createVehicleScenario,
  getVariableBudgetIntelligence,
  recalculateVariableIncomeProfile,
} from "../services/variable-income";

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

export default router;