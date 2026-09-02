import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";
import { strategies, strategyVersions } from "./property-strategy.ts";

export type StoredIndependentVenueReview = {
  reference: string;
  reviewerId: string;
  reviewedAt: string;
  expiresAt: string;
};

export const microLivePolicies = pgTable(
  "micro_live_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().unique().references(() => households.id, { onDelete: "cascade" }),
    policyVersion: text("policy_version").notNull().default("sandbox-1"),
    limits: jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
    autoScale: boolean("auto_scale").notNull().default(false),
    leverageEnabled: boolean("leverage_enabled").notNull().default(false),
    marginEnabled: boolean("margin_enabled").notNull().default(false),
    borrowingEnabled: boolean("borrowing_enabled").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ householdIdx: uniqueIndex("micro_live_policies_household_idx").on(table.householdId) }),
);

export const venueRegistry = pgTable(
  "venue_registry",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    adapterType: text("adapter_type").notNull().default("simulated"),
    status: text("status").notNull().default("Research"),
    capabilities: jsonb("capabilities").$type<Record<string, boolean>>().notNull().default({}),
    jurisdictionConfirmed: boolean("jurisdiction_confirmed").notNull().default(false),
    credentialsReference: text("credentials_reference"),
    integrationApproved: boolean("integration_approved").notNull().default(false),
    termsReviewed: boolean("terms_reviewed").notNull().default(false),
    marketPermissions: jsonb("market_permissions").$type<string[]>().notNull().default([]),
    withdrawalReviewed: boolean("withdrawal_reviewed").notNull().default(false),
    withdrawalDisabled: boolean("withdrawal_disabled").notNull().default(false),
    securityReview: jsonb("security_review").$type<StoredIndependentVenueReview | null>(),
    jurisdictionReview: jsonb("jurisdiction_review").$type<StoredIndependentVenueReview | null>(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ householdIdx: index("venue_registry_household_idx").on(table.householdId) }),
);

export const microLiveSessions = pgTable(
  "micro_live_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    strategyVersionId: uuid("strategy_version_id").references(() => strategyVersions.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venueRegistry.id, { onDelete: "set null" }),
    status: text("status").notNull().default("DISABLED"),
    mode: text("mode").notNull().default("LIVE_REHEARSAL"),
    capitalAllocated: numeric("capital_allocated", { precision: 18, scale: 2 }).notNull().default("0"),
    sessionLossLimit: numeric("session_loss_limit", { precision: 18, scale: 2 }).notNull().default("0"),
    sessionExposureCap: numeric("session_exposure_cap", { precision: 18, scale: 2 }).notNull().default("0"),
    authorizationExpiresAt: timestamp("authorization_expires_at", { withTimezone: true }),
    armedBy: uuid("armed_by").references(() => users.id),
    armedAt: timestamp("armed_at", { withTimezone: true }),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ householdIdx: index("micro_live_sessions_household_idx").on(table.householdId) }),
);

export const orderIntents = pgTable(
  "order_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => microLiveSessions.id, { onDelete: "set null" }),
    strategyId: uuid("strategy_id").references(() => strategies.id, { onDelete: "set null" }),
    strategyVersionId: uuid("strategy_version_id").references(() => strategyVersions.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venueRegistry.id, { onDelete: "set null" }),
    marketId: text("market_id").notNull(),
    clientOrderId: text("client_order_id").notNull(),
    side: text("side").notNull(),
    orderType: text("order_type").notNull(),
    price: numeric("price", { precision: 18, scale: 8 }),
    quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
    state: text("state").notNull().default("CREATED"),
    validation: jsonb("validation").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("order_intents_household_idx").on(table.householdId),
    clientOrderIdx: uniqueIndex("order_intents_client_order_id_idx").on(table.clientOrderId),
  }),
);

export const venueOrders = pgTable(
  "venue_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderIntentId: uuid("order_intent_id").notNull().references(() => orderIntents.id, { onDelete: "cascade" }),
    externalOrderId: text("external_order_id"),
    venueStatus: text("venue_status"),
    rawResponse: jsonb("raw_response").$type<Record<string, unknown>>().notNull().default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ intentIdx: uniqueIndex("venue_orders_intent_idx").on(table.orderIntentId) }),
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderIntentId: uuid("order_intent_id").notNull().references(() => orderIntents.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    externalEventId: text("external_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orderIdx: index("order_events_order_idx").on(table.orderIntentId),
    externalEventIdx: uniqueIndex("order_events_external_event_idx").on(table.externalEventId),
  }),
);

export const executionFills = pgTable(
  "execution_fills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    orderIntentId: uuid("order_intent_id").references(() => orderIntents.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venueRegistry.id, { onDelete: "set null" }),
    externalFillId: text("external_fill_id").notNull(),
    marketId: text("market_id").notNull(),
    side: text("side").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    fee: numeric("fee", { precision: 18, scale: 8 }).notNull().default("0"),
    markouts: jsonb("markouts").$type<Record<string, number>>().notNull().default({}),
    filledAt: timestamp("filled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("execution_fills_household_idx").on(table.householdId),
    externalFillIdx: uniqueIndex("execution_fills_external_fill_idx").on(table.externalFillId),
  }),
);

