import { appendAuditEvent, appendAuditEvents } from "./audit";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditEvents,
  accounts,
  executionFills,
  fillSnapshots,
  guardianHeartbeats,
  microLivePolicies,
  microLiveSessions,
  ledgerEntries,
  ledgerTransactions,
  orderEvents,
  orderIntents,
  positionSnapshots,
  postIncidentReviews,
  reactivationRequirements,
  reconciliationRuns,
  tradingIncidents,
  venueRegistry,
  venueOrders,
  venueBalanceSnapshots,
} from "@workspace/db";
import { db } from "@workspace/db";
import {
  calculateLiveReadiness,
  buildClientOrderId,
  canTransitionOrder,
  deduplicateVenueFills,
  defaultMicroLivePolicy,
  evaluateLiveEnablement,
  firstFillHoldDecision,
  guardianDecision,
  recoverExecutionState,
  reconcileExecutionState,
  runLiveRehearsal,
  validatePreTrade,
} from "../domain/execution-oms";
import {
  evaluateVenueApproval,
  isIndependentReviewReference,
  isReviewedVenueAdapterRegistered,
  isServerCredentialReference,
  SimulatedVenueAdapter,
} from "../domain/execution-adapters";
import type { VenueAdapter, VenueFill, VenueOrder } from "../domain/execution-adapters";
import { assertPermission, GovernanceError } from "../domain/governance";
import { armExecutionControl, assertExecutionPermitted } from "./execution-control";
import { ensureSeedData, ensureTenantCore } from "./seed";
import type { Actor } from "./capital-os";

function policyLimits() {
  return {
    ...defaultMicroLivePolicy,
    initialCapitalCents: defaultMicroLivePolicy.initialCapitalCents,
  };
}

async function ensureMicroLiveSeed(actor?: Actor) {
  const ids = actor
    ? await ensureTenantCore(actor.householdId, actor.userId)
    : await ensureSeedData();
  let [policy] = await db.select().from(microLivePolicies).where(eq(microLivePolicies.householdId, ids.householdId)).limit(1);
  if (!policy) {
    [policy] = await db.insert(microLivePolicies).values({
      householdId: ids.householdId,
      limits: policyLimits(),
      autoScale: false,
      leverageEnabled: false,
      marginEnabled: false,
      borrowingEnabled: false,
    }).returning();
  }

  let venues = await db.select().from(venueRegistry).where(eq(venueRegistry.householdId, ids.householdId)).orderBy(venueRegistry.name);
  if (venues.length === 0) {
    venues = await db.insert(venueRegistry).values([
      {
        householdId: ids.householdId,
        name: "Simulated venue adapter",
        adapterType: "simulated",
        status: "Approved for Paper",
        capabilities: {
          spot: true,
          makerOrders: true,
          marketOrders: true,
          postOnly: true,
          clientOrderIds: true,
          bulkCancel: true,
          balanceApi: true,
          positionApi: true,
          withdrawals: false,
          transfers: false,
          administration: false,
          securityChanges: false,
        },
        jurisdictionConfirmed: false,
        integrationApproved: false,
        termsReviewed: false,
        marketPermissions: [],
        withdrawalReviewed: false,
        withdrawalDisabled: true,
      },
      {
        householdId: ids.householdId,
        name: "External venue adapter",
        adapterType: "provider-neutral",
        status: "Research",
        capabilities: {},
        jurisdictionConfirmed: false,
        integrationApproved: false,
        termsReviewed: false,
        marketPermissions: [],
        withdrawalReviewed: false,
        withdrawalDisabled: false,
      },
    ]).returning();
  }

  let [session] = await db.select().from(microLiveSessions).where(eq(microLiveSessions.householdId, ids.householdId)).orderBy(desc(microLiveSessions.createdAt)).limit(1);
  if (!session) {
    [session] = await db.insert(microLiveSessions).values({
      householdId: ids.householdId,
      venueId: venues[0]?.id,
      status: "DISABLED",
      mode: "LIVE_REHEARSAL",
      capitalAllocated: "20.00",
      sessionLossLimit: "0.75",
      sessionExposureCap: "5.00",
    }).returning();
  }
  return { ...ids, policy, venues, session };
}

const emptyMismatches = {
  positionMismatch: false,
  orderMismatch: false,
  missingInternalFills: [] as string[],
  orphanedInternalFills: [] as string[],
};

function asCents(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}

type MicroLiveAdapterFactory = (input: {
  householdId: string;
  venue: typeof venueRegistry.$inferSelect;
}) => Promise<VenueAdapter> | VenueAdapter;

let reviewedMicroLiveAdapterFactory: MicroLiveAdapterFactory | undefined;

/**
 * Provider deployments register this factory in server code. A database row,
 * request body, or browser can never make a venue executable by itself.
 */
export function registerMicroLiveAdapterFactory(factory: MicroLiveAdapterFactory) {
  reviewedMicroLiveAdapterFactory = factory;
}

export function clearMicroLiveAdapterFactoryForTests() {
  reviewedMicroLiveAdapterFactory = undefined;
}

async function createLiveVenueAdapter(householdId: string, venue: typeof venueRegistry.$inferSelect) {
  if (!reviewedMicroLiveAdapterFactory) {
    throw new GovernanceError("INVALID_STATE", "No reviewed server-side Micro-Live venue adapter is registered");
  }
  return reviewedMicroLiveAdapterFactory({ householdId, venue });
}

function moneyFromCents(value: number) {
  return (value / 100).toFixed(2);
}

function decimalCents(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function fillNotionalCents(fill: VenueFill) {
  return Math.abs(decimalCents(fill.quantity * fill.price));
}

function isTerminalOrderState(state: string | null | undefined) {
  return state === "FILLED" || state === "CANCELLED" || state === "REJECTED" || state === "EXPIRED";
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function persistExecutionIncident(input: {
  householdId: string;
  sessionId: string;
  actor: Actor;
  incidentType: string;
  title: string;
  reason: string;
  orderIntentId?: string;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(microLiveSessions).set({
      status: "STOP",
      stoppedAt: now,
      updatedAt: now,
    }).where(and(
      eq(microLiveSessions.id, input.sessionId),
      eq(microLiveSessions.householdId, input.householdId),
    ));
    const [existing] = await tx.select({ id: tradingIncidents.id }).from(tradingIncidents).where(and(
      eq(tradingIncidents.householdId, input.householdId),
      eq(tradingIncidents.sessionId, input.sessionId),
      eq(tradingIncidents.incidentType, input.incidentType),
      eq(tradingIncidents.status, "OPEN"),
    )).limit(1);
    const incident = existing
      ? existing
      : (await tx.insert(tradingIncidents).values({
        householdId: input.householdId,
        sessionId: input.sessionId,
        severity: "CRITICAL",
        incidentType: input.incidentType,
        title: input.title,
        timeline: [
          input.reason,
          "The Micro-Live session was stopped and no new exposure is permitted.",
          "A human post-incident review is required before any future reactivation.",
        ],
        status: "OPEN",
      }).returning({ id: tradingIncidents.id }))[0];
    await appendAuditEvent({
      householdId: input.householdId,
      eventType: "micro_live_execution_incident_recorded",
      actor: input.actor.userId,
      entity: "trading_incident",
      entityId: incident.id,
      reason: input.reason,
      metadata: {
        incidentType: input.incidentType,
        orderIntentId: input.orderIntentId ?? null,
        liveExecutionEnabled: false,
      },
    }, tx);
    return incident;
  });
}

async function transitionOrder(
  actor: Actor,
  orderIntentId: string,
  toState: string,
  eventType: string,
  payload: Record<string, unknown> = {},
) {
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(orderIntents).where(and(
      eq(orderIntents.id, orderIntentId),
      eq(orderIntents.householdId, actor.householdId),
    )).limit(1);
    if (!intent) throw new GovernanceError("INVALID_STATE", "Order intent is not registered for this household");
    if (!canTransitionOrder(intent.state as never, toState as never)) {
      throw new GovernanceError("INVALID_STATE", `Order cannot transition from ${intent.state} to ${toState}`);
    }
    if (intent.state === toState) return intent;
    const now = new Date();
    const [updated] = await tx.update(orderIntents).set({
      state: toState,
      submittedAt: toState === "SUBMITTING" ? now : intent.submittedAt,
      acknowledgedAt: ["ACKNOWLEDGED", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"].includes(toState) ? now : intent.acknowledgedAt,
      lastError: typeof payload.error === "string" ? payload.error : intent.lastError,
      updatedAt: now,
    }).where(and(
      eq(orderIntents.id, orderIntentId),
      eq(orderIntents.householdId, actor.householdId),
      eq(orderIntents.state, intent.state),
    )).returning();
    if (!updated) throw new GovernanceError("INVALID_STATE", "Order changed while it was being transitioned");
    await tx.insert(orderEvents).values({
      orderIntentId,
      eventType,
      fromState: intent.state,
      toState,
      payload,
      externalEventId: typeof payload.externalEventId === "string" ? payload.externalEventId : null,
    }).onConflictDoNothing();
    await appendAuditEvent({
      householdId: actor.householdId,
      eventType: `micro_live_order_${eventType}`,
      actor: actor.userId,
      entity: "order_intent",
      entityId: orderIntentId,
      beforeState: { state: intent.state },
      afterState: { state: toState },
      reason: `Durable order transition ${intent.state} -> ${toState}`,
      metadata: payload,
    });
    return updated;
  });
}

async function ensureExecutionLedgerAccounts(tx: DbTransaction, householdId: string) {
  const definitions = [
    ["Micro-Live Venue Cash (execution-only)", "active_capital" as const],
    ["Micro-Live Position (execution-only)", "strategy_capital" as const],
    ["Micro-Live Fees (execution-only)", "strategy_capital" as const],
  ] as const;
  const result: Record<string, string> = {};
  for (const [name, accountType] of definitions) {
    let [account] = await tx.select().from(accounts).where(and(
      eq(accounts.householdId, householdId),
      eq(accounts.name, name),
      eq(accounts.executionOnly, true),
    )).limit(1);
    if (!account) {
      [account] = await tx.insert(accounts).values({
        householdId,
        name,
        accountType,
        balance: "0.00",
        protected: false,
        executionOnly: true,
        riskClass: "experimental",
      }).returning();
    }
    result[name] = account.id;
  }
  return {
    cashAccountId: result[definitions[0][0]],
    positionAccountId: result[definitions[1][0]],
    feeAccountId: result[definitions[2][0]],
  };
}

