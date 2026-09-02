import { Router, type IRouter } from "express";
import {
  CreateCapitalRequestBody,
  CreateCapitalRequestHeader,
  CreateCapitalRequestResponse,
  DecideCapitalRequestBody,
  DecideCapitalRequestResponse,
  GetTreasuryResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  createCapitalRequest,
  decideCapitalRequest,
  getTreasury,
} from "../services/treasury";

const router: IRouter = Router();

router.get("/treasury", asyncRoute(async (_req, res) => {
  res.json(GetTreasuryResponse.parse(await getTreasury()));
}));

router.post("/treasury/requests", asyncRoute(async (req, res) => {
  const input = CreateCapitalRequestBody.parse(req.body);
  const headers = CreateCapitalRequestHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(
    CreateCapitalRequestResponse.parse(await createCapitalRequest(actorFrom(res), input, headers["Idempotency-Key"])),
  );
}));

router.post("/treasury/requests/:requestId/decision", asyncRoute(async (req, res) => {
  const input = DecideCapitalRequestBody.parse(req.body);
  res.json(
    DecideCapitalRequestResponse.parse(
      await decideCapitalRequest(actorFrom(res), String(req.params.requestId), input),
    ),
  );
}));

export default router;