import { Router, type IRouter } from "express";
import { GetHouseholdResponse } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getHousehold } from "../services/capital-os";

const router: IRouter = Router();

router.get("/household", asyncRoute(async (_req, res) => {
  res.json(GetHouseholdResponse.parse(await getHousehold(actorFrom(res))));
}));

export default router;