async function writeFillLedger(tx: DbTransaction, input: {
  householdId: string;
  actorId: string;
  fill: VenueFill;
  side: "buy" | "sell";
}) {
  const fillKey = `micro-live-fill:${input.fill.externalFillId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.householdId}:${fillKey}`}, 0))`);
  const [existingFill] = await tx.select({
    ledgerTransactionId: executionFills.ledgerTransactionId,
    feeLedgerTransactionId: executionFills.feeLedgerTransactionId,
  }).from(executionFills).where(and(
    eq(executionFills.householdId, input.householdId),
    eq(executionFills.externalFillId, input.fill.externalFillId),
  )).limit(1);
  if (existingFill?.ledgerTransactionId) return existingFill;

  const ledgerAccounts = await ensureExecutionLedgerAccounts(tx, input.householdId);
  const grossCents = fillNotionalCents(input.fill);
  if (grossCents <= 0) throw new GovernanceError("INVALID_STATE", "Provider fill has no positive notional");
  const debitAccountId = input.side === "buy" ? ledgerAccounts.positionAccountId : ledgerAccounts.cashAccountId;
  const creditAccountId = input.side === "buy" ? ledgerAccounts.cashAccountId : ledgerAccounts.positionAccountId;
  const [trade] = await tx.insert(ledgerTransactions).values({
    householdId: input.householdId,
    amount: moneyFromCents(grossCents),
    category: "adjustment",
    status: "completed",
    externalReference: input.fill.externalFillId,
    createdBy: input.actorId,
    idempotencyKey: fillKey,
    metadata: {
      executionOnly: true,
      source: "venue_authoritative_fill",
      externalOrderId: input.fill.externalOrderId,
      marketId: input.fill.marketId,
      side: input.side,
    },
  }).onConflictDoNothing().returning({ id: ledgerTransactions.id });
  const [tradeRow] = trade
    ? [trade]
    : await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(and(
      eq(ledgerTransactions.householdId, input.householdId),
      eq(ledgerTransactions.idempotencyKey, fillKey),
    )).limit(1);
  if (!tradeRow) throw new Error("Provider fill ledger transaction could not be persisted");
  await tx.insert(ledgerEntries).values([
    { transactionId: tradeRow.id, accountId: debitAccountId, debit: moneyFromCents(grossCents), credit: "0.00" },
    { transactionId: tradeRow.id, accountId: creditAccountId, debit: "0.00", credit: moneyFromCents(grossCents) },
  ]).onConflictDoNothing();

  const feeCents = Math.abs(decimalCents(input.fill.fee));
  let feeLedgerTransactionId: string | null = null;
  if (feeCents > 0) {
    const feeKey = `${fillKey}:fee`;
    const [fee] = await tx.insert(ledgerTransactions).values({
      householdId: input.householdId,
      amount: moneyFromCents(feeCents),
      category: "strategy_loss",
      status: "completed",
      externalReference: `${input.fill.externalFillId}:fee`,
      createdBy: input.actorId,
      idempotencyKey: feeKey,
      metadata: { executionOnly: true, source: "venue_authoritative_fee", externalFillId: input.fill.externalFillId },
    }).onConflictDoNothing().returning({ id: ledgerTransactions.id });
    const [feeRow] = fee
      ? [fee]
      : await tx.select({ id: ledgerTransactions.id }).from(ledgerTransactions).where(and(
        eq(ledgerTransactions.householdId, input.householdId),
        eq(ledgerTransactions.idempotencyKey, feeKey),
      )).limit(1);
    if (!feeRow) throw new Error("Provider fee ledger transaction could not be persisted");
    await tx.insert(ledgerEntries).values([
      { transactionId: feeRow.id, accountId: ledgerAccounts.feeAccountId, debit: moneyFromCents(feeCents), credit: "0.00" },
      { transactionId: feeRow.id, accountId: ledgerAccounts.cashAccountId, debit: "0.00", credit: moneyFromCents(feeCents) },
    ]).onConflictDoNothing();
    feeLedgerTransactionId = feeRow.id;
  }
  return { ledgerTransactionId: tradeRow.id, feeLedgerTransactionId };
}

async function persistProviderAcknowledgement(actor: Actor, intentId: string, order: VenueOrder) {
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(orderIntents).where(and(
      eq(orderIntents.id, intentId),
      eq(orderIntents.householdId, actor.householdId),
    )).limit(1);
    if (!intent) throw new GovernanceError("INVALID_STATE", "Provider acknowledgement references an unknown order intent");
    if (order.clientOrderId !== intent.clientOrderId || order.marketId !== intent.marketId) {
      throw new GovernanceError("INVALID_STATE", "Provider acknowledgement does not match the durable order intent");
    }
    const [venueOrder] = await tx.insert(venueOrders).values({
      orderIntentId: intent.id,
      externalOrderId: order.externalOrderId,
      venueStatus: order.state,
      side: order.side ?? (intent.side as "buy" | "sell"),
      orderType: order.orderType ?? (intent.orderType as "limit" | "market"),
      price: order.price?.toString() ?? (intent.price ?? null),
      quantity: order.quantity.toString(),
      filledQuantity: order.filledQuantity.toString(),
      rawResponse: order as unknown as Record<string, unknown>,
      lastSeenAt: new Date(),
    }).onConflictDoUpdate({
      target: venueOrders.orderIntentId,
      set: {
        externalOrderId: order.externalOrderId,
        venueStatus: order.state,
        side: order.side ?? (intent.side as "buy" | "sell"),
        orderType: order.orderType ?? (intent.orderType as "limit" | "market"),
        price: order.price?.toString() ?? (intent.price ?? null),
        quantity: order.quantity.toString(),
        filledQuantity: order.filledQuantity.toString(),
        rawResponse: order as unknown as Record<string, unknown>,
        lastSeenAt: new Date(),
      },
    }).returning();
    if (!venueOrder) throw new Error("Provider acknowledgement could not be persisted");

    if (intent.state !== order.state) {
      if (!canTransitionOrder(intent.state as never, order.state as never)) {
        throw new GovernanceError("INVALID_STATE", `Provider returned invalid order transition ${intent.state} -> ${order.state}`);
      }
      await tx.update(orderIntents).set({
        state: order.state,
        acknowledgedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(orderIntents.id, intent.id), eq(orderIntents.householdId, actor.householdId)));
      await tx.insert(orderEvents).values({
        orderIntentId: intent.id,
        eventType: "provider_acknowledged",
        fromState: intent.state,
        toState: order.state,
        externalEventId: `order:${order.externalOrderId}:${order.state}`,
        payload: order as unknown as Record<string, unknown>,
      }).onConflictDoNothing();
      await appendAuditEvent({
        householdId: actor.householdId,
        eventType: "micro_live_order_provider_acknowledged",
        actor: actor.userId,
        entity: "order_intent",
        entityId: intent.id,
        beforeState: { state: intent.state },
        afterState: { state: order.state },
        reason: "Provider acknowledgement persisted before reconciliation",
        metadata: { externalOrderId: order.externalOrderId },
      }, tx);
    }
    return venueOrder;
  });
}

async function persistProviderStateAndReconcile(input: {
  actor: Actor;
  sessionId: string;
  venueId: string;
  adapter: Pick<VenueAdapter, "healthCheck" | "getBalances" | "getPositions" | "getOpenOrders" | "getRecentFills" | "getOrder">;
  orderIdsToVerify?: string[];
}) {
  const capturedAt = new Date();
  const [health, balances, positions, openOrders, rawFills, lookedUpOrders] = await Promise.all([
    input.adapter.healthCheck(),
    input.adapter.getBalances(),
    input.adapter.getPositions(),
    input.adapter.getOpenOrders(),
    input.adapter.getRecentFills(),
    Promise.all((input.orderIdsToVerify ?? []).map((orderId) => input.adapter.getOrder(orderId))),
  ]);
  if (health.status !== "HEALTHY") throw new Error(`Provider health is ${health.status}`);
  const { fills, duplicateFillIds } = deduplicateVenueFills(rawFills);
  const observedOrders = [...openOrders, ...lookedUpOrders.filter((order): order is VenueOrder => Boolean(order))]
    .filter((order, index, all) => all.findIndex((candidate) => candidate.externalOrderId === order.externalOrderId) === index);

  return db.transaction(async (tx) => {
    const allIntents = await tx.select().from(orderIntents).where(eq(orderIntents.householdId, input.actor.householdId));
    const persistedOrders = await tx.select().from(venueOrders).innerJoin(
      orderIntents,
      eq(venueOrders.orderIntentId, orderIntents.id),
    ).where(eq(orderIntents.householdId, input.actor.householdId));
    const intentByClientId = new Map(allIntents.map((intent) => [intent.clientOrderId, intent]));
    const orderByExternalId = new Map(
      persistedOrders
        .filter((row) => row.venue_orders.externalOrderId)
        .map((row) => [row.venue_orders.externalOrderId!, row.order_intents]),
    );
    for (const order of observedOrders) {
      const intent = intentByClientId.get(order.clientOrderId);
      if (!intent || intent.sessionId !== input.sessionId) {
        throw new Error(`Unknown provider order ${order.externalOrderId}`);
      }
      if (order.marketId !== intent.marketId) throw new Error(`Provider order ${order.externalOrderId} market mismatch`);
      await tx.update(venueOrders).set({
        externalOrderId: order.externalOrderId,
        venueStatus: order.state,
        side: order.side ?? (intent.side as "buy" | "sell"),
        orderType: order.orderType ?? (intent.orderType as "limit" | "market"),
        price: order.price?.toString() ?? (intent.price ?? null),
        quantity: order.quantity.toString(),
        filledQuantity: order.filledQuantity.toString(),
        rawResponse: order as unknown as Record<string, unknown>,
        lastSeenAt: capturedAt,
      }).where(eq(venueOrders.orderIntentId, intent.id));
      if (intent.state !== order.state) {
        if (!canTransitionOrder(intent.state as never, order.state as never)) {
          throw new Error(`Provider order ${order.externalOrderId} state mismatch`);
        }
        await tx.update(orderIntents).set({ state: order.state, updatedAt: capturedAt }).where(eq(orderIntents.id, intent.id));
        await tx.insert(orderEvents).values({
          orderIntentId: intent.id,
          eventType: "provider_state_observed",
          fromState: intent.state,
          toState: order.state,
          externalEventId: `state:${order.externalOrderId}:${capturedAt.toISOString()}`,
          payload: order as unknown as Record<string, unknown>,
        });
      }
    }

    const newFillIds: string[] = [];
    for (const fill of fills) {
      const intent = orderByExternalId.get(fill.externalOrderId);
      if (!intent || intent.sessionId !== input.sessionId) {
        throw new Error(`Unknown provider fill ${fill.externalFillId} for order ${fill.externalOrderId}`);
      }
      if (fill.marketId !== intent.marketId) throw new Error(`Provider fill ${fill.externalFillId} market mismatch`);
      const side = fill.side ?? (intent.side as "buy" | "sell");
      if (side !== "buy" && side !== "sell") throw new Error(`Provider fill ${fill.externalFillId} has no valid side`);
      const [inserted] = await tx.insert(executionFills).values({
        householdId: input.actor.householdId,
        orderIntentId: intent.id,
        venueId: input.venueId,
        externalFillId: fill.externalFillId,
        marketId: fill.marketId,
        side,
        quantity: fill.quantity.toString(),
        price: fill.price.toString(),
        fee: fill.fee.toString(),
        filledAt: new Date(fill.timestamp),
      }).onConflictDoNothing().returning({ id: executionFills.id });
      if (inserted) {
        const ledger = await writeFillLedger(tx, {
          householdId: input.actor.householdId,
          actorId: input.actor.userId,
          fill,
          side,
        });
        await tx.update(executionFills).set({
          ledgerTransactionId: ledger.ledgerTransactionId,
          feeLedgerTransactionId: ledger.feeLedgerTransactionId,
        }).where(eq(executionFills.id, inserted.id));
        newFillIds.push(fill.externalFillId);
      }
      await tx.insert(fillSnapshots).values({
        householdId: input.actor.householdId,
        sessionId: input.sessionId,
        venueId: input.venueId,
        externalFillId: fill.externalFillId,
        marketId: fill.marketId,
        source: "VENUE",
        side,
        quantity: fill.quantity.toString(),
        price: fill.price.toString(),
        fee: fill.fee.toString(),
        metadata: { externalOrderId: fill.externalOrderId, authoritative: true },
        capturedAt,
      }).onConflictDoNothing();
    }

    for (const balance of balances) {
      await tx.insert(venueBalanceSnapshots).values({
        householdId: input.actor.householdId,
        sessionId: input.sessionId,
        venueId: input.venueId,
        asset: balance.asset,
        available: balance.available.toString(),
        committed: balance.committed.toString(),
        source: "VENUE",
        capturedAt,
      });
    }
    for (const position of positions) {
      await tx.insert(positionSnapshots).values({
        householdId: input.actor.householdId,
        sessionId: input.sessionId,
        venueId: input.venueId,
        marketId: position.marketId,
        source: "VENUE",
        quantity: position.quantity.toString(),
        averagePrice: position.averagePrice.toString(),
        markPrice: position.averagePrice.toString(),
        notional: (position.quantity * position.averagePrice).toFixed(2),
        metadata: { authoritative: true },
        capturedAt,
      });
    }

    const allFills = await tx.select().from(executionFills).where(eq(executionFills.householdId, input.actor.householdId));
    const freshIntents = await tx.select().from(orderIntents).where(and(
      eq(orderIntents.householdId, input.actor.householdId),
      eq(orderIntents.sessionId, input.sessionId),
    ));
    const freshOrders = await tx.select().from(venueOrders).innerJoin(
      orderIntents,
      eq(venueOrders.orderIntentId, orderIntents.id),
    ).where(and(
      eq(orderIntents.householdId, input.actor.householdId),
      eq(orderIntents.sessionId, input.sessionId),
    ));
    const filledByIntent = new Map<string, number>();
    for (const fill of allFills) {
      if (!fill.orderIntentId) throw new Error(`Durable fill ${fill.externalFillId} has no order intent`);
      filledByIntent.set(fill.orderIntentId, (filledByIntent.get(fill.orderIntentId) ?? 0) + Number(fill.quantity));
    }
    for (const row of freshOrders) {
      const current = freshIntents.find((intent) => intent.id === row.venue_orders.orderIntentId);
      if (!current || isTerminalOrderState(current.state)) continue;
      const filledQuantity = filledByIntent.get(current.id) ?? Number(row.venue_orders.filledQuantity ?? 0);
      const targetState = filledQuantity >= Number(row.venue_orders.quantity ?? 0)
        ? "FILLED"
        : filledQuantity > 0
          ? "PARTIALLY_FILLED"
          : current.state;
      if (targetState !== current.state && canTransitionOrder(current.state as never, targetState as never)) {
        await tx.update(orderIntents).set({
          state: targetState,
          updatedAt: capturedAt,
        }).where(eq(orderIntents.id, current.id));
        await tx.insert(orderEvents).values({
          orderIntentId: current.id,
          eventType: "provider_fill_state_observed",
          fromState: current.state,
          toState: targetState,
          externalEventId: `fill-state:${current.id}:${capturedAt.toISOString()}`,
          payload: { filledQuantity, authoritative: true },
        });
      }
    }
    const internalPositionCents = allFills.reduce((total, fill) => {
      const signed = fill.side === "sell" ? -1 : 1;
      return total + signed * decimalCents(Number(fill.quantity) * Number(fill.price));
    }, 0);
    const venuePositionCents = positions.reduce((total, position) =>
      total + decimalCents(position.quantity * position.averagePrice), 0);
    const refreshedOrders = await tx.select().from(venueOrders).innerJoin(
      orderIntents,
      eq(venueOrders.orderIntentId, orderIntents.id),
    ).where(and(
      eq(orderIntents.householdId, input.actor.householdId),
      eq(orderIntents.sessionId, input.sessionId),
    ));
    const internalOpenOrders = refreshedOrders.filter((row) => !isTerminalOrderState(row.venue_orders.venueStatus)).length;
    const result = reconcileExecutionState({
      internalPositionCents,
      venuePositionCents,
      internalOpenOrders,
      venueOpenOrders: openOrders.length,
      // getRecentFills is a bounded provider feed; every returned provider
      // fill must be durable, but old internal fills are not treated as
      // missing merely because they aged out of that feed.
      internalFillIds: fills.map((fill) => fill.externalFillId),
      venueFillIds: fills.map((fill) => fill.externalFillId),
    });
    const mismatches = duplicateFillIds.length
      ? { ...result.mismatches, duplicateFillIds }
      : result.mismatches;
    const clean = result.clean && duplicateFillIds.length === 0;
    const [run] = await tx.insert(reconciliationRuns).values({
      householdId: input.actor.householdId,
      sessionId: input.sessionId,
      status: clean ? "CLEAN" : "FAILURE",
      mismatches,
      internalState: {
        positionCents: internalPositionCents,
        openOrders: internalOpenOrders,
        fillIds: allFills.map((fill) => fill.externalFillId),
        source: "capital_os_oms",
      },
      venueState: {
        positionCents: venuePositionCents,
        openOrders: openOrders.length,
        fillIds: fills.map((fill) => fill.externalFillId),
        balances,
        positions,
        source: "venue_authoritative",
      },
      completedAt: capturedAt,
    }).returning();
    if (!run) throw new Error("Reconciliation run could not be persisted");

    if (!clean) {
      await tx.update(microLiveSessions).set({
        status: "STOP",
        stoppedAt: capturedAt,
        updatedAt: capturedAt,
      }).where(and(eq(microLiveSessions.id, input.sessionId), eq(microLiveSessions.householdId, input.actor.householdId)));
      await tx.insert(tradingIncidents).values({
        householdId: input.actor.householdId,
        sessionId: input.sessionId,
        severity: "CRITICAL",
        incidentType: "RECONCILIATION_MISMATCH",
        title: "Provider and internal execution state disagree",
        timeline: [
          `Reconciliation run ${run.id} found provider state that did not match durable OMS state.`,
          "New exposure is blocked until provider-authoritative state is rebuilt and verified.",
          "A human post-incident review is required before reactivation.",
        ],
        status: "OPEN",
      }).onConflictDoNothing();
    }
    await appendAuditEvent({
      householdId: input.actor.householdId,
      eventType: "micro_live_provider_reconciliation_completed",
      actor: input.actor.userId,
      entity: "reconciliation_run",
      entityId: run.id,
      reason: clean ? "Provider acknowledgement, fills, balances, positions, and ledger state reconciled" : "Provider mismatch contained; new exposure remains blocked",
      metadata: { status: run.status, newFillIds, duplicateFillIds, liveExecutionEnabled: false },
    }, tx);
    return { run, clean, newFillIds, duplicateFillIds };
  });
}

export type MicroLiveOrderCommand = {
  marketId: string;
  side: "buy" | "sell";
  orderType: "limit" | "market";
  quantity: number;
  price?: number;
  strategyId?: string;
  strategyVersionId?: string;
  quoteCycle: string;
  referencePriceBps: number;
  priceBps: number;
  marketDataAgeMs: number;
  postOnly?: boolean;
};

async function findMicroLiveSessionForActor(actor: Actor) {
  const [session] = await db.select().from(microLiveSessions)
    .where(eq(microLiveSessions.householdId, actor.householdId))
    .orderBy(desc(microLiveSessions.createdAt))
    .limit(1);
  if (!session) throw new GovernanceError("INVALID_STATE", "Micro-Live session is not configured for this household");
  const [venue] = session.venueId
    ? await db.select().from(venueRegistry).where(and(eq(venueRegistry.id, session.venueId), eq(venueRegistry.householdId, actor.householdId))).limit(1)
    : [];
  if (!venue) throw new GovernanceError("INVALID_STATE", "Micro-Live venue is not configured for this household");
  const [policy] = await db.select().from(microLivePolicies).where(eq(microLivePolicies.householdId, actor.householdId)).limit(1);
  if (!policy) throw new GovernanceError("INVALID_STATE", "Micro-Live policy is not configured for this household");
  return { session, venue, policy };
}

async function persistOrderValidation(actor: Actor, intentId: string, validation: Record<string, unknown>) {
  const [updated] = await db.update(orderIntents).set({
    validation,
    updatedAt: new Date(),
  }).where(and(eq(orderIntents.id, intentId), eq(orderIntents.householdId, actor.householdId))).returning();
  if (!updated) throw new Error("Order validation could not be persisted");
  return updated;
}

function orderResponse(intent: typeof orderIntents.$inferSelect, venueOrder?: typeof venueOrders.$inferSelect | null, reconciliation?: unknown) {
  return {
    orderIntentId: intent.id,
    clientOrderId: intent.clientOrderId,
    state: intent.state,
    idempotent: false,
    venueOrder: venueOrder ? {
      id: venueOrder.id,
      externalOrderId: venueOrder.externalOrderId,
      venueStatus: venueOrder.venueStatus,
      quantity: venueOrder.quantity,
      filledQuantity: venueOrder.filledQuantity,
    } : null,
    reconciliation: reconciliation ?? null,
  };
}

export async function submitMicroLiveOrder(actor: Actor, input: MicroLiveOrderCommand, idempotencyKey: string) {
  assertPermission(actor.role, "execute_micro_live_order");
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new GovernanceError("INVALID_STATE", "A bounded Idempotency-Key is required for Micro-Live order submission");
  }
  const { session, venue, policy } = await findMicroLiveSessionForActor(actor);
  const clientOrderId = buildClientOrderId({
    strategyId: input.strategyId ?? "micro-live",
    venueId: venue.id,
    marketId: input.marketId,
    quoteCycle: input.quoteCycle,
    intent: `${input.side}-${idempotencyKey}`,
  });
  const [existing] = await db.select().from(orderIntents).where(and(
    eq(orderIntents.householdId, actor.householdId),
    eq(orderIntents.idempotencyKey, idempotencyKey),
  )).limit(1);
  if (existing) {
    if (
      existing.marketId !== input.marketId ||
      existing.side !== input.side ||
      existing.orderType !== input.orderType ||
      Number(existing.quantity) !== input.quantity ||
      Number(existing.price ?? 0) !== Number(input.price ?? 0)
    ) {
      throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for a different order");
    }
    const [existingVenueOrder] = await db.select().from(venueOrders).where(eq(venueOrders.orderIntentId, existing.id)).limit(1);
    return { ...orderResponse(existing, existingVenueOrder), idempotent: true };
  }
  await assertExecutionPermitted(actor);

  const [latestReconciliation] = await db.select().from(reconciliationRuns).where(and(
    eq(reconciliationRuns.householdId, actor.householdId),
    eq(reconciliationRuns.sessionId, session.id),
  )).orderBy(desc(reconciliationRuns.completedAt)).limit(1);
  const priorFills = await db.select().from(fillSnapshots).where(and(
    eq(fillSnapshots.householdId, actor.householdId),
    eq(fillSnapshots.sessionId, session.id),
    eq(fillSnapshots.source, "VENUE"),
  ));
  const firstFillHold = firstFillHoldDecision({
    fillObserved: priorFills.length > 0,
    reconciliationClean: latestReconciliation?.status === "CLEAN",
    explicitResumeApproval: Boolean(session.firstFillResumeApprovedAt),
  });
  const adapterApproved = evaluateVenueApproval({
    ...venue,
    adapterRegistered: isReviewedVenueAdapterRegistered(venue.adapterType),
    approvingActorId: venue.approvedBy ?? undefined,
  });
  const policyLimitsValue = { ...defaultMicroLivePolicy, ...(policy.limits as Partial<typeof defaultMicroLivePolicy>) };
  const initialValidation = validatePreTrade(policyLimitsValue, {
    liveStatus: session.status as never,
    strategyAuthorized: Boolean(input.strategyId),
    venueAuthorized: adapterApproved.approved,
    marketAuthorized: venue.marketPermissions.includes(input.marketId),
    marketDataAgeMs: input.marketDataAgeMs,
    venueHealthy: true,
    reconciled: latestReconciliation?.status === "CLEAN",
    riskHeartbeatHealthy: true,
    orderNotionalCents: decimalCents(input.quantity * (input.price ?? input.referencePriceBps / 100)),
    priceBps: input.priceBps,
    referencePriceBps: input.referencePriceBps,
    marketExposureCents: 0,
    strategyExposureCents: 0,
    venueExposureCents: 0,
    totalActiveExposureCents: 0,
    dailyLossCents: 0,
    drawdownBps: 0,
    inventoryCents: 0,
    ordersInSecond: 0,
    ordersInMinute: 0,
    cancelsInMinute: 0,
    notionalInMinuteCents: 0,
    positionChangeInMinuteCents: 0,
    authorizationExpiresAt: session.authorizationExpiresAt,
    firstFillHoldActive: !firstFillHold.allowNewOrders,
  });
  const [intent] = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`micro-live-order:${actor.householdId}:${idempotencyKey}`}, 0))`);
    const [race] = await tx.select().from(orderIntents).where(and(
      eq(orderIntents.householdId, actor.householdId),
      eq(orderIntents.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (race) {
      if (
        race.marketId !== input.marketId ||
        race.side !== input.side ||
        race.orderType !== input.orderType ||
        Number(race.quantity) !== input.quantity ||
        Number(race.price ?? 0) !== Number(input.price ?? 0)
      ) {
        throw new GovernanceError("IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for a different order");
      }
      return [race];
    }
    const [created] = await tx.insert(orderIntents).values({
      householdId: actor.householdId,
      sessionId: session.id,
      strategyId: input.strategyId,
      strategyVersionId: input.strategyVersionId,
      venueId: venue.id,
      marketId: input.marketId,
      clientOrderId,
      idempotencyKey,
      side: input.side,
      orderType: input.orderType,
      price: input.price?.toString(),
      quantity: input.quantity.toString(),
      state: "VALIDATING",
      validation: initialValidation,
    }).returning();
    if (!created) throw new Error("Order intent could not be persisted");
    await tx.insert(orderEvents).values({
      orderIntentId: created.id,
      eventType: "intent_created",
      fromState: "CREATED",
      toState: "VALIDATING",
      payload: { clientOrderId, idempotencyKey },
    });
    await appendAuditEvent({
      householdId: actor.householdId,
      eventType: "micro_live_order_intent_created",
      actor: actor.userId,
      entity: "order_intent",
      entityId: created.id,
      afterState: { state: "VALIDATING", clientOrderId },
      reason: "Authenticated Micro-Live order intent persisted before provider submission",
      metadata: { idempotencyKey, marketId: input.marketId, executionOnly: true },
    }, tx);
    return [created];
  });
  if (!intent) throw new Error("Order intent was not created");
  if (intent.state !== "VALIDATING") return { ...orderResponse(intent), idempotent: true };

  let adapter: VenueAdapter | undefined;
  try {
    adapter = await createLiveVenueAdapter(actor.householdId, venue);
    await adapter.connect();
    const health = await adapter.healthCheck();
    const book = await adapter.getOrderBook(input.marketId);
    const liveValidation = validatePreTrade(policyLimitsValue, {
      liveStatus: session.status as never,
      strategyAuthorized: Boolean(input.strategyId),
      venueAuthorized: adapterApproved.approved,
      marketAuthorized: venue.marketPermissions.includes(input.marketId),
      marketDataAgeMs: input.marketDataAgeMs,
      venueHealthy: health.status === "HEALTHY",
      reconciled: latestReconciliation?.status === "CLEAN",
      riskHeartbeatHealthy: true,
      orderNotionalCents: decimalCents(input.quantity * (input.price ?? (input.side === "buy" ? book.ask : book.bid))),
      priceBps: input.priceBps,
      referencePriceBps: input.referencePriceBps,
      marketExposureCents: 0,
      strategyExposureCents: 0,
      venueExposureCents: 0,
      totalActiveExposureCents: 0,
      dailyLossCents: 0,
      drawdownBps: 0,
      inventoryCents: 0,
      ordersInSecond: 0,
      ordersInMinute: 0,
      cancelsInMinute: 0,
      notionalInMinuteCents: 0,
      positionChangeInMinuteCents: 0,
      authorizationExpiresAt: session.authorizationExpiresAt,
      firstFillHoldActive: !firstFillHold.allowNewOrders,
    });
    await persistOrderValidation(actor, intent.id, {
      ...liveValidation,
      quote: book,
      venueHealth: health.status,
    });
    if (!liveValidation.accepted) {
      const rejected = await transitionOrder(actor, intent.id, "REJECTED", "validation_rejected", { failures: liveValidation.failures });
      return orderResponse(rejected);
    }

    // SUBMITTING is committed before the single order-placement call. If the
    // call times out, UNKNOWN is durable and the incident path stops exposure.
    const submitting = await transitionOrder(actor, intent.id, "SUBMITTING", "submission_started", { clientOrderId });
    let acknowledgement: VenueOrder;
    try {
      acknowledgement = await adapter.placeOrder({
        clientOrderId,
        marketId: input.marketId,
        side: input.side,
        orderType: input.orderType,
        quantity: input.quantity,
        price: input.price,
        postOnly: input.postOnly,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provider order submission failed or timed out";
      await transitionOrder(actor, intent.id, "UNKNOWN", "submission_unknown", { error: reason });
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "ORDER_SUBMISSION_UNKNOWN",
        title: "Provider order submission has unknown outcome",
        reason,
        orderIntentId: intent.id,
      });
      throw error;
    }
    let persistedVenueOrder;
    try {
      persistedVenueOrder = await persistProviderAcknowledgement(actor, intent.id, acknowledgement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provider acknowledgement persistence failed";
      await transitionOrder(actor, intent.id, "UNKNOWN", "acknowledgement_persistence_failed", { error: reason }).catch(() => undefined);
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "ACKNOWLEDGEMENT_PERSISTENCE_FAILURE",
        title: "Provider acknowledgement could not be persisted",
        reason,
        orderIntentId: intent.id,
      });
      throw error;
    }
    let reconciliation;
    try {
      reconciliation = await persistProviderStateAndReconcile({
        actor,
        sessionId: session.id,
        venueId: venue.id,
        adapter,
        orderIdsToVerify: [acknowledgement.externalOrderId],
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Provider reconciliation failed";
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "RECONCILIATION_FAILURE",
        title: "Provider order reconciliation failed closed",
        reason,
        orderIntentId: intent.id,
      });
      throw error;
    }
    const [finalIntent] = await db.select().from(orderIntents).where(eq(orderIntents.id, intent.id)).limit(1);
    return orderResponse(finalIntent ?? submitting, persistedVenueOrder, reconciliation.run);
  } catch (error) {
    if (intent.state === "VALIDATING") {
      await transitionOrder(actor, intent.id, "REJECTED", "execution_failed", {
        error: error instanceof Error ? error.message : "Micro-Live execution failed before submission",
      }).catch(() => undefined);
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "ORDER_EXECUTION_FAILURE",
        title: "Micro-Live order could not be executed",
        reason: error instanceof Error ? error.message : "Micro-Live execution failed before submission",
        orderIntentId: intent.id,
      }).catch(() => undefined);
    }
    throw error;
  } finally {
    await adapter?.disconnect().catch(() => undefined);
  }
}

