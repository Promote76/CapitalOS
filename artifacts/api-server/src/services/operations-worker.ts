import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { households } from "@workspace/db/schema";
import { claimNextOperationsJob, completeOperationsJob, failOperationsJob, heartbeatOperationsWorker, startOperationsJob } from "./operations";

/** Internal advisory worker. It never invokes venues or money movement. */
export function startOperationsWorker() {
  if (process.env.OPERATIONS_WORKER_ENABLED !== "1") return () => undefined;
  const workerId = `api-worker:${randomUUID()}`;
  let stopping = false;
  const processJobs = async () => {
    if (stopping) return;
    try {
      await heartbeatOperationsWorker(workerId);
      const homes = await db.select({ id: households.id }).from(households);
      for (const home of homes) {
        if (stopping) break;
        const job = await claimNextOperationsJob(home.id, workerId);
        if (!job) continue;
        try {
          const running = await startOperationsJob(job.id, home.id, workerId);
          if (!running) continue;
          if (job.kind !== "SAFE_AUTOMATION" && job.kind !== "ADVISORY" && job.kind !== "RECONCILIATION") {
            throw new Error(`Unsupported worker job kind: ${job.kind}`);
          }
          // These kinds only persist reports/tasks/alerts. No payload can
          // authorize money, venue, brokerage, Micro-Live, or AI execution.
          await completeOperationsJob(job.id, home.id, workerId);
        } catch (error) {
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
  };
}

export { claimNextOperationsJob, completeOperationsJob, failOperationsJob, startOperationsJob };