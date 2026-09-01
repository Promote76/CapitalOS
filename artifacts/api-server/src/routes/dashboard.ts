import { Router, type IRouter } from "express";
import { GetDashboardResponse } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getDashboard } from "../services/capital-os";

const router: IRouter = Router();

router.get("/dashboard", asyncRoute(async (_req, res) => {
  res.json(GetDashboardResponse.parse(await getDashboard(actorFrom(res))));
}));

export default router;