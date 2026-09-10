import { Router, type IRouter } from "express";
import { asyncRoute } from "../middleware/errors";
import { actorFrom } from "../middleware/request-context";
import {
  listObservabilityDeliveries,
  listObservabilityIncidents,
  listObservabilityDestinations,
  listObservabilityRules,
  projectObservabilityMetrics,
  reprocessObservabilityAlert,
  resolveObservabilityAlert,
  triggerObservabilityAlert,
} from "../services/observability-alerts";

const router: IRouter = Router();

router.get(
  "/observability/incidents",
  asyncRoute(async (_req, res) => {
    res.json(await listObservabilityIncidents(actorFrom(res)));
  }),
);
router.get(
  "/observability/destinations",
  asyncRoute(async (_req, res) => {
    res.json(await listObservabilityDestinations(actorFrom(res)));
  }),
);
router.get(
  "/observability/rules",
  asyncRoute(async (_req, res) => {
    res.json(await listObservabilityRules(actorFrom(res)));
  }),
);
router.get(
  "/observability/health",
  asyncRoute(async (_req, res) => {
    const actor = actorFrom(res);
    const health = await projectObservabilityMetrics(actor);
    const incidents = await listObservabilityIncidents(actor);
    const queueDegraded =
      health.queue.deadLetterCount > 0 ||
      health.queue.staleWorkerCount > 0 ||
      health.queue.oldestPendingJobAgeMs > 300_000;
    const schedulerDegraded =
      health.scheduler.schedulerLagMs > 60_000 ||
      health.scheduler.missedScheduleCount > 0;
    const executionDegraded =
      health.execution.state === "LOCKED" ||
      health.execution.state === "STOPPED";
    const guardianDegraded = health.execution.guardian !== "HEALTHY";
    res.json({
      status:
        queueDegraded ||
        schedulerDegraded ||
        executionDegraded ||
        guardianDegraded
          ? "DEGRADED"
          : "OK",
      openIncidents: incidents.filter((incident) => incident.status === "OPEN")
        .length,
      nodes: {
        queue: {
          status: queueDegraded ? "DEGRADED" : "OK",
          message: queueDegraded
            ? "Queue requires operator review"
            : "Queue is within certified thresholds",
        },
        scheduler: {
          status: schedulerDegraded ? "DEGRADED" : "OK",
          message: schedulerDegraded
            ? "Scheduler requires operator review"
            : "Scheduler is within certified thresholds",
        },
        worker: {
          status: health.queue.staleWorkerCount > 0 ? "DEGRADED" : "OK",
          message:
            health.queue.staleWorkerCount > 0
              ? "A worker heartbeat is stale"
              : "Worker heartbeats are within threshold",
        },
        executionControl: {
          status: executionDegraded ? "DEGRADED" : "DISABLED",
          message: `Execution control is ${health.execution.state.toLowerCase()} and remains server-authoritative`,
        },
        guardian: {
          status: guardianDegraded ? "DEGRADED" : "OK",
          message: guardianDegraded
            ? "Guardian is fail-closed"
            : "Guardian is healthy",
        },
        microLive: {
          status: "DISABLED",
          message: "Micro-Live transmission is disabled",
        },
      },
    });
  }),
);
router.get(
  "/observability/incidents/:incidentId/deliveries",
  asyncRoute(async (req, res) => {
    res.json(
      await listObservabilityDeliveries(
        actorFrom(res),
        String(req.params.incidentId),
      ),
    );
  }),
);
router.post(
  "/observability/incidents/:incidentId/reprocess",
  asyncRoute(async (req, res) => {
    res.json(
      await reprocessObservabilityAlert(
        actorFrom(res),
        String(req.params.incidentId),
      ),
    );
  }),
);
router.post(
  "/observability/incidents/:incidentId/resolve",
  asyncRoute(async (req, res) => {
    const note =
      typeof req.body?.note === "string" && req.body.note.length <= 500
        ? req.body.note
        : null;
    if (!note) {
      res
        .status(400)
        .json({
          code: "VALIDATION_ERROR",
          message: "A note of at most 500 characters is required",
        });
      return;
    }
    res.json(
      await resolveObservabilityAlert(
        actorFrom(res),
        String(req.params.incidentId),
        note,
      ),
    );
  }),
);
// A certification trigger is unavailable in production and requires an authorized operator.
router.post(
  "/observability/certification/critical",
  asyncRoute(async (req, res) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.CAPITAL_OS_CERTIFICATION_MODE !== "1"
    ) {
      res.status(404).json({ code: "NOT_FOUND", message: "Not found" });
      return;
    }
    res
      .status(201)
      .json(
        await triggerObservabilityAlert(
          actorFrom(res),
          "certification-test-critical",
          res.locals.correlationId,
        ),
      );
  }),
);

export default router;
