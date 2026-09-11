import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { auditChainHeads, auditEventArchive, auditEvents } from "@workspace/db/schema";

export const AUDIT_CANONICAL_VERSION = 1;

export type AuditInput = {
  householdId: string;
  eventType: string;
  actor: string;
  entity: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  id?: string;
  idempotencyKey?: string;
  chainKind?: "household" | "system";
  /** @deprecated arbitrary scopes are no longer accepted. */
  chainScope?: never;
  timestamp?: Date;
};

/** Canonical JSON is deliberately small, deterministic, and versioned. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort()
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

type AuditExecutor = any;

async function appendInTransaction(input: AuditInput, tx: AuditExecutor) {
  if (input.chainScope !== undefined) throw new Error("AUDIT_CHAIN_SCOPE_UNSUPPORTED");
  // Service/system actors are intentionally isolated from authenticated users.
  // Callers handling a user request must pass an explicit household kind.
  const chainKind = input.chainKind ?? (input.actor === "system" ? "system" : "household");
  if (chainKind !== "household" && chainKind !== "system") throw new Error("AUDIT_CHAIN_KIND_INVALID");
  const scope = chainKind;
  const chainKey = chainKind === "system" ? "system:v1" : `household:v1:${input.householdId}`;
  const timestamp = input.timestamp ?? new Date();
  const householdId = input.householdId;
  // INSERT ... ON CONFLICT creates the coordination row exactly once. The
  // subsequent SELECT FOR UPDATE is the serialization point, including for
  // the first append when no head existed yet.
  await tx.insert(auditChainHeads).values({
    chainKey, chainScope: scope, householdId: chainKind === "system" ? "system" : householdId,
    sequence: 0, eventHash: null, updatedAt: new Date(),
  }).onConflictDoNothing();
  const [head] = await tx.select().from(auditChainHeads).where(and(
    eq(auditChainHeads.chainKey, chainKey),
  )).limit(1).for("update");
  const sequence = (head?.sequence ?? 0) + 1;
  const previousHash = head?.eventHash ?? null;
  const id = input.id ?? randomUUID();
  const payload = {
    canonicalVersion: AUDIT_CANONICAL_VERSION,
    id, householdId, chainScope: scope, chainKey, sequence,
    eventType: input.eventType, actor: input.actor, entity: input.entity,
    entityId: input.entityId, beforeState: input.beforeState ?? null,
    afterState: input.afterState ?? null, reason: input.reason ?? null,
    metadata: input.metadata ?? {}, timestamp: timestamp.toISOString(), previousHash,
  };
  const eventHash = createHash("sha256").update(canonical(payload)).digest("hex");
  const existingRows = await tx.select().from(auditEvents).where(input.idempotencyKey
    ? and(eq(auditEvents.householdId, householdId), eq(auditEvents.idempotencyKey, input.idempotencyKey))
    : eq(auditEvents.id, id)).limit(1);
  if (existingRows[0]) {
    const existing = existingRows[0];
    const replayPayload = {
      canonicalVersion: existing.canonicalVersion, id: existing.id,
      householdId: existing.householdId, chainScope: existing.chainScope, chainKey: existing.chainKey,
      sequence: existing.sequence, eventType: input.eventType, actor: input.actor,
      entity: input.entity, entityId: input.entityId,
      beforeState: input.beforeState ?? null, afterState: input.afterState ?? null,
      reason: input.reason ?? null, metadata: input.metadata ?? {},
      timestamp: existing.timestamp.toISOString(), previousHash: existing.previousHash,
    };
    const replayHash = createHash("sha256").update(canonical(replayPayload)).digest("hex");
    if (existing.eventHash !== replayHash || existing.eventType !== input.eventType
      || existing.actor !== input.actor || existing.entity !== input.entity
      || existing.entityId !== input.entityId
      || canonical(existing.beforeState) !== canonical(input.beforeState ?? null)
      || canonical(existing.afterState) !== canonical(input.afterState ?? null)
      || canonical(existing.metadata) !== canonical(input.metadata ?? {})
      || existing.reason !== (input.reason ?? null)) {
      throw new Error("AUDIT_IDEMPOTENCY_CONFLICT");
    }
    const [archive] = await tx.select().from(auditEventArchive).where(eq(auditEventArchive.eventId, existing.id)).limit(1);
    if (!archive) {
      throw new Error("AUDIT_ARCHIVE_MISSING");
    } else if (archive.eventHash !== existing.eventHash || archive.sequence !== existing.sequence
      || archive.canonicalVersion !== existing.canonicalVersion
      || archive.chainScope !== existing.chainScope || archive.previousHash !== existing.previousHash
      || archive.householdId !== existing.householdId || archive.eventType !== existing.eventType
      || archive.actor !== existing.actor || archive.entity !== existing.entity
      || archive.entityId !== existing.entityId || archive.reason !== existing.reason
      || canonical(archive.beforeState) !== canonical(existing.beforeState)
      || canonical(archive.afterState) !== canonical(existing.afterState)
      || canonical(archive.metadata) !== canonical(existing.metadata)
      || archive.eventTimestamp.getTime() !== existing.timestamp.getTime()) {
      throw new Error("AUDIT_ARCHIVE_CONFLICT");
    }
    return existing;
  }
  const [event] = await tx.insert(auditEvents).values({
    id, householdId, eventType: input.eventType, actor: input.actor,
    entity: input.entity, entityId: input.entityId, beforeState: input.beforeState,
    afterState: input.afterState, reason: input.reason, metadata: input.metadata ?? {},
    timestamp, canonicalVersion: AUDIT_CANONICAL_VERSION, chainScope: scope, chainKey,
    sequence, previousHash, eventHash, idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing({ target: input.idempotencyKey
    ? [auditEvents.householdId, auditEvents.idempotencyKey]
    : auditEvents.id }).returning();
  if (!event) throw new Error("AUDIT_IDEMPOTENCY_RACE");
  await tx.insert(auditEventArchive).values({
    eventId: id, householdId, eventType: input.eventType, actor: input.actor,
    entity: input.entity, entityId: input.entityId, beforeState: input.beforeState,
    afterState: input.afterState, reason: input.reason, metadata: input.metadata ?? {},
    eventTimestamp: timestamp, archivedAt: new Date(),
    canonicalVersion: AUDIT_CANONICAL_VERSION, chainScope: scope, chainKey, sequence,
    previousHash, eventHash,
  });
  await tx.insert(auditChainHeads).values({
    chainKey, chainScope: scope, householdId: chainKind === "system" ? "system" : householdId,
    sequence, eventHash, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: auditChainHeads.chainKey,
    set: { sequence, eventHash, updatedAt: new Date() },
  });
  return event;
}

/** The only supported production audit write boundary. Existing transactions may be supplied. */
export async function appendAuditEvent(input: AuditInput, executor?: AuditExecutor) {
  if (executor) return appendInTransaction(input, executor);
  return db.transaction((tx) => appendInTransaction(input, tx));
}

export async function appendAuditEvents(inputs: AuditInput[], executor?: AuditExecutor) {
  const run = async (tx: AuditExecutor) => {
    const events = [];
    for (const input of inputs) events.push(await appendInTransaction(input, tx));
    return events;
  };
  if (executor) return run(executor);
  return db.transaction(run);
}

export { canonical as canonicalAuditJson };