export async function cancelMicroLiveOrder(actor: Actor, orderIntentId: string) {
  assertPermission(actor.role, "execute_micro_live_order");
  const [intent] = await db.select().from(orderIntents).where(and(
    eq(orderIntents.id, orderIntentId),
    eq(orderIntents.householdId, actor.householdId),
  )).limit(1);
  if (!intent) throw new GovernanceError("INVALID_STATE", "Order intent is not registered for this household");
  const [venueOrder] = await db.select().from(venueOrders).where(eq(venueOrders.orderIntentId, intent.id)).limit(1);
  if (!venueOrder?.externalOrderId) throw new GovernanceError("INVALID_STATE", "No provider order acknowledgement is available to cancel");
  const { session, venue } = await findMicroLiveSessionForActor(actor);
  if (!canTransitionOrder(intent.state as never, "CANCEL_REQUESTED")) {
    throw new GovernanceError("INVALID_STATE", `Order in ${intent.state} cannot be cancelled`);
  }
  await transitionOrder(actor, intent.id, "CANCEL_REQUESTED", "cancel_requested", { externalOrderId: venueOrder.externalOrderId });
  let adapter: VenueAdapter | undefined;
  try {
    adapter = await createLiveVenueAdapter(actor.householdId, venue);
    await adapter.connect();
    let cancelled: VenueOrder;
    try {
      cancelled = await adapter.cancelOrder(venueOrder.externalOrderId);
    } catch (error) {
      await transitionOrder(actor, intent.id, "UNKNOWN", "cancel_unknown", { error: error instanceof Error ? error.message : "Provider cancellation failed" });
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "CANCEL_UNKNOWN",
        title: "Provider cancellation has unknown outcome",
        reason: error instanceof Error ? error.message : "Provider cancellation failed or timed out",
        orderIntentId: intent.id,
      });
      throw error;
    }
    let persisted;
    try {
      persisted = await persistProviderAcknowledgement(actor, intent.id, cancelled);
    } catch (error) {
      await transitionOrder(actor, intent.id, "UNKNOWN", "cancel_acknowledgement_persistence_failed", {
        error: error instanceof Error ? error.message : "Provider cancellation acknowledgement persistence failed",
      }).catch(() => undefined);
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "CANCEL_ACKNOWLEDGEMENT_PERSISTENCE_FAILURE",
        title: "Provider cancellation acknowledgement could not be persisted",
        reason: error instanceof Error ? error.message : "Provider cancellation acknowledgement persistence failed",
        orderIntentId: intent.id,
      });
      throw error;
    }
    let reconciliation;
    try {
      reconciliation = await persistProviderStateAndReconcile({
        actor,
        sessionId: session.id,
        venueId: venue.id,
        adapter,
        orderIdsToVerify: [cancelled.externalOrderId],
      });
    } catch (error) {
      await persistExecutionIncident({
        householdId: actor.householdId,
        sessionId: session.id,
        actor,
        incidentType: "RECONCILIATION_FAILURE",
        title: "Provider cancellation reconciliation failed closed",
        reason: error instanceof Error ? error.message : "Provider cancellation reconciliation failed",
        orderIntentId: intent.id,
      });
      throw error;
    }
    const [finalIntent] = await db.select().from(orderIntents).where(eq(orderIntents.id, intent.id)).limit(1);
    return orderResponse(finalIntent ?? intent, persisted, reconciliation.run);
  } finally {
    await adapter?.disconnect().catch(() => undefined);
  }
}

