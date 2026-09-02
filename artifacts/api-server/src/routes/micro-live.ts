import { Router, type IRouter } from "express";
import {
  ApproveMicroLiveVenueBody,
  ApproveMicroLiveVenueParams,
  ArmMicroLiveBody,
  CompleteMicroLiveReactivationRequirementParams,
  CreateMicroLiveIncidentReviewBody,
  CreateMicroLiveIncidentReviewParams,
  RecordMicroLiveVenueReviewBody,
  RecordMicroLiveVenueReviewParams,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  approveMicroLiveVenue,
  armMicroLive,
  completeMicroLiveReactivationRequirement,
  createMicroLiveIncidentReview,
  getMicroLiveSnapshot,
  listMicroLiveFillSnapshots,
  listMicroLiveIncidentReviews,
  listMicroLiveIncidents,
  listMicroLivePositionSnapshots,
  listMicroLiveReactivationRequirements,
  listMicroLiveReconciliationRuns,
  recordMicroLiveVenueReview,
  reviewMicroLiveEnablement,
  runMicroLiveReconciliation,
  runMicroLiveRehearsal,
} from "../services/micro-live";

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
  const { venueId } = ApproveMicroLiveVenueParams.parse(req.params);
  const body = ApproveMicroLiveVenueBody.parse(req.body);
  res.json(await approveMicroLiveVenue(actorFrom(res), venueId, body));
}));

router.post("/micro-live/venues/:venueId/reviews/:kind", asyncRoute(async (req, res) => {
  const { venueId, kind } = RecordMicroLiveVenueReviewParams.parse(req.params);
  const body = RecordMicroLiveVenueReviewBody.parse(req.body);
  res.status(201).json(await recordMicroLiveVenueReview(actorFrom(res), venueId, kind, body));
}));

router.post("/micro-live/arm", asyncRoute(async (req, res) => {
  const { venueId } = ArmMicroLiveBody.parse(req.body);
  res.json(await armMicroLive(actorFrom(res), venueId));
}));

router.get("/micro-live/reconciliation-runs", asyncRoute(async (_req, res) => {
  res.json(await listMicroLiveReconciliationRuns());
}));

router.post("/micro-live/reconciliation-runs", asyncRoute(async (_req, res) => {
  res.status(201).json(await runMicroLiveReconciliation(actorFrom(res)));
}));

router.get("/micro-live/position-snapshots", asyncRoute(async (_req, res) => {
  res.json(await listMicroLivePositionSnapshots());
}));

router.get("/micro-live/fill-snapshots", asyncRoute(async (_req, res) => {
  res.json(await listMicroLiveFillSnapshots());
}));

router.get("/micro-live/incidents", asyncRoute(async (_req, res) => {
  res.json(await listMicroLiveIncidents());
}));

router.post("/micro-live/incidents/:incidentId/reviews", asyncRoute(async (req, res) => {
  const { incidentId } = CreateMicroLiveIncidentReviewParams.parse(req.params);
  const body = CreateMicroLiveIncidentReviewBody.parse(req.body);
  res.status(201).json(await createMicroLiveIncidentReview(actorFrom(res), incidentId, body));
}));

router.get("/micro-live/incident-reviews", asyncRoute(async (_req, res) => {
  res.json(await listMicroLiveIncidentReviews());
}));

router.get("/micro-live/reactivation-requirements", asyncRoute(async (_req, res) => {
  res.json(await listMicroLiveReactivationRequirements());
}));

router.post("/micro-live/reactivation-requirements/:requirementId/complete", asyncRoute(async (req, res) => {
  const { requirementId } = CompleteMicroLiveReactivationRequirementParams.parse(req.params);
  res.json(await completeMicroLiveReactivationRequirement(actorFrom(res), requirementId));
}));

export default router;