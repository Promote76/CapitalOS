import { Router, type IRouter } from "express";
import { GetAccountingOverviewResponse } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getAccountingOverview } from "../services/accounting";

const router: IRouter = Router();

router.get("/accounting", asyncRoute(async (_req, res) => {
  res.json(GetAccountingOverviewResponse.parse(await getAccountingOverview(actorFrom(res))));
}));

export default router;