import { Router, type IRouter } from "express";
import { GetHouseholdResponse, UpdatePrivacySettingsBody } from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getHousehold, updatePrivacySettings } from "../services/capital-os";

const router: IRouter = Router();

router.get("/household", asyncRoute(async (_req, res) => {
  res.json(GetHouseholdResponse.parse(await getHousehold(actorFrom(res))));
}));

router.patch("/household/privacy", asyncRoute(async (req, res) => {
  const body = UpdatePrivacySettingsBody.parse(req.body);
  res.json(GetHouseholdResponse.parse(await updatePrivacySettings(actorFrom(res), body)));
}));

export default router;