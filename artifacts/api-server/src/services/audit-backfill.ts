import { createHash } from "node:crypto";
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditEventArchive, auditEvents, auditBackfillState, auditVerificationState, auditChainHeads } from "@workspace/db/schema";
import { canonicalAuditJson, AUDIT_CANONICAL_VERSION } from "./audit";

const SCOPE = "legacy-v1";
export const AUDIT_VERIFICATION_MAX_AGE_MS = 5 * 60_000;

/** One tamper-sensitive marker shared by verification and readiness. */
export async function currentAuditMarker(executor: any = db) {
  const events = await executor.select().from(auditEvents).orderBy(asc(auditEvents.chainKey), asc(auditEvents.sequence), asc(auditEvents.id));
  const archives = await executor.select().from(auditEventArchive).orderBy(asc(auditEventArchive.chainKey), asc(auditEventArchive.sequence), asc(auditEventArchive.eventId));
  const heads = await executor.select().from(auditChainHeads).orderBy(asc(auditChainHeads.chainKey));
  const value = JSON.stringify({ events, archives, heads }, (_key, v) => v instanceof Date ? v.toISOString() : v);
  return createHash("sha256").update(value).digest("hex");
}

export async function verifyAuditIntegrity() {
  return db.transaction(async (tx) => {
    const events = await tx.select().from(auditEvents).orderBy(asc(auditEvents.chainKey), asc(auditEvents.sequence), asc(auditEvents.id));
    const archives = await tx.select().from(auditEventArchive);
    const archiveById = new Map(archives.map((row) => [row.eventId, row]));
    const tails = new Map<string, { sequence: number; hash: string }>();
    let failureReason: string | null = null;
    for (const row of events) {
      if (!row.chainKey || row.sequence == null || !row.eventHash) {
        failureReason = `LEGACY_UNBACKFILLED:${row.id}`; break;
      }
      const key = row.chainKey;
      const tail = tails.get(key);
      if ((tail ? row.sequence !== tail.sequence + 1 || row.previousHash !== tail.hash : row.sequence !== 1 || row.previousHash !== null)) {
        failureReason = `CHAIN_LINK_INVALID:${row.id}`; break;
      }
      const payload = { canonicalVersion: row.canonicalVersion, id: row.id, householdId: row.householdId, chainScope: row.chainScope, chainKey: row.chainKey, sequence: row.sequence, eventType: row.eventType, actor: row.actor, entity: row.entity, entityId: row.entityId, beforeState: row.beforeState ?? null, afterState: row.afterState ?? null, reason: row.reason ?? null, metadata: row.metadata ?? {}, timestamp: row.timestamp.toISOString(), previousHash: row.previousHash };
      const digest = createHash("sha256").update(canonicalAuditJson(payload)).digest("hex");
      if (digest !== row.eventHash) { failureReason = `DIGEST_INVALID:${row.id}`; break; }
      const archive = archiveById.get(row.id);
      if (!archive || archive.eventHash !== row.eventHash || archive.sequence !== row.sequence || archive.householdId !== row.householdId || archive.eventType !== row.eventType || archive.actor !== row.actor || archive.entity !== row.entity || archive.entityId !== row.entityId || archive.reason !== row.reason || archive.canonicalVersion !== row.canonicalVersion || archive.chainScope !== row.chainScope || archive.chainKey !== row.chainKey || archive.previousHash !== row.previousHash || canonicalAuditJson(archive.beforeState) !== canonicalAuditJson(row.beforeState) || canonicalAuditJson(archive.afterState) !== canonicalAuditJson(row.afterState) || canonicalAuditJson(archive.metadata) !== canonicalAuditJson(row.metadata) || archive.eventTimestamp.getTime() !== row.timestamp.getTime()) {
        failureReason = `ARCHIVE_PARITY_INVALID:${row.id}`; break;
      }
      tails.set(key, { sequence: row.sequence, hash: row.eventHash });
    }
    if (!failureReason) {
      if (archives.some((archive) => !events.some((event) => event.id === archive.eventId))) failureReason = "ARCHIVE_EXTRA_ROW";
      const heads = await tx.select().from(auditChainHeads);
      if (heads.length !== tails.size || heads.some((head) => !head.chainKey || tails.get(head.chainKey)?.sequence !== head.sequence || tails.get(head.chainKey)?.hash !== head.eventHash)) failureReason = "CHAIN_HEAD_INVALID";
    }
    const latest = events.at(-1)?.timestamp ?? null;
    const digest = await currentAuditMarker(tx);
    await tx.insert(auditVerificationState).values({ scope: SCOPE, status: failureReason ? "FAIL" : "PASS", verifiedAt: new Date(), sourceCount: events.length, archiveCount: archives.length, highWaterTimestamp: latest, highWaterDigest: digest, failureReason, updatedAt: new Date() }).onConflictDoUpdate({ target: auditVerificationState.scope, set: { status: failureReason ? "FAIL" : "PASS", verifiedAt: new Date(), sourceCount: events.length, archiveCount: archives.length, highWaterTimestamp: latest, highWaterDigest: digest, failureReason, updatedAt: new Date() } });
    return { status: failureReason ? "FAIL" : "PASS", sourceCount: events.length, archiveCount: archives.length, failureReason };
  });
}

