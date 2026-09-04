import { claimNextOperationsJob, completeOperationsJob, failOperationsJob, heartbeatOperationsWorker, startOperationsJob } from "../services/operations.ts";

const householdId = process.env.CAPITAL_OS_PROBE_HOUSEHOLD_ID;
const workerId = process.env.CAPITAL_OS_PROBE_WORKER_ID;
const mode = process.env.CAPITAL_OS_PROBE_MODE ?? "hold";
const jobId = process.env.CAPITAL_OS_PROBE_JOB_ID;

if (!householdId || !workerId) {
  throw new Error("Probe requires CAPITAL_OS_PROBE_HOUSEHOLD_ID and CAPITAL_OS_PROBE_WORKER_ID");
}
const probeHouseholdId = householdId;
const probeWorkerId = workerId;

const send = (message: string) => process.stdout.write(`${message}\n`);
let activeJob: { id: string; householdId: string; workerId: string } | null = null;
let stopping = false;

async function claim() {
  const claimed = await claimNextOperationsJob(probeHouseholdId, probeWorkerId);
  if (!claimed || (jobId && claimed.id !== jobId)) {
    throw new Error("Probe could not claim the expected durable job");
  }
  const running = await startOperationsJob(claimed.id, probeHouseholdId, probeWorkerId);
  if (!running) throw new Error("Probe could not start the leased durable job");
  activeJob = { id: running.id, householdId: probeHouseholdId, workerId: probeWorkerId };
  await heartbeatOperationsWorker(probeWorkerId, running.id);
  send(`READY ${running.id}`);
}

async function finish(kind: "complete" | "relinquish") {
  if (stopping) return;
  stopping = true;
  if (activeJob) {
    if (kind === "complete") {
      await completeOperationsJob(activeJob.id, activeJob.householdId, activeJob.workerId);
    } else {
      await failOperationsJob(activeJob.id, activeJob.householdId, activeJob.workerId, new Error("worker graceful shutdown"));
    }
  }
  send("DONE");
  process.exit(0);
}

process.once("SIGTERM", () => {
  void finish("relinquish").catch(() => process.exit(1));
});
process.once("SIGINT", () => {
  void finish("relinquish").catch(() => process.exit(1));
});

await claim();
if (mode === "complete") {
  await finish("complete");
} else {
  const heartbeat = setInterval(() => {
    if (activeJob && !stopping) void heartbeatOperationsWorker(probeWorkerId, activeJob.id).catch(() => undefined);
  }, 500);
  process.once("exit", () => clearInterval(heartbeat));
  setInterval(() => undefined, 60_000);
}