export async function approveMicroLiveFirstFillResume(actor: Actor) {
  assertPermission(actor.role, "approve");
  const { session } = await findMicroLiveSessionForActor(actor);
  const [latestReconciliation] = await db.select().from(reconciliationRuns).where(and(
    eq(reconciliationRuns.householdId, actor.householdId),
    eq(reconciliationRuns.sessionId, session.id),
  )).orderBy(desc(reconciliationRuns.completedAt)).limit(1);
  const [fill] = await db.select({ id: fillSnapshots.id }).from(fillSnapshots).where(and(
    eq(fillSnapshots.householdId, actor.householdId),
    eq(fillSnapshots.sessionId, session.id),
    eq(fillSnapshots.source, "VENUE"),
  )).limit(1);
  if (!fill || latestReconciliation?.status !== "CLEAN") {
    throw new GovernanceError("INVALID_STATE", "First-fill approval requires a venue fill and clean reconciliation");
  }
  const approvedAt = new Date();
  const [updated] = await db.update(microLiveSessions).set({
    firstFillResumeApprovedBy: actor.userId,
    firstFillResumeApprovedAt: approvedAt,
    updatedAt: approvedAt,
  }).where(and(eq(microLiveSessions.id, session.id), eq(microLiveSessions.householdId, actor.householdId))).returning();
  await appendAuditEvent({
    householdId: actor.householdId,
    eventType: "micro_live_first_fill_resume_approved",
    actor: actor.userId,
    entity: "micro_live_session",
    entityId: session.id,
    reason: "Human explicitly approved resuming new orders after clean first-fill reconciliation",
    metadata: { reconciliationRunId: latestReconciliation.id, liveExecutionEnabled: false },
  });
  return { sessionId: updated.id, approvedAt, approvedBy: actor.userId, allowNewOrders: true, liveExecutionEnabled: false };
}

