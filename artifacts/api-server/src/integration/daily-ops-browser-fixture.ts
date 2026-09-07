import { and, eq } from "drizzle-orm";
import {
  db,
  familyOfficeRuns,
  householdMembers,
  operationsTasks,
  users,
} from "@workspace/db";

const markerFor = (runId: string) => `daily-ops-browser:${runId}`;
const today = () => new Date().toISOString().slice(0, 10);

export async function setupDailyOpsBrowserFixture(externalAuthId: string, runId: string) {
  const [identity] = await db
    .select({ userId: users.id, householdId: householdMembers.householdId })
    .from(users)
    .innerJoin(householdMembers, and(
      eq(householdMembers.userId, users.id),
      eq(householdMembers.active, true),
    ))
    .where(and(eq(users.externalAuthId, externalAuthId), eq(users.status, "active")));
  if (!identity) throw new Error(`Expected an active household membership for ${externalAuthId}`);

  const marker = markerFor(runId);
  const [task] = await db.insert(operationsTasks).values({
    householdId: identity.householdId,
    title: `${marker} task`,
    description: "Household-scoped Daily Ops browser certification task.",
    domain: "ACCOUNTING",
    priority: "HIGH",
    status: "OPEN",
    dueDate: today(),
    createdBy: identity.userId,
    source: "USER",
    requiresApproval: false,
  }).returning({ id: operationsTasks.id });
  const [providerRun] = await db.insert(familyOfficeRuns).values({
    householdId: identity.householdId,
    analyst: "Daily Ops browser fixture",
    scope: marker,
    status: "blocked",
    providerStatus: "unavailable",
    errorCode: "AI_PROVIDER_UPSTREAM_ERROR",
    outputSummary: null,
    createdBy: identity.userId,
    completedAt: new Date(),
  }).returning({ id: familyOfficeRuns.id });
  if (!task?.id || !providerRun?.id) throw new Error("Could not create the Daily Ops browser fixture");
  return { ...identity, marker, taskId: task.id, providerRunId: providerRun.id };
}

export async function cleanupDailyOpsBrowserFixture(runId: string) {
  const marker = markerFor(runId);
  await db.transaction(async (tx) => {
    await tx.delete(operationsTasks).where(eq(operationsTasks.title, `${marker} task`));
    await tx.delete(familyOfficeRuns).where(eq(familyOfficeRuns.scope, marker));
  });
}