/** Processes at most limit rows; operators may safely call this repeatedly. */
export async function runAuditBackfill(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("AUDIT_BACKFILL_LIMIT_INVALID");
  let result: { status: string; processed: number; remaining: boolean };
  try {
    result = await db.transaction(async (tx) => {
      // Lock (and create) the coordination row before selecting any source rows.
      await tx.insert(auditBackfillState).values({ scope: SCOPE, status: "PENDING", processed: 0, updatedAt: new Date() }).onConflictDoNothing();
      const [state] = await tx.select().from(auditBackfillState).where(eq(auditBackfillState.scope, SCOPE)).for("update");
      if (!state) throw new Error("AUDIT_BACKFILL_STATE_MISSING");
      if (state.status === "COMPLETE") return { status: "COMPLETE", processed: 0, remaining: false };
      const cursor = state.cursor ? JSON.parse(state.cursor) as { householdId: string; timestamp: string; id: string } : null;
      const afterCursor = cursor ? or(
        gt(auditEvents.householdId, cursor.householdId),
        and(eq(auditEvents.householdId, cursor.householdId), gt(auditEvents.timestamp, new Date(cursor.timestamp))),
        and(eq(auditEvents.householdId, cursor.householdId), eq(auditEvents.timestamp, new Date(cursor.timestamp)), gt(auditEvents.id, cursor.id)),
      ) : undefined;
      const pending = or(isNull(auditEvents.eventHash), eq(auditEvents.eventHash, ""));
      const where = afterCursor ? and(pending, afterCursor) : pending;
      const rows = await tx.select().from(auditEvents).where(where)
        .orderBy(asc(auditEvents.householdId), asc(auditEvents.timestamp), asc(auditEvents.id)).limit(limit).for("update");
      let processed = 0;
      let lastCursor = cursor;
      for (const row of rows) {
        const chainKey = row.chainKey || `household:legacy-v1:${row.householdId}`;
        const [head] = await tx.select().from(auditChainHeads).where(eq(auditChainHeads.chainKey, chainKey)).for("update");
        const sequence = row.sequence ?? ((head?.sequence ?? 0) + 1);
        const previous = sequence > 1
          ? (await tx.select({ eventHash: auditEvents.eventHash }).from(auditEvents).where(and(eq(auditEvents.chainKey, chainKey), eq(auditEvents.sequence, sequence - 1))).limit(1))[0]?.eventHash ?? null
          : null;
        if (sequence > 1 && !previous) throw new Error(`AUDIT_PREDECESSOR_MISSING:${row.id}`);
        const payload = { canonicalVersion: AUDIT_CANONICAL_VERSION, id: row.id, householdId: row.householdId, chainScope: "legacy-v1", chainKey, sequence, eventType: row.eventType, actor: row.actor, entity: row.entity, entityId: row.entityId, beforeState: row.beforeState ?? null, afterState: row.afterState ?? null, reason: row.reason ?? null, metadata: row.metadata ?? {}, timestamp: row.timestamp.toISOString(), previousHash: previous };
        const eventHash = createHash("sha256").update(canonicalAuditJson(payload)).digest("hex");
        const [archive] = await tx.select().from(auditEventArchive).where(eq(auditEventArchive.eventId, row.id)).limit(1);
        if (archive && (archive.householdId !== row.householdId || archive.eventType !== row.eventType || archive.actor !== row.actor || archive.entity !== row.entity || archive.entityId !== row.entityId || archive.reason !== row.reason || canonicalAuditJson(archive.beforeState) !== canonicalAuditJson(row.beforeState) || canonicalAuditJson(archive.afterState) !== canonicalAuditJson(row.afterState) || canonicalAuditJson(archive.metadata) !== canonicalAuditJson(row.metadata) || archive.eventTimestamp.getTime() !== row.timestamp.getTime())) {
          throw new Error(`AUDIT_ARCHIVE_SOURCE_MISMATCH:${row.id}`);
        }
        await tx.update(auditEvents).set({ canonicalVersion: AUDIT_CANONICAL_VERSION, chainScope: "legacy-v1", chainKey, sequence, previousHash: previous, eventHash }).where(eq(auditEvents.id, row.id));
        if (!archive) {
          await tx.insert(auditEventArchive).values({ eventId: row.id, householdId: row.householdId, eventType: row.eventType, actor: row.actor, entity: row.entity, entityId: row.entityId, beforeState: row.beforeState, afterState: row.afterState, reason: row.reason, metadata: row.metadata, eventTimestamp: row.timestamp, archivedAt: new Date(), canonicalVersion: AUDIT_CANONICAL_VERSION, chainScope: "legacy-v1", chainKey, sequence, previousHash: previous, eventHash });
        } else {
          await tx.update(auditEventArchive).set({ canonicalVersion: AUDIT_CANONICAL_VERSION, chainScope: "legacy-v1", chainKey, sequence, previousHash: previous, eventHash }).where(eq(auditEventArchive.eventId, row.id));
        }
        await tx.insert(auditChainHeads).values({ chainKey, chainScope: "legacy-v1", householdId: row.householdId, sequence, eventHash, updatedAt: new Date() }).onConflictDoUpdate({ target: auditChainHeads.chainKey, set: { sequence, eventHash, updatedAt: new Date() } });
        processed++;
        lastCursor = { householdId: row.householdId, timestamp: row.timestamp.toISOString(), id: row.id };
      }
      const [remaining] = await tx.select({ id: auditEvents.id }).from(auditEvents).where(or(isNull(auditEvents.eventHash), eq(auditEvents.eventHash, ""))).limit(1);
      const complete = !remaining;
      await tx.update(auditBackfillState).set({ status: complete ? "PAUSED" : "PAUSED", cursor: lastCursor ? JSON.stringify(lastCursor) : state.cursor, processed: state.processed + processed, completedAt: null, lastError: null, startedAt: state.startedAt ?? new Date(), updatedAt: new Date() }).where(eq(auditBackfillState.scope, SCOPE));
      return { status: "PAUSED", processed, remaining: !complete };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(auditBackfillState).set({ status: "FAILED", lastError: message, updatedAt: new Date() }).where(eq(auditBackfillState.scope, SCOPE));
    throw error;
  }
  if (!result.remaining) {
    const verification = await verifyAuditIntegrity();
    if (verification.status === "PASS") {
      await db.update(auditBackfillState).set({ status: "COMPLETE", completedAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(auditBackfillState.scope, SCOPE));
      result.status = "COMPLETE";
    } else {
      await db.update(auditBackfillState).set({ status: "FAILED", lastError: verification.failureReason, updatedAt: new Date() }).where(eq(auditBackfillState.scope, SCOPE));
      result.status = "FAILED";
    }
  }
  return result;
}

export async function getAuditBackfillStatus() {
  const [state] = await db.select().from(auditBackfillState).where(eq(auditBackfillState.scope, SCOPE)).limit(1);
  return state ?? { scope: SCOPE, status: "PENDING", processed: 0, cursor: null };
}

/** Read-only verification used by readiness and operator diagnostics. */
export async function verifyAuditParity() {
  const result = await db.execute<{ missing_archive: number; missing_digest: number; bad_sequence: number; bad_head: number }>(sql`
    select
      (select count(*) from audit_events e left join audit_events_archive a on a.event_id = e.id::text where a.event_id is null)::int as missing_archive,
      (select count(*) from audit_events where event_hash is null or event_hash = '')::int as missing_digest,
      (select count(*) from audit_events e left join audit_events p
        on p.chain_key = e.chain_key and p.sequence = e.sequence - 1
        where e.sequence > 1 and (p.id is null or e.previous_hash <> p.event_hash))::int as bad_sequence,
      (select count(*) from audit_chain_heads h left join audit_events e
        on e.chain_key = h.chain_key and e.sequence = h.sequence
        where e.id is null or h.event_hash <> e.event_hash)::int as bad_head
  `);
  const row = result.rows[0];
  return {
    parity: Number(row?.missing_archive ?? 0) === 0,
    digest: Number(row?.missing_digest ?? 0) === 0,
    chain: Number(row?.bad_sequence ?? 0) === 0 && Number(row?.bad_head ?? 0) === 0,
    ...row,
  };
}