function toReconciliationRun(run: typeof reconciliationRuns.$inferSelect) {
  return {
    ...run,
    mismatches: { ...emptyMismatches, ...(run.mismatches as Record<string, unknown>) },
  };
}

function toIncident(
  incident: typeof tradingIncidents.$inferSelect,
  reviews: Array<typeof postIncidentReviews.$inferSelect>,
  requirements: Array<typeof reactivationRequirements.$inferSelect>,
) {
  const incidentRequirements = requirements.filter((requirement) => requirement.incidentId === incident.id);
  return {
    ...incident,
    hasReview: reviews.some((review) => review.incidentId === incident.id),
    openRequirementCount: incidentRequirements.filter((requirement) => requirement.status !== "COMPLETE").length,
  };
}

function toIncidentReview(
  review: typeof postIncidentReviews.$inferSelect,
  requirements: Array<typeof reactivationRequirements.$inferSelect>,
) {
  return {
    ...review,
    requirements: requirements.filter((requirement) => requirement.reviewId === review.id),
  };
}

async function persistMicroLiveRecoveryFailure(input: {
  householdId: string;
  session: typeof microLiveSessions.$inferSelect;
  actor: Actor;
  error: unknown;
  capturedAt: Date;
}) {
  const reason = input.error instanceof Error ? input.error.message : "Unknown reconciliation failure";
  const [run] = await db.insert(reconciliationRuns).values({
    householdId: input.householdId,
    sessionId: input.session.id,
    status: "FAILURE",
    mismatches: { ...emptyMismatches, recoveryError: reason },
    internalState: { source: "capital_os_oms", recovery: "FAILED" },
    venueState: { source: "simulated_rehearsal_adapter", recovery: "UNAVAILABLE" },
    completedAt: input.capturedAt,
  }).returning();
  await db.update(microLiveSessions).set({
    status: "STOP",
    stoppedAt: input.capturedAt,
    updatedAt: input.capturedAt,
  }).where(and(eq(microLiveSessions.id, input.session.id), eq(microLiveSessions.householdId, input.householdId)));
  const [existingIncident] = await db.select({ id: tradingIncidents.id }).from(tradingIncidents).where(and(
    eq(tradingIncidents.householdId, input.householdId),
    eq(tradingIncidents.incidentType, "RECONCILIATION_FAILURE"),
    eq(tradingIncidents.status, "OPEN"),
  )).limit(1);
  if (!existingIncident) {
    await db.insert(tradingIncidents).values({
      householdId: input.householdId,
      sessionId: input.session.id,
      severity: "CRITICAL",
      incidentType: "RECONCILIATION_FAILURE",
      title: "Execution reconciliation failed closed",
      timeline: [
        `Reconciliation run ${run.id} could not complete: ${reason}`,
        "The Micro-Live session was stopped and no new exposure is permitted.",
        "A human post-incident review is required before any future reactivation.",
      ],
      status: "OPEN",
    });
  }
  await appendAuditEvent({
    householdId: input.householdId,
    eventType: "micro_live_reconciliation_failed_closed",
    actor: input.actor.userId,
    entity: "reconciliation_run",
    entityId: run.id,
    reason: "Reconciliation failure persisted and session stopped",
    metadata: { error: reason, liveExecutionEnabled: false },
  });
  return toReconciliationRun(run);
}

async function ensureMicroLiveBaseline(session: typeof microLiveSessions.$inferSelect) {
  const [existingRun] = await db
    .select()
    .from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.householdId, session.householdId), eq(reconciliationRuns.sessionId, session.id)))
    .orderBy(desc(reconciliationRuns.completedAt))
    .limit(1);
  if (existingRun) return existingRun;

  const capturedAt = new Date();
  const positionValues = [
    { source: "INTERNAL", metadata: { authority: "capital_os_oms", baseline: true } },
    { source: "VENUE", metadata: { authority: "simulated_rehearsal_adapter", baseline: true } },
  ].map((position) => ({
    householdId: session.householdId,
    sessionId: session.id,
    venueId: session.venueId,
    marketId: "sandbox",
    source: position.source,
    quantity: "0",
    averagePrice: "0",
    markPrice: "0",
    notional: "0",
    metadata: position.metadata,
    capturedAt,
  }));
  await db.insert(positionSnapshots).values(positionValues);
  const [run] = await db.insert(reconciliationRuns).values({
    householdId: session.householdId,
    sessionId: session.id,
    status: "CLEAN",
    mismatches: emptyMismatches,
    internalState: { positionCents: 0, openOrders: 0, fillIds: [], source: "capital_os_oms" },
    venueState: { positionCents: 0, openOrders: 0, fillIds: [], source: "simulated_rehearsal_adapter" },
    completedAt: capturedAt,
  }).returning();
  return run;
}

