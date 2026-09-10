import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { households } from "@workspace/db/schema";
import { claimNextOperationsJob, completeOperationsJob, failOperationsJob, heartbeatOperationsWorker, recoverStaleOperationsJobs, startOperationsJob } from "./operations";
import { dispatchQueuedAlertDelivery } from "./observability-alerts";

/** Internal advisory worker. It never invokes venues or money movement. */
export function startOperationsWorker() {
  if (process.env.OPERATIONS_WORKER_ENABLED !== "1") return () => undefined;
  const workerId = `api-worker:${randomUUID()}`;
  let stopping = false;
  let activeJob: { id: string; householdId: string } | null = null;
  const processJobs = async () => {
    if (stopping) return;
    try {
      await heartbeatOperationsWorker(workerId);
      const homes = await db.select({ id: households.id }).from(households);
      for (const home of homes) {
        if (stopping) break;
        // Recovery is deliberately bounded by the persisted lease. It never
        // executes a job; it only makes abandoned advisory work claimable.
        await recoverStaleOperationsJobs(home.id);
        const job = await claimNextOperationsJob(home.id, workerId);
        if (!job) continue;
        let leaseHeartbeat: NodeJS.Timeout | null = null;
        try {
          const running = await startOperationsJob(job.id, home.id, workerId);
          if (!running) continue;
          activeJob = { id: running.id, householdId: home.id };
          await heartbeatOperationsWorker(workerId, running.id);
          leaseHeartbeat = setInterval(() => {
            if (!stopping) void heartbeatOperationsWorker(workerId, running.id).catch(() => undefined);
          }, 30_000);
          if (job.kind === "ALERT_DELIVERY") {
            const incidentId = typeof job.payload.incidentId === "string" ? job.payload.incidentId : null;
            if (!incidentId) throw new Error("ALERT_DELIVERY_PAYLOAD_INVALID");
            await dispatchQueuedAlertDelivery(home.id, incidentId);
          } else if (job.kind !== "SAFE_AUTOMATION" && job.kind !== "ADVISORY" && job.kind !== "RECONCILIATION") {
            throw new Error(`Unsupported worker job kind: ${job.kind}`);
          }
          // These kinds only persist reports/tasks/alerts. No payload can
          // authorize money, venue, brokerage, Micro-Live, or AI execution.
          await completeOperationsJob(job.id, home.id, workerId);
          clearInterval(leaseHeartbeat);
          leaseHeartbeat = null;
          activeJob = null;
        } catch (error) {
          if (leaseHeartbeat) clearInterval(leaseHeartbeat);
          activeJob = null;
          await failOperationsJob(job.id, home.id, workerId, error);
        }
      }
    } catch {
      // A transient database outage must not terminate the process or create
      // an in-memory source of truth. The next tick retries the heartbeat.
    }
  };
  const timer = setInterval(() => void processJobs(), 2_000);
  void processJobs();
  return () => {
    stopping = true;
    clearInterval(timer);
    // Relinquish an in-flight advisory job rather than leaving it leased
    // until expiry. This is best-effort and never executes external work.
    if (activeJob) {
      void failOperationsJob(activeJob.id, activeJob.householdId, workerId, new Error("worker graceful shutdown")).catch(() => undefined);
      activeJob = null;
    }
  };
}

export { claimNextOperationsJob, completeOperationsJob, failOperationsJob, startOperationsJob };