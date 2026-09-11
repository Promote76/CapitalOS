import { Router, type IRouter } from "express";
import {
  CreateOperationsTaskBody,
  CreateOperationsTaskResponse,
  DecideOperationsApprovalBody,
  DecideOperationsApprovalResponse,
  GetOperationsNotificationPreferencesResponse,
  GetOperationsOverviewResponse,
  ListOperationsAlertsResponse,
  ListOperationsApprovalsResponse,
  ListOperationsAutomationsResponse,
  ListOperationsTasksResponse,
  RunOperationsAutomationResponse,
  UpdateOperationsAlertBody,
  UpdateOperationsAlertResponse,
  UpdateOperationsNotificationPreferencesBody,
  UpdateOperationsNotificationPreferencesResponse,
  UpdateOperationsTaskBody,
  UpdateOperationsTaskResponse,
  CreateDailyOpsJournalEntryBody,
  CreateDailyOpsJournalEntryResponse,
  ListDailyOpsHistoryResponse,
  RecordGuidedRunActionBody,
  RecordGuidedRunActionHeader,
  RecordGuidedRunActionResponse,
} from "@workspace/api-zod";
import { asyncRoute } from "../middleware/errors";
import { actorFrom, securityContextFrom } from "../middleware/request-context";
import { assertPermission, GovernanceError } from "../domain/governance";
import { hasProviderReverification } from "../middleware/reverification";
import { runAuditBackfill, verifyAuditIntegrity } from "../services/audit-backfill";
import {
  createOperationsTask,
  decideOperationsApproval,
  getOperationsNotificationPreferences,
  getOperationsOverview,
  listOperationsAlerts,
  listOperationsApprovals,
  listOperationsAutomations,
  listOperationsTasks,
  runOperationsAutomation,
  updateOperationsAlert,
  updateOperationsNotificationPreferences,
  updateOperationsTask,
  getOperationsMetrics,
  listOperationsJobs, listOperationsWorkerHealth, reprocessOperationsJob,
  listOperationsSchedulers, acquireOperationsSchedulerLeadership, recoverMissedOperationsSchedules,
  getOperationsSchedulerMetrics, listOperationsAuditArchive,
  listDailyOpsHistory,
  exportDailyOpsHistory,
  createDailyOpsJournalEntry,
  recordGuidedRunAction,
} from "../services/operations";

const router: IRouter = Router();

router.get("/operations", asyncRoute(async (_req, res) => {
  res.json(GetOperationsOverviewResponse.parse(await getOperationsOverview(actorFrom(res))));
}));

router.post("/operations/audit-backfill", asyncRoute(async (req, res) => {
  const actor = actorFrom(res);
  assertPermission(actor.role, "approve");
  if (actor.role !== "owner") {
    throw new GovernanceError("FORBIDDEN", "Household owner permission is required for audit backfill");
  }
  if (!hasProviderReverification(req, securityContextFrom(res))) {
    throw new GovernanceError("FORBIDDEN", "Recent provider authentication is required for audit backfill");
  }
  const limit = Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    res.status(400).json({ code: "AUDIT_BACKFILL_LIMIT_INVALID" });
    return;
  }
  res.json({ ...(await runAuditBackfill(limit)), verification: await verifyAuditIntegrity() });
}));

router.get("/operations/jobs/metrics", asyncRoute(async (_req, res) => {
  res.json(await getOperationsMetrics(actorFrom(res).householdId));
}));
router.get("/operations/schedulers/metrics", asyncRoute(async (_req, res) => {
  res.json(await getOperationsSchedulerMetrics(actorFrom(res).householdId));
}));
router.get("/operations/jobs", asyncRoute(async (_req, res) => res.json(await listOperationsJobs(actorFrom(res)))));
router.get("/operations/audit-archive", asyncRoute(async (req, res) => {
  const rawLimit = Number(req.query.limit);
  res.json(await listOperationsAuditArchive(actorFrom(res), Number.isFinite(rawLimit) ? rawLimit : 200));
}));
router.get("/operations/workers", asyncRoute(async (_req, res) => res.json(await listOperationsWorkerHealth(actorFrom(res)))));
router.post("/operations/jobs/:jobId/reprocess", asyncRoute(async (req, res) => res.json(await reprocessOperationsJob(actorFrom(res), String(req.params.jobId)))));
router.get("/operations/schedulers", asyncRoute(async (_req, res) => res.json(await listOperationsSchedulers(actorFrom(res)))));
router.post("/operations/schedulers/leadership", asyncRoute(async (_req, res) => res.json(await acquireOperationsSchedulerLeadership(actorFrom(res)))));
router.post("/operations/schedulers/missed-runs/recover", asyncRoute(async (_req, res) => res.json({ recovered: await recoverMissedOperationsSchedules(actorFrom(res)) })));