export async function getMicroLiveSnapshot(actor: Actor) {
  const { policy, venues, session } = await ensureMicroLiveSeed(actor);
  await ensureMicroLiveBaseline(session);
  const rehearsal = runLiveRehearsal();
  const [heartbeat] = await db.select().from(guardianHeartbeats).where(eq(guardianHeartbeats.householdId, session.householdId)).orderBy(desc(guardianHeartbeats.lastHeartbeatAt)).limit(1);
  const [latestReconciliation] = await db.select().from(reconciliationRuns)
    .where(and(eq(reconciliationRuns.householdId, session.householdId), eq(reconciliationRuns.sessionId, session.id)))
    .orderBy(desc(reconciliationRuns.completedAt)).limit(1);
  const reconciliation = latestReconciliation
    ? { ...reconcileExecutionState({ internalPositionCents: 0, venuePositionCents: 0, internalOpenOrders: 0, venueOpenOrders: 0, internalFillIds: [], venueFillIds: [] }), clean: latestReconciliation.status === "CLEAN", mismatches: { ...emptyMismatches, ...(latestReconciliation.mismatches as Record<string, unknown>) }, action: latestReconciliation.status === "CLEAN" ? "CONTINUE" as const : "STOP_CANCEL_FETCH_REBUILD_VERIFY" as const }
    : reconcileExecutionState({ internalPositionCents: 0, venuePositionCents: 0, internalOpenOrders: 0, venueOpenOrders: 0, internalFillIds: [], venueFillIds: [] });
  const heartbeatAgeMs = heartbeat ? Math.max(0, Date.now() - heartbeat.lastHeartbeatAt.getTime()) : Number.POSITIVE_INFINITY;
  const heartbeatHealthy = Boolean(
    heartbeat &&
    heartbeat.status === "HEALTHY" &&
    heartbeat.signatureValid &&
    heartbeatAgeMs <= 3000,
  );
  const guardian = guardianDecision({
    liveStatus: session.status as "DISABLED" | "MICRO_LIVE_ELIGIBLE" | "MICRO_LIVE_ARMED" | "MICRO_LIVE_ACTIVE" | "SAFE_MODE" | "STOP" | "EVACUATE" | "LOCKED" | "LIMITED_LIVE_ELIGIBLE" | "LIMITED_LIVE_ARMED" | "LIMITED_LIVE_ACTIVE",
    heartbeatAgeMs,
    maxHeartbeatAgeMs: 3000,
    reportedExposureCents: asCents(heartbeat?.reportedExposure),
    observedVenueExposureCents: asCents(heartbeat?.observedExposure),
    hardExposureCents: Number(policy.limits.maxMarketExposureCents ?? 500),
    riskEngineHealthy: heartbeatHealthy,
  });
  const readiness = calculateLiveReadiness({
    strategyEvidence: false,
    paperPerformance: false,
    venue: false,
    marketData: false,
    oms: true,
    riskGovernor: true,
    capitalGovernor: true,
    guardian: heartbeatHealthy,
    reconciliation: reconciliation.clean,
    security: false,
    chaosTests: true,
  });
  const enablement = evaluateLiveEnablement({
    strategyMicroLiveEligible: false,
    humanApproval: false,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: false,
    reconciliationClean: reconciliation.clean,
    venueApproved: false,
    marketApproved: false,
    jurisdictionConfirmed: false,
    credentialsConfigured: false,
    approvedIntegration: false,
    termsReviewed: false,
    marketPermissionsConfigured: false,
    withdrawalReviewed: false,
    withdrawalDisabled: false,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  });
  const [allIncidents, reviews, requirements, reconciliationHistory, positions, fills] = await Promise.all([
    db.select().from(tradingIncidents).where(and(eq(tradingIncidents.householdId, session.householdId), eq(tradingIncidents.status, "OPEN"))).orderBy(desc(tradingIncidents.createdAt)).limit(20),
    db.select().from(postIncidentReviews).where(eq(postIncidentReviews.householdId, session.householdId)).orderBy(desc(postIncidentReviews.reviewedAt)).limit(20),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, session.householdId)).orderBy(desc(reactivationRequirements.createdAt)).limit(50),
    db.select().from(reconciliationRuns).where(eq(reconciliationRuns.householdId, session.householdId)).orderBy(desc(reconciliationRuns.completedAt)).limit(20),
    db.select().from(positionSnapshots).where(eq(positionSnapshots.householdId, session.householdId)).orderBy(desc(positionSnapshots.capturedAt)).limit(50),
    db.select().from(fillSnapshots).where(eq(fillSnapshots.householdId, session.householdId)).orderBy(desc(fillSnapshots.capturedAt)).limit(50),
  ]);
  const firstFillHold = firstFillHoldDecision({
    fillObserved: fills.some((fill) => fill.sessionId === session.id && fill.source === "VENUE"),
    reconciliationClean: reconciliation.clean,
    explicitResumeApproval: Boolean(session.firstFillResumeApprovedAt),
  });
  const incidents = allIncidents.map((incident) => toIncident(incident, reviews, requirements));
  const sessionIntents = await db.select({ id: orderIntents.id }).from(orderIntents).where(and(
    eq(orderIntents.sessionId, session.id),
    eq(orderIntents.householdId, session.householdId),
  ));
  const events = sessionIntents.length
    ? await db.select().from(orderEvents).where(inArray(orderEvents.orderIntentId, sessionIntents.map((intent) => intent.id))).orderBy(desc(orderEvents.createdAt)).limit(20)
    : [];
  return {
    status: session.status,
    policy: { version: policy.policyVersion, limits: policy.limits, autoScale: policy.autoScale, leverageEnabled: policy.leverageEnabled, marginEnabled: policy.marginEnabled, borrowingEnabled: policy.borrowingEnabled },
    session: { id: session.id, mode: session.mode, capitalAllocated: session.capitalAllocated, currentPosition: "0.00", openOrders: 0, netPnl: "0.00", lossLimit: session.sessionLossLimit, exposureCap: session.sessionExposureCap, expiresAt: session.authorizationExpiresAt },
    venues: venues.map((venue) => {
      const approval = evaluateVenueApproval({
        ...venue,
        adapterRegistered: isReviewedVenueAdapterRegistered(venue.adapterType),
        approvingActorId: venue.approvedBy ?? undefined,
      });
      return {
        id: venue.id,
        name: venue.name,
        adapterType: venue.adapterType,
        status: venue.status,
        capabilities: venue.capabilities,
        jurisdictionConfirmed: venue.jurisdictionConfirmed,
        integrationApproved: venue.integrationApproved,
        credentialsConfigured: isServerCredentialReference(venue.credentialsReference),
        termsReviewed: venue.termsReviewed,
        marketPermissions: venue.marketPermissions,
        withdrawalReviewed: venue.withdrawalReviewed,
        withdrawalDisabled: venue.withdrawalDisabled,
        approval,
        health: venue.status === "Approved for Paper" ? "HEALTHY" : "NOT_CONNECTED",
      };
    }),
    readiness,
    enablement,
    guardian: { status: heartbeat?.status ?? "STOP", lastHeartbeatAt: heartbeat?.lastHeartbeatAt ?? null, decision: guardian.action, reason: guardian.reason, independentDeployment: "Guardian is modeled as a separate process boundary for future independent hosting." },
    reconciliation: { runId: latestReconciliation?.id ?? null, status: latestReconciliation?.status ?? (reconciliation.clean ? "CLEAN" : "FAILURE"), action: reconciliation.action, mismatches: reconciliation.mismatches, completedAt: latestReconciliation?.completedAt ?? null },
    reconciliationRuns: reconciliationHistory.map(toReconciliationRun),
    positionSnapshots: positions,
    fillSnapshots: fills,
    rehearsal,
    timeline: [
      "Live execution starts DISABLED after every application restart.",
      "Venue state must be fetched before any future re-arm.",
      "Reconciliation and hard risk checks must pass before human arming.",
    ],
    incidents,
    incidentReviews: reviews.map((review) => toIncidentReview(review, requirements)),
    reactivationRequirements: requirements,
    events,
    firstFillHold,
    safety: { liveOrderTransmissionEnabled: false, householdCapitalAccessible: false, protectedCapitalAccessible: false, autoScale: false, aiCanPlaceOrders: false, aiCanChangeRisk: false, firstFillHoldActive: !firstFillHold.allowNewOrders },
  };
}

export async function runMicroLiveRehearsal(actor: Actor) {
  assertPermission(actor.role, "contribute");
  const { householdId, session } = await ensureMicroLiveSeed(actor);
  const rehearsal = runLiveRehearsal();
  await appendAuditEvent({
    householdId,
    eventType: "micro_live_rehearsal_completed",
    actor: actor.userId,
    entity: "micro_live_session",
    entityId: session.id,
    reason: "Rehearsal completed without transmitting orders",
    metadata: { status: rehearsal.status, liveOrderTransmission: rehearsal.liveOrderTransmission, chaosTests: rehearsal.chaosTests },
  });
  return rehearsal;
}

export async function reviewMicroLiveEnablement(actor: Actor) {
  assertPermission(actor.role, "approve");
  const snapshot = await getMicroLiveSnapshot(actor);
  const { householdId } = await ensureMicroLiveSeed(actor);
  await appendAuditEvent({
    householdId,
    eventType: "micro_live_enablement_reviewed",
    actor: actor.userId,
    entity: "micro_live",
    entityId: snapshot.session.id,
    reason: "Enablement gates reviewed without enabling live execution",
    metadata: { status: snapshot.status, readiness: snapshot.readiness, enabled: snapshot.enablement.enabled },
  });
  return { status: snapshot.status, readiness: snapshot.readiness, enablement: snapshot.enablement, liveExecutionEnabled: false };
}

export type VenueApprovalRequest = {
  credentialsReference: string;
  jurisdictionConfirmed: boolean;
  termsReviewed: boolean;
  marketPermissions: string[];
  withdrawalReviewed: boolean;
  withdrawalDisabled: boolean;
};

export type VenueReviewRequest = {
  reviewReference: string;
};

function isVenueReviewRequest(value: unknown, kind: "security" | "jurisdiction"): value is VenueReviewRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isIndependentReviewReference(candidate.reviewReference, kind);
}

function isVenueApprovalRequest(value: unknown): value is VenueApprovalRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return isServerCredentialReference(candidate.credentialsReference) &&
    typeof candidate.jurisdictionConfirmed === "boolean" &&
    typeof candidate.termsReviewed === "boolean" &&
    Array.isArray(candidate.marketPermissions) &&
    candidate.marketPermissions.every((market) => typeof market === "string") &&
    typeof candidate.withdrawalReviewed === "boolean" &&
    typeof candidate.withdrawalDisabled === "boolean" &&
    !Object.prototype.hasOwnProperty.call(candidate, "securityReviewReference") &&
    !Object.prototype.hasOwnProperty.call(candidate, "jurisdictionReviewReference");
}

async function loadMicroLiveVenue(actor: Actor, venueId: string) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  const [venue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");
  return { householdId, venue };
}

