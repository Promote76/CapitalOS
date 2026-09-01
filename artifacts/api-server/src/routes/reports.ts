import { Router, type IRouter } from "express";
import { ListReportsResponse } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { getReports } from "../services/capital-os";

const router: IRouter = Router();

router.get("/reports", asyncRoute(async (_req, res) => {
  res.json(ListReportsResponse.parse(getReports()));
}));

export default router;