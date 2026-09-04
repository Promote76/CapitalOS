import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetExecutionControlResponse,
  RequestExecutionStopBody,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import {
  actorFrom,
  securityContextFrom,
} from "../middleware/request-context";
import { hasProviderReverification } from "../middleware/reverification";
import {
  getExecutionControl,
  recoverExecutionControl,
  requestExecutionEvacuate,
  requestExecutionSafeMode,
  requestExecutionStop,
} from "../services/execution-control";
import { GovernanceError } from "../domain/governance";

const router: IRouter = Router();

function commandInput(req: Request, res: Response) {
  const body = RequestExecutionStopBody.parse(req.body);
  return {
    reason: body.reason,
    correlationId: res.locals.correlationId as string | undefined,
    idempotencyKey: req.header("Idempotency-Key"),
  };
}

router.get("/execution-control", asyncRoute(async (_req, res) => {
  res.json(GetExecutionControlResponse.parse(await getExecutionControl(actorFrom(res))));
}));

router.post("/execution-control/stop", asyncRoute(async (req, res) => {
  res.json(GetExecutionControlResponse.parse(await requestExecutionStop(actorFrom(res), commandInput(req, res))));
}));

router.post("/execution-control/safe-mode", asyncRoute(async (req, res) => {
  res.json(GetExecutionControlResponse.parse(await requestExecutionSafeMode(actorFrom(res), commandInput(req, res))));
}));

router.post("/execution-control/evacuate", asyncRoute(async (req, res) => {
  res.json(GetExecutionControlResponse.parse(await requestExecutionEvacuate(actorFrom(res), commandInput(req, res))));
}));

router.post("/execution-control/recover", asyncRoute(async (req, res) => {
  if (!hasProviderReverification(req, securityContextFrom(res))) {
    throw new GovernanceError("FORBIDDEN", "Recent provider authentication is required for execution recovery");
  }
  res.json(GetExecutionControlResponse.parse(await recoverExecutionControl(actorFrom(res), commandInput(req, res))));
}));

export default router;