export const positionSnapshots = pgTable(
  "position_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => microLiveSessions.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venueRegistry.id, { onDelete: "set null" }),
    marketId: text("market_id").notNull(),
    source: text("source").notNull().default("INTERNAL"),
    quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull().default("0"),
    averagePrice: numeric("average_price", { precision: 18, scale: 8 }).notNull().default("0"),
    markPrice: numeric("mark_price", { precision: 18, scale: 8 }).notNull().default("0"),
    notional: numeric("notional", { precision: 18, scale: 2 }).notNull().default("0"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("position_snapshots_household_idx").on(table.householdId),
    capturedIdx: index("position_snapshots_captured_idx").on(table.householdId, table.capturedAt),
  }),
);

export const fillSnapshots = pgTable(
  "fill_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => microLiveSessions.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venueRegistry.id, { onDelete: "set null" }),
    externalFillId: text("external_fill_id").notNull(),
    marketId: text("market_id").notNull(),
    source: text("source").notNull().default("VENUE"),
    side: text("side").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 8 }).notNull(),
    price: numeric("price", { precision: 18, scale: 8 }).notNull(),
    fee: numeric("fee", { precision: 18, scale: 8 }).notNull().default("0"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("fill_snapshots_household_idx").on(table.householdId),
    externalFillIdx: uniqueIndex("fill_snapshots_external_source_idx").on(table.externalFillId, table.source),
    capturedIdx: index("fill_snapshots_captured_idx").on(table.householdId, table.capturedAt),
  }),
);

export const reconciliationRuns = pgTable(
  "reconciliation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => microLiveSessions.id, { onDelete: "set null" }),
    status: text("status").notNull().default("CLEAN"),
    mismatches: jsonb("mismatches").$type<Record<string, unknown>>().notNull().default({}),
    internalState: jsonb("internal_state").$type<Record<string, unknown>>().notNull().default({}),
    venueState: jsonb("venue_state").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ householdIdx: index("reconciliation_runs_household_idx").on(table.householdId) }),
);

export const guardianHeartbeats = pgTable(
  "guardian_heartbeats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    status: text("status").notNull().default("HEALTHY"),
    observedExposure: numeric("observed_exposure", { precision: 18, scale: 2 }).notNull().default("0"),
    reportedExposure: numeric("reported_exposure", { precision: 18, scale: 2 }).notNull().default("0"),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).defaultNow().notNull(),
    signatureValid: boolean("signature_valid").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({ householdIdx: index("guardian_heartbeats_household_idx").on(table.householdId) }),
);

export const tradingIncidents = pgTable(
  "trading_incidents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => microLiveSessions.id, { onDelete: "set null" }),
    severity: text("severity").notNull(),
    incidentType: text("incident_type").notNull(),
    title: text("title").notNull(),
    timeline: jsonb("timeline").$type<string[]>().notNull().default([]),
    capitalImpact: numeric("capital_impact", { precision: 18, scale: 2 }).notNull().default("0"),
    status: text("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => ({ householdIdx: index("trading_incidents_household_idx").on(table.householdId) }),
);

export const postIncidentReviews = pgTable(
  "post_incident_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").notNull().unique().references(() => tradingIncidents.id, { onDelete: "cascade" }),
    reviewedBy: uuid("reviewed_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    rootCause: text("root_cause").notNull(),
    capitalImpact: numeric("capital_impact", { precision: 18, scale: 2 }).notNull().default("0"),
    safeguardsWorked: jsonb("safeguards_worked").$type<string[]>().notNull().default([]),
    requiredFixes: jsonb("required_fixes").$type<string[]>().notNull().default([]),
    reactivationRequirements: jsonb("reactivation_requirements").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("post_incident_reviews_household_idx").on(table.householdId),
    incidentIdx: uniqueIndex("post_incident_reviews_incident_idx").on(table.incidentId),
  }),
);

export const reactivationRequirements = pgTable(
  "reactivation_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    incidentId: uuid("incident_id").notNull().references(() => tradingIncidents.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").notNull().references(() => postIncidentReviews.id, { onDelete: "cascade" }),
    requirement: text("requirement").notNull(),
    status: text("status").notNull().default("OPEN"),
    completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("reactivation_requirements_household_idx").on(table.householdId),
    incidentIdx: index("reactivation_requirements_incident_idx").on(table.incidentId),
  }),
);

export type MicroLivePolicy = typeof microLivePolicies.$inferSelect;
export type VenueRegistryEntry = typeof venueRegistry.$inferSelect;
export type MicroLiveSession = typeof microLiveSessions.$inferSelect;
export type PositionSnapshot = typeof positionSnapshots.$inferSelect;
export type FillSnapshot = typeof fillSnapshots.$inferSelect;
export type ReconciliationRun = typeof reconciliationRuns.$inferSelect;
export type TradingIncident = typeof tradingIncidents.$inferSelect;
export type PostIncidentReview = typeof postIncidentReviews.$inferSelect;
export type ReactivationRequirement = typeof reactivationRequirements.$inferSelect;