router.get("/operations/tasks", asyncRoute(async (_req, res) => {
  res.json(ListOperationsTasksResponse.parse(await listOperationsTasks(actorFrom(res))));
}));

router.post("/operations/tasks", asyncRoute(async (req, res) => {
  const body = CreateOperationsTaskBody.parse(req.body);
  res.status(201).json(CreateOperationsTaskResponse.parse(await createOperationsTask(actorFrom(res), body)));
}));

router.patch("/operations/tasks/:taskId", asyncRoute(async (req, res) => {
  const body = UpdateOperationsTaskBody.parse(req.body);
  res.json(UpdateOperationsTaskResponse.parse(await updateOperationsTask(actorFrom(res), String(req.params.taskId), body)));
}));

function dailyOpsHistoryFilters(query: Record<string, unknown>) {
  const stringValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
  return {
    entryType: stringValue(query.entryType ?? query.type),
    cadence: stringValue(query.cadence),
    from: stringValue(query.from),
    to: stringValue(query.to),
  };
}

router.get("/operations/daily-ops", asyncRoute(async (req, res) => {
  res.json(ListDailyOpsHistoryResponse.parse(await listDailyOpsHistory(actorFrom(res), dailyOpsHistoryFilters(req.query as Record<string, unknown>))));
}));

router.get("/operations/daily-ops/export", asyncRoute(async (req, res) => {
  const csv = await exportDailyOpsHistory(actorFrom(res), dailyOpsHistoryFilters(req.query as Record<string, unknown>));
  res.type("text/csv");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", 'attachment; filename="capital-os-daily-ops-history.csv"');
  res.send(csv);
}));

router.post("/operations/daily-ops/journal", asyncRoute(async (req, res) => {
  const body = CreateDailyOpsJournalEntryBody.parse(req.body);
  res.status(201).json(CreateDailyOpsJournalEntryResponse.parse(await createDailyOpsJournalEntry(actorFrom(res), body)));
}));

router.post("/operations/daily-ops/guided-run", asyncRoute(async (req, res) => {
  const body = RecordGuidedRunActionBody.parse(req.body);
  const headers = RecordGuidedRunActionHeader.parse({ "Idempotency-Key": req.header("Idempotency-Key") });
  res.status(201).json(RecordGuidedRunActionResponse.parse(await recordGuidedRunAction(
    actorFrom(res),
    body,
    headers["Idempotency-Key"],
  )));
}));

router.get("/operations/approvals", asyncRoute(async (_req, res) => {
  res.json(ListOperationsApprovalsResponse.parse(await listOperationsApprovals(actorFrom(res))));
}));

router.post("/operations/approvals/:approvalId/decision", asyncRoute(async (req, res) => {
  const body = DecideOperationsApprovalBody.parse(req.body);
  res.json(DecideOperationsApprovalResponse.parse(await decideOperationsApproval(actorFrom(res), String(req.params.approvalId), body)));
}));

router.get("/operations/alerts", asyncRoute(async (_req, res) => {
  res.json(ListOperationsAlertsResponse.parse(await listOperationsAlerts(actorFrom(res))));
}));

router.patch("/operations/alerts/:alertId", asyncRoute(async (req, res) => {
  const body = UpdateOperationsAlertBody.parse(req.body);
  res.json(UpdateOperationsAlertResponse.parse(await updateOperationsAlert(actorFrom(res), String(req.params.alertId), body.status)));
}));

router.get("/operations/automations", asyncRoute(async (_req, res) => {
  res.json(ListOperationsAutomationsResponse.parse(await listOperationsAutomations(actorFrom(res))));
}));

router.post("/operations/automations/:automationId/run", asyncRoute(async (req, res) => {
  res.status(201).json(RunOperationsAutomationResponse.parse(await runOperationsAutomation(actorFrom(res), String(req.params.automationId))));
}));

router.get("/operations/notifications/preferences", asyncRoute(async (_req, res) => {
  res.json(GetOperationsNotificationPreferencesResponse.parse(await getOperationsNotificationPreferences(actorFrom(res))));
}));

router.patch("/operations/notifications/preferences", asyncRoute(async (req, res) => {
  const body = UpdateOperationsNotificationPreferencesBody.parse(req.body);
  res.json(UpdateOperationsNotificationPreferencesResponse.parse(await updateOperationsNotificationPreferences(actorFrom(res), body)));
}));

export default router;