import { expect, test } from "@playwright/test";
import { clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  householdMembers,
  households,
  operationsDecisionJournalEntries,
  operationsGuidedRunEvents,
  operationsGuidedRuns,
  users,
} from "@workspace/db";
import {
  cleanupDailyOpsBrowserFixture,
  setupDailyOpsBrowserFixture,
} from "../integration/daily-ops-browser-fixture.ts";

const permissions = ["read", "contribute", "transfer", "allocate", "approve", "manage_risk"];

test("authenticated Guided Run and journal history certifies persistence, isolation, and advisory boundaries", async ({ page }) => {
  const email = process.env.BROWSER_TEST_EMAIL;
  if (!email) throw new Error("BROWSER_TEST_EMAIL is required");
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) throw new Error("BROWSER_TEST_EMAIL must be a valid email address");

  const runId = randomUUID().slice(0, 12);
  const disposableEmail = `${localPart}+daily-ops-history-${runId}@${domain}`;
  const otherExternalAuthId = `daily-ops-history-isolation-${runId}`;
  const isolationMarker = `daily-ops-isolation:${runId}`;
  let disposableClerkUserId: string | undefined;
  let otherUserId: string | undefined;
  let otherHouseholdId: string | undefined;

  try {
    const disposableUser = await clerkClient.users.createUser({
      emailAddress: [disposableEmail],
      firstName: "Daily Ops history",
      lastName: "browser fixture",
      skipPasswordRequirement: true,
    });
    disposableClerkUserId = disposableUser.id;
    const ticket = await clerkClient.signInTokens.createSignInToken({
      userId: disposableUser.id,
      expiresInSeconds: 60,
    });
    await page.goto(`/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`);
    await expect(page).not.toHaveURL(/\/sign-in/);

    const onboarding = page.getByRole("heading", { name: /set up your household/i });
    await expect(onboarding.or(page.locator(".session-controls"))).toBeVisible();
    if (await onboarding.isVisible()) {
      await page.getByLabel("Household name").fill(`Daily Ops history browser ${runId}`);
      const onboarded = page.waitForResponse((response) =>
        response.url().endsWith("/api/auth/onboard") && response.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Create household" }).click();
      expect((await onboarded).ok()).toBe(true);
      await expect(onboarding).not.toBeVisible();
    }

    const fixture = await setupDailyOpsBrowserFixture(disposableUser.id, runId);

    const [otherUser] = await db.insert(users).values({
      email: `${otherExternalAuthId}@capitalos.test`,
      externalAuthId: otherExternalAuthId,
      displayName: "Daily Ops isolation fixture",
      status: "active",
    }).returning({ id: users.id });
    const [otherHousehold] = await db.insert(households).values({
      name: `Daily Ops isolation ${runId}`,
      timezone: "America/Chicago",
    }).returning({ id: households.id });
    if (!otherUser?.id || !otherHousehold?.id) throw new Error("Could not create the isolation fixture");
    otherUserId = otherUser.id;
    otherHouseholdId = otherHousehold.id;
    await db.insert(householdMembers).values({
      householdId: otherHousehold.id,
      userId: otherUser.id,
      role: "owner",
      permissions,
      active: true,
    });
    const [otherRun] = await db.insert(operationsGuidedRuns).values({
      householdId: otherHousehold.id,
      runDate: new Date().toISOString().slice(0, 10),
      cadence: "TODAY",
      status: "BLOCKED",
      latestReason: isolationMarker,
      createdBy: otherUser.id,
      updatedBy: otherUser.id,
    }).returning({ id: operationsGuidedRuns.id });
    if (!otherRun?.id) throw new Error("Could not create the isolation Guided Run");
    await db.insert(operationsGuidedRunEvents).values({
      householdId: otherHousehold.id,
      guidedRunId: otherRun.id,
      idempotencyKey: `isolation-${runId}`,
      action: "BLOCK",
      reason: isolationMarker,
      actorId: otherUser.id,
    });
    await db.insert(operationsDecisionJournalEntries).values({
      householdId: otherHousehold.id,
      actorId: otherUser.id,
      entryType: "HANDOFF",
      title: isolationMarker,
      decisionContext: "This record must stay in the other household.",
      evidenceLinks: ["https://example.com/other-household"],
      unresolvedBlockers: ["Other household blocker"],
    });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/daily-ops");
    await expect(page.getByRole("heading", { name: /Run the house with context/i })).toBeVisible();
    await expect(page.getByText("Advisory only", { exact: true })).toBeVisible();
    await expect(page.getByText(/household review history; authoritative decisions remain in their source systems/i)).toBeVisible();
    await expect(page.getByText(/not a substitute for the authoritative destination/i)).toBeVisible();
    await expect(page.getByText(isolationMarker)).not.toBeVisible();

    const runReason = page.getByLabel("Reason for Guided Run action");
    const runActions = page.locator(".daily-ops-run-actions");
    await runReason.fill("Started the review handoff with current source evidence.");
    await runActions.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText(/Guided Run the Day · In Progress/i)).toBeVisible();

    await runReason.fill("Source review completed and ready for closeout.");
    await runActions.getByRole("button", { name: "Complete" }).click();
    await expect(page.getByText(/Guided Run the Day · Completed/i)).toBeVisible();

    await runReason.fill("A reviewer reopened the handoff for one more source check.");
    await runActions.getByRole("button", { name: "Reopen" }).click();
    await expect(page.getByText(/Guided Run the Day · Reopened/i)).toBeVisible();

    await runReason.fill("The evidence package is missing a final source receipt.");
    await runActions.getByRole("button", { name: "Block" }).click();
    await expect(page.getByText(/Guided Run the Day · Blocked/i)).toBeVisible();

    await page.getByLabel("Guided Run snooze until").fill("2099-01-01T09:00");
    await runReason.fill("Snoozed until the missing source receipt is available.");
    await runActions.getByRole("button", { name: "Snooze" }).click();
    await expect(page.getByText(/Guided Run the Day · Snoozed/i)).toBeVisible();

    const handoffTitle = `Browser handoff ${runId}`;
    await page.getByLabel("Journal entry type").selectOption("HANDOFF");
    await page.getByLabel("Journal entry title").fill(handoffTitle);
    await page.getByLabel("Decision context").fill("Pass the source review context to the next operator without changing financial authority.");
    await page.getByLabel("Outcome").fill("Review handoff recorded");
    await page.getByLabel("Evidence links").fill("https://example.com/source-receipt");
    await page.getByLabel("Unresolved blockers").fill("Final source receipt");
    await page.getByRole("button", { name: "Save handoff note" }).click();
    await expect(page.getByText(handoffTitle)).toBeVisible();
    await expect(page.getByText("Evidence: 1 link")).toBeVisible();
    await expect(page.getByText("Blockers: Final source receipt")).toBeVisible();

    const closeoutTitle = `Browser closeout ${runId}`;
    await page.getByLabel("Journal entry type").selectOption("CLOSEOUT");
    await page.getByLabel("Journal entry title").fill(closeoutTitle);
    await page.getByLabel("Decision context").fill("Close the review cycle while preserving the unresolved blocker for the next operator.");
    await page.getByLabel("Outcome").fill("Closeout recorded for review");
    await page.getByLabel("Evidence links").fill("https://example.com/closeout-receipt");
    await page.getByLabel("Unresolved blockers").fill("Reconcile provider receipt");
    await page.getByRole("button", { name: "Save handoff note" }).click();
    await expect(page.getByText(closeoutTitle)).toBeVisible();
    await expect(page.getByText("Blockers: Reconcile provider receipt")).toBeVisible();

    await page.reload();
    await expect(page.getByText(handoffTitle)).toBeVisible();
    await expect(page.getByText(closeoutTitle)).toBeVisible();
    await expect(page.getByText("Evidence: 1 link")).toHaveCount(2);
    await expect(page.getByText("Blockers: Final source receipt")).toBeVisible();
    await expect(page.getByText("Blockers: Reconcile provider receipt")).toBeVisible();
    await expect(page.getByText(isolationMarker)).not.toBeVisible();

    const history = await page.evaluate(async () => {
      const response = await fetch("/api/operations/daily-ops");
      if (!response.ok) throw new Error(`Daily Ops history request failed: ${response.status}`);
      return response.json();
    }) as {
      journalEntries: Array<Record<string, unknown>>;
      guidedRuns: Array<Record<string, unknown> & { events: Array<Record<string, unknown>> }>;
    };
    const ownJournalTitles = history.journalEntries.map((entry) => entry.title);
    expect(ownJournalTitles).toEqual(expect.arrayContaining([handoffTitle, closeoutTitle]));
    expect(ownJournalTitles).not.toContain(isolationMarker);
    const ownRun = history.guidedRuns.find((run) => run.cadence === "TODAY");
    expect(ownRun).toBeDefined();
    expect(ownRun?.events.map((event) => event.action)).toEqual(expect.arrayContaining(["START", "COMPLETE", "REOPEN", "BLOCK", "SNOOZE"]));
    expect(JSON.stringify(history)).not.toMatch(/financialImpact|orderId|transferId|allocationId/i);
    expect(history.journalEntries.every((entry) => !("householdId" in entry))).toBe(true);
    expect(history.guidedRuns.every((run) => !("householdId" in run))).toBe(true);

    console.log(JSON.stringify({
      gate: "BROWSER-GUIDED-RUN-JOURNAL",
      authenticated: true,
      guidedRunActions: "START_COMPLETE_REOPEN_BLOCK_SNOOZE",
      requiredReasons: "PASS",
      journalReloadPersistence: "PASS",
      evidenceAndBlockers: "PASS",
      householdIsolation: "PASS",
      advisoryOnly: "PASS",
    }));
  } finally {
    await cleanupDailyOpsBrowserFixture(runId);
    if (otherHouseholdId) {
      await db.delete(householdMembers).where(eq(householdMembers.householdId, otherHouseholdId));
      await db.delete(households).where(eq(households.id, otherHouseholdId));
    }
    if (otherUserId) {
      await db.delete(users).where(and(eq(users.id, otherUserId), eq(users.externalAuthId, otherExternalAuthId)));
    }
    if (disposableClerkUserId) await clerkClient.users.deleteUser(disposableClerkUserId);
  }
});