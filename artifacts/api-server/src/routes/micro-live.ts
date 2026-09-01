import { Router, type IRouter } from "express";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { getMicroLiveSnapshot, reviewMicroLiveEnablement, runMicroLiveRehearsal } from "../services/micro-live";

const router: IRouter = Router();

router.get("/micro-live", asyncRoute(async (_req, res) => {
  res.json(await getMicroLiveSnapshot());
}));

router.post("/micro-live/rehearsal", asyncRoute(async (_req, res) => {
  res.status(201).json(await runMicroLiveRehearsal(actorFrom(res)));
}));

router.post("/micro-live/enablement-review", asyncRoute(async (_req, res) => {
  res.json(await reviewMicroLiveEnablement(actorFrom(res)));
}));

export default router;