export async function recordMicroLiveVenueReview(
  actor: Actor,
  venueId: string,
  kind: "security" | "jurisdiction",
  request: unknown,
) {
  assertPermission(actor.role, kind === "security" ? "review_venue_security" : "review_venue_jurisdiction");
  if (!isVenueReviewRequest(request, kind)) {
    throw new GovernanceError("INVALID_STATE", "A valid independent review reference is required");
  }
  const { householdId } = await loadMicroLiveVenue(actor, venueId);
  const review = {
    reference: request.reviewReference,
    reviewerId: actor.userId,
    reviewedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const reviewColumn = kind === "security" ? "securityReview" : "jurisdictionReview";
  const [updatedVenue] = await db.update(venueRegistry).set({
    [reviewColumn]: review,
    status: "Review in progress",
    updatedAt: new Date(),
  }).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).returning();
  await appendAuditEvent({
    householdId,
    eventType: `micro_live_venue_${kind}_reviewed`,
    actor: actor.userId,
    entity: "venue_registry",
    entityId: venueId,
    reason: `Independent ${kind} review recorded; venue approval remains blocked until all gates pass`,
    metadata: {
      reviewReference: request.reviewReference,
      reviewerId: actor.userId,
      expiresAt: review.expiresAt,
      liveExecutionEnabled: false,
    },
  });
  return {
    venueId: updatedVenue.id,
    reviewType: kind,
    reviewedBy: actor.userId,
    reviewedAt: review.reviewedAt,
    expiresAt: review.expiresAt,
    liveExecutionEnabled: false,
  };
}

export async function approveMicroLiveVenue(
  actor: Actor,
  venueId: string,
  request: unknown,
) {
  assertPermission(actor.role, "approve");
  if (!isVenueApprovalRequest(request)) {
    throw new GovernanceError("INVALID_STATE", "A complete venue approval review is required");
  }

  const { householdId } = await ensureMicroLiveSeed(actor);
  const [venue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, venueId),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");
  const [otherApprovedVenue] = await db.select({ id: venueRegistry.id }).from(venueRegistry).where(and(
    eq(venueRegistry.householdId, householdId),
    eq(venueRegistry.integrationApproved, true),
  )).limit(1);
  if (otherApprovedVenue && otherApprovedVenue.id !== venueId) {
    throw new GovernanceError("INVALID_STATE", "Only one provider venue may be approved for Micro-Live");
  }

  const approval = evaluateVenueApproval({
    adapterType: venue.adapterType,
    integrationApproved: isReviewedVenueAdapterRegistered(venue.adapterType),
    adapterRegistered: isReviewedVenueAdapterRegistered(venue.adapterType),
    credentialsReference: request.credentialsReference,
    jurisdictionConfirmed: request.jurisdictionConfirmed,
    termsReviewed: request.termsReviewed,
    marketPermissions: request.marketPermissions,
    withdrawalReviewed: request.withdrawalReviewed,
    withdrawalDisabled: request.withdrawalDisabled,
    securityReview: venue.securityReview,
    jurisdictionReview: venue.jurisdictionReview,
    approvingActorId: actor.userId,
  });
  if (!approval.approved) {
    throw new GovernanceError("INVALID_STATE", "Venue approval is incomplete; no live enablement was granted");
  }

  const [approvedVenue] = await db.update(venueRegistry)
    .set({
      integrationApproved: true,
      credentialsReference: request.credentialsReference,
      jurisdictionConfirmed: request.jurisdictionConfirmed,
      termsReviewed: request.termsReviewed,
      marketPermissions: request.marketPermissions.map((market) => market.trim()),
      withdrawalReviewed: request.withdrawalReviewed,
      withdrawalDisabled: request.withdrawalDisabled,
      status: "Approved for Micro-Live",
      approvedBy: actor.userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(venueRegistry.id, venueId), eq(venueRegistry.householdId, householdId)))
    .returning();

  await appendAuditEvent({
    householdId,
    eventType: "micro_live_venue_approved",
    actor: actor.userId,
    entity: "venue_registry",
    entityId: venueId,
    reason: "Real venue approval review completed; household capital remains inaccessible",
    metadata: {
      adapterType: venue.adapterType,
      jurisdictionConfirmed: approvedVenue.jurisdictionConfirmed,
      termsReviewed: approvedVenue.termsReviewed,
      marketPermissions: approvedVenue.marketPermissions,
      withdrawalReviewed: approvedVenue.withdrawalReviewed,
      withdrawalDisabled: approvedVenue.withdrawalDisabled,
      liveExecutionEnabled: false,
    },
  });
  return {
    venue: {
      id: approvedVenue.id,
      name: approvedVenue.name,
      adapterType: approvedVenue.adapterType,
      status: approvedVenue.status,
      marketPermissions: approvedVenue.marketPermissions,
      approval: evaluateVenueApproval({
        ...approvedVenue,
        adapterRegistered: isReviewedVenueAdapterRegistered(approvedVenue.adapterType),
        approvingActorId: actor.userId,
      }),
    },
    liveExecutionEnabled: false,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  };
}

export async function armMicroLive(actor: Actor, venueId: string) {
  assertPermission(actor.role, "approve");
  const snapshot = await getMicroLiveSnapshot(actor);
  const venue = snapshot.venues.find((candidate) => candidate.id === venueId);
  if (!venue) throw new GovernanceError("INVALID_STATE", "Venue is not registered for this household");
  const providerVenues = snapshot.venues.filter((candidate) =>
    candidate.adapterType !== "simulated" && candidate.adapterType !== "provider-neutral");
  if (providerVenues.length !== 1 || providerVenues[0]?.id !== venueId) {
    throw new GovernanceError("INVALID_STATE", "Micro-Live requires exactly one selected provider venue");
  }
  if (!snapshot.firstFillHold.allowNewOrders) {
    throw new GovernanceError("INVALID_STATE", "First-fill review hold must be explicitly cleared before re-arming");
  }

  const approval = venue.approval;
  const enablement = evaluateLiveEnablement({
    strategyMicroLiveEligible: false,
    humanApproval: true,
    capitalGovernorPass: true,
    riskGovernorPass: true,
    venueHealthy: venue.health === "HEALTHY" && venue.adapterType !== "provider-neutral",
    reconciliationClean: snapshot.reconciliation.status === "CLEAN",
    venueApproved: approval.approved,
    marketApproved: venue.marketPermissions.length > 0,
    jurisdictionConfirmed: venue.jurisdictionConfirmed,
    credentialsConfigured: venue.credentialsConfigured,
    withdrawalDisabled: venue.withdrawalDisabled,
    approvedIntegration: approval.checks[0]?.passed === true,
    termsReviewed: venue.termsReviewed,
    marketPermissionsConfigured: venue.marketPermissions.length > 0,
    withdrawalReviewed: venue.withdrawalReviewed,
    householdCapitalAccessible: false,
    protectedCapitalAccessible: false,
  });
  if (!enablement.enabled) {
    throw new GovernanceError("INVALID_STATE", "Human arming is blocked until strategy, venue, market, risk, and reconciliation gates pass");
  }
  await armExecutionControl(actor);

  const expiresAt = new Date(Date.now() + defaultMicroLivePolicy.authorizationHours * 60 * 60 * 1000);
  const [session] = await db.update(microLiveSessions)
    .set({
      venueId,
      status: "MICRO_LIVE_ARMED",
      mode: "MICRO_LIVE",
      authorizationExpiresAt: expiresAt,
      armedBy: actor.userId,
      armedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(microLiveSessions.id, snapshot.session.id),
      eq(microLiveSessions.householdId, actor.householdId),
    ))
    .returning();
  await appendAuditEvent({
    householdId: session.householdId,
    eventType: "micro_live_human_armed",
    actor: actor.userId,
    entity: "micro_live_session",
    entityId: session.id,
    reason: "Human-controlled arming completed after all enablement gates passed",
    metadata: { venueId, authorizationExpiresAt: expiresAt.toISOString(), liveExecutionEnabled: false },
  });
  return { status: session.status, sessionId: session.id, authorizationExpiresAt: expiresAt, liveExecutionEnabled: false };
}

