import { Router, type IRouter } from "express";
import { assertPermission } from "../domain/governance";
import { actorFrom } from "../middleware/request-context";
import { metricsOpenMetrics } from "../observability/metrics";
import { projectObservabilityMetrics } from "../services/observability-alerts";

const router: IRouter = Router();

// This endpoint deliberately remains behind the normal authenticated actor boundary.
// It exports only aggregate, low-cardinality operational state.
router.get("/internal/metrics", async (_req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "approve");
  // Reuse the certified operations calculations rather than inventing a second
  // queue vocabulary. These are aggregates only and are never tenant labels.
  await projectObservabilityMetrics(actor);
  res
    .type("application/openmetrics-text; version=1.0.0; charset=utf-8")
    .send(metricsOpenMetrics());
});

export default router;
