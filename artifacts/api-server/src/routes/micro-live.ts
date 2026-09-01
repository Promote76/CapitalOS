import { Router, type IRouter } from "express";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import { approveMicroLiveVenue, armMicroLive, getMicroLiveSnapshot, reviewMicroLiveEnablement, runMicroLiveRehearsal } from "../services/micro-live";

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

router.post("/micro-live/venues/:venueId/approve", asyncRoute(async (req, res) => {
  const venueId = typeof req.params.venueId === "string" ? req.params.venueId : "";
  res.json(await approveMicroLiveVenue(actorFrom(res), venueId, req.body));
}));

router.post("/micro-live/arm", asyncRoute(async (req, res) => {
  const venueId = typeof req.body?.venueId === "string" ? req.body.venueId : "";
  res.json(await armMicroLive(actorFrom(res), venueId));
}));

export default router;