export async function runMicroLiveReconciliation(actor: Actor) {
  assertPermission(actor.role, "contribute");
  const { householdId, session } = await ensureMicroLiveSeed(actor);
  const [sessionVenue] = await db.select().from(venueRegistry).where(and(
    eq(venueRegistry.id, session.venueId ?? ""),
    eq(venueRegistry.householdId, householdId),
  )).limit(1);
  if (sessionVenue && sessionVenue.adapterType !== "simulated") {
    if (sessionVenue.adapterType === "provider-neutral") {
      throw new GovernanceError("INVALID_STATE", "Provider-neutral rehearsal venues cannot reconcile live orders");
    }
    let adapter: VenueAdapter | undefined;
    try {
      adapter = await createLiveVenueAdapter(householdId, sessionVenue);
      await adapter.connect();
      const priorOrders = await db.select({ externalOrderId: venueOrders.externalOrderId })
        .from(venueOrders)
        .innerJoin(orderIntents, eq(venueOrders.orderIntentId, orderIntents.id))
        .where(and(
          eq(orderIntents.householdId, householdId),
          eq(orderIntents.sessionId, session.id),
        ));
      const liveResult = await persistProviderStateAndReconcile({
        actor,
        sessionId: session.id,
        venueId: sessionVenue.id,
        adapter,
        orderIdsToVerify: priorOrders.flatMap((order) => order.externalOrderId ? [order.externalOrderId] : []),
      });
      return toReconciliationRun(liveResult.run);
    } catch (error) {
      await persistExecutionIncident({
        householdId,
        sessionId: session.id,
        actor,
        incidentType: "RECONCILIATION_FAILURE",
        title: "Provider reconciliation failed closed",
        reason: error instanceof Error ? error.message : "Provider reconciliation failed",
      }).catch(() => undefined);
      throw error;
    } finally {
      await adapter?.disconnect().catch(() => undefined);
    }
  }
  const rehearsalAdapter = new SimulatedVenueAdapter();
  await rehearsalAdapter.connect();
  const capturedAt = new Date();
  const [internalPosition] = await db.select().from(positionSnapshots)
    .where(and(eq(positionSnapshots.householdId, householdId), eq(positionSnapshots.source, "INTERNAL")))
    .orderBy(desc(positionSnapshots.capturedAt)).limit(1);
  const internalFills = await db.select({ externalFillId: executionFills.externalFillId }).from(executionFills)
    .where(eq(executionFills.householdId, householdId));
  const internalPositionCents = asCents(internalPosition?.notional);
  let recovery: Awaited<ReturnType<typeof recoverExecutionState>>;
  try {
    recovery = await recoverExecutionState(rehearsalAdapter, {
      internalPositionCents,
      internalOpenOrders: 0,
      internalFillIds: internalFills.map((fill) => fill.externalFillId),
    });
  } catch (error) {
    await rehearsalAdapter.disconnect().catch(() => undefined);
    return persistMicroLiveRecoveryFailure({ householdId, session, actor, error, capturedAt });
  }
  await rehearsalAdapter.disconnect();
  const venuePositionCents = recovery.venuePositionCents;
  const venueFills = recovery.fills;
  const result = recovery.reconciliation;
  const internalState = {
    positionCents: internalPositionCents,
    openOrders: 0,
    fillIds: internalFills.map((fill) => fill.externalFillId),
    source: "capital_os_oms",
  };
  const venueState = {
    positionCents: venuePositionCents,
    openOrders: recovery.openOrders.length,
    fillIds: venueFills.map((fill) => fill.externalFillId),
    source: "simulated_rehearsal_adapter",
    venueHealth: recovery.venueHealth,
    balances: recovery.balances,
  };
  if (venueFills.length > 0) {
    await db.insert(fillSnapshots).values(venueFills.map((fill) => ({
      householdId,
      sessionId: session.id,
      venueId: session.venueId,
      externalFillId: fill.externalFillId,
      marketId: fill.marketId,
      source: "VENUE",
      side: "unknown",
      quantity: fill.quantity.toString(),
      price: fill.price.toString(),
      fee: fill.fee.toString(),
      metadata: { externalOrderId: fill.externalOrderId, reconciledAt: capturedAt.toISOString() },
      capturedAt,
    }))).onConflictDoNothing();
  }
  const [run] = await db.insert(reconciliationRuns).values({
    householdId,
    sessionId: session.id,
    status: result.clean ? "CLEAN" : "FAILURE",
    mismatches: result.mismatches,
    internalState,
    venueState,
    completedAt: capturedAt,
  }).returning();

  if (!result.clean) {
    await db.update(microLiveSessions).set({
      status: "STOP",
      stoppedAt: capturedAt,
      updatedAt: capturedAt,
    }).where(and(eq(microLiveSessions.id, session.id), eq(microLiveSessions.householdId, householdId)));
    const [existingIncident] = await db.select({ id: tradingIncidents.id }).from(tradingIncidents).where(and(
      eq(tradingIncidents.householdId, householdId),
      eq(tradingIncidents.incidentType, "RECONCILIATION_MISMATCH"),
      eq(tradingIncidents.status, "OPEN"),
    )).limit(1);
    if (!existingIncident) {
      await db.insert(tradingIncidents).values({
        householdId,
        sessionId: session.id,
        severity: "CRITICAL",
        incidentType: "RECONCILIATION_MISMATCH",
        title: "Venue and internal execution state disagree",
        timeline: [
          `Reconciliation run ${run.id} found a position, order, or fill mismatch.`,
          "New exposure is blocked until venue-authoritative state is fetched and rebuilt.",
          "A human post-incident review is required before reactivation.",
        ],
        capitalImpact: ((venuePositionCents - internalPositionCents) / 100).toFixed(2),
        status: "OPEN",
      });
    }
  }

  await appendAuditEvent({
    householdId,
    eventType: "micro_live_reconciliation_completed",
    actor: actor.userId,
    entity: "reconciliation_run",
    entityId: run.id,
    reason: result.clean ? "Venue-authoritative reconciliation completed cleanly" : "Reconciliation mismatch contained; new exposure remains blocked",
    metadata: { status: run.status, mismatches: result.mismatches, liveExecutionEnabled: false },
  });
  return toReconciliationRun(run);
}

export async function listMicroLiveReconciliationRuns(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  const runs = await db.select().from(reconciliationRuns)
    .where(eq(reconciliationRuns.householdId, householdId))
    .orderBy(desc(reconciliationRuns.completedAt)).limit(50);
  return runs.map(toReconciliationRun);
}

export async function listMicroLivePositionSnapshots(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  return db.select().from(positionSnapshots)
    .where(eq(positionSnapshots.householdId, householdId))
    .orderBy(desc(positionSnapshots.capturedAt)).limit(50);
}

export async function listMicroLiveFillSnapshots(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  return db.select().from(fillSnapshots)
    .where(eq(fillSnapshots.householdId, householdId))
    .orderBy(desc(fillSnapshots.capturedAt)).limit(50);
}

export async function listMicroLiveIncidents(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  const [incidents, reviews, requirements] = await Promise.all([
    db.select().from(tradingIncidents).where(and(eq(tradingIncidents.householdId, householdId), eq(tradingIncidents.status, "OPEN"))).orderBy(desc(tradingIncidents.createdAt)).limit(50),
    db.select().from(postIncidentReviews).where(eq(postIncidentReviews.householdId, householdId)),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, householdId)),
  ]);
  return incidents.map((incident) => toIncident(incident, reviews, requirements));
}

export async function listMicroLiveIncidentReviews(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  const [reviews, requirements] = await Promise.all([
    db.select().from(postIncidentReviews)
    .where(eq(postIncidentReviews.householdId, householdId))
    .orderBy(desc(postIncidentReviews.reviewedAt)).limit(50),
    db.select().from(reactivationRequirements).where(eq(reactivationRequirements.householdId, householdId)),
  ]);
  return reviews.map((review) => toIncidentReview(review, requirements));
}

export async function listMicroLiveReactivationRequirements(actor: Actor) {
  const { householdId } = await ensureMicroLiveSeed(actor);
  return db.select().from(reactivationRequirements)
    .where(eq(reactivationRequirements.householdId, householdId))
    .orderBy(desc(reactivationRequirements.createdAt)).limit(100);
}

type IncidentReviewRequest = {
  rootCause: string;
  capitalImpact: string;
  safeguardsWorked: string[];
  requiredFixes: string[];
  reactivationRequirements: string[];
  notes?: string | null;
};

function isIncidentReviewRequest(value: unknown): value is IncidentReviewRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.rootCause === "string" && candidate.rootCause.trim().length > 0 &&
    typeof candidate.capitalImpact === "string" && /^-?[0-9]+(\.[0-9]{1,2})?$/.test(candidate.capitalImpact) &&
    isStringArray(candidate.safeguardsWorked) && isStringArray(candidate.requiredFixes) &&
    isStringArray(candidate.reactivationRequirements) && candidate.reactivationRequirements.length > 0 &&
    (candidate.notes === undefined || candidate.notes === null || typeof candidate.notes === "string");
}

export async function createMicroLiveIncidentReview(actor: Actor, incidentId: string, request: unknown) {
  assertPermission(actor.role, "approve");
  if (!isIncidentReviewRequest(request)) {
    throw new GovernanceError("INVALID_STATE", "A complete human post-incident review is required");
  }
  const { householdId } = await ensureMicroLiveSeed(actor);
  const [incident] = await db.select().from(tradingIncidents).where(and(
    eq(tradingIncidents.id, incidentId),
    eq(tradingIncidents.householdId, householdId),
  )).limit(1);
  if (!incident) throw new GovernanceError("INVALID_STATE", "Incident is not registered for this household");
  const [existingReview] = await db.select({ id: postIncidentReviews.id }).from(postIncidentReviews)
    .where(eq(postIncidentReviews.incidentId, incidentId)).limit(1);
  if (existingReview) throw new GovernanceError("INVALID_STATE", "This incident already has a post-incident review");

  const result = await db.transaction(async (tx) => {
    const [review] = await tx.insert(postIncidentReviews).values({
      householdId,
      incidentId,
      reviewedBy: actor.userId,
      rootCause: request.rootCause.trim(),
      capitalImpact: request.capitalImpact,
      safeguardsWorked: request.safeguardsWorked.map((item) => item.trim()),
      requiredFixes: request.requiredFixes.map((item) => item.trim()),
      reactivationRequirements: request.reactivationRequirements.map((item) => item.trim()),
      notes: request.notes?.trim() || null,
    }).returning();
    const requirements = await tx.insert(reactivationRequirements).values(
      request.reactivationRequirements.map((requirement) => ({
        householdId,
        incidentId,
        reviewId: review.id,
        requirement: requirement.trim(),
        status: "OPEN",
      })),
    ).returning();
    return { review, requirements };
  });
  await appendAuditEvent({
    householdId,
    eventType: "micro_live_incident_review_recorded",
    actor: actor.userId,
    entity: "trading_incident",
    entityId: incidentId,
    reason: "Human post-incident review recorded; reactivation remains blocked until requirements are complete",
    metadata: { reviewId: result.review.id, requirementCount: result.requirements.length, liveExecutionEnabled: false },
  });
  return {
    ...result.review,
    requirements: result.requirements,
  };
}

export async function completeMicroLiveReactivationRequirement(actor: Actor, requirementId: string) {
  assertPermission(actor.role, "approve");
  const { householdId } = await ensureMicroLiveSeed(actor);
  const [requirement] = await db.select().from(reactivationRequirements).where(and(
    eq(reactivationRequirements.id, requirementId),
    eq(reactivationRequirements.householdId, householdId),
  )).limit(1);
  if (!requirement) throw new GovernanceError("INVALID_STATE", "Reactivation requirement is not registered for this household");
  const completedAt = requirement.status === "COMPLETE" ? requirement.completedAt ?? new Date() : new Date();
  const [completed] = await db.update(reactivationRequirements).set({
    status: "COMPLETE",
    completedBy: actor.userId,
    completedAt,
  }).where(and(
    eq(reactivationRequirements.id, requirementId),
    eq(reactivationRequirements.householdId, householdId),
  )).returning();
  const remaining = await db.select({ id: reactivationRequirements.id }).from(reactivationRequirements).where(and(
    eq(reactivationRequirements.incidentId, completed.incidentId),
    eq(reactivationRequirements.householdId, householdId),
    eq(reactivationRequirements.status, "OPEN"),
  ));
  if (remaining.length === 0) {
    await db.update(tradingIncidents).set({ status: "RESOLVED", resolvedAt: new Date() }).where(and(
      eq(tradingIncidents.id, completed.incidentId),
      eq(tradingIncidents.householdId, householdId),
    ));
  }
  await appendAuditEvent({
    householdId,
    eventType: "micro_live_reactivation_requirement_completed",
    actor: actor.userId,
    entity: "reactivation_requirement",
    entityId: requirementId,
    reason: remaining.length === 0 ? "All human reactivation requirements completed; incident resolved" : "Human reactivation requirement completed; incident remains blocked",
    metadata: { incidentId: completed.incidentId, remainingRequirements: remaining.length, liveExecutionEnabled: false },
  });
  return completed;
}