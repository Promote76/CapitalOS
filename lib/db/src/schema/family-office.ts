import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

export const familyOfficeRuns = pgTable(
  "family_office_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    analyst: text("analyst").notNull().default("Research Analyst"),
    scope: text("scope").notNull(),
    status: text("status").notNull().default("queued"),
    providerStatus: text("provider_status").notNull().default("disabled"),
    errorCode: text("error_code"),
    outputSummary: text("output_summary"),
    costCents: numeric("cost_cents", { precision: 12, scale: 2 }).notNull().default("0"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    householdIdx: index("family_office_runs_household_idx").on(table.householdId),
    createdIdx: index("family_office_runs_created_idx").on(table.createdAt),
  }),
);

export const familyOfficeEvidence = pgTable(
  "family_office_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull().references(() => familyOfficeRuns.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull().default("user_context"),
    title: text("title").notNull(),
    sourceUrl: text("source_url"),
    excerpt: text("excerpt").notNull(),
    classification: text("classification").notNull().default("unverified"),
    freshness: text("freshness").notNull().default("unknown"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("family_office_evidence_household_idx").on(table.householdId),
    runIdx: index("family_office_evidence_run_idx").on(table.runId),
  }),
);

export const familyOfficeProposals = pgTable(
  "family_office_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => familyOfficeRuns.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    thesis: text("thesis").notNull(),
    label: text("label").notNull().default("RESEARCH_ONLY"),
    analyticalDirection: text("analytical_direction").notNull().default("NEUTRAL"),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    facts: jsonb("facts").$type<string[]>().notNull().default([]),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    risks: jsonb("risks").$type<string[]>().notNull().default([]),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("proposed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewReason: text("review_reason"),
  },
  (table) => ({
    householdIdx: index("family_office_proposals_household_idx").on(table.householdId),
    statusIdx: index("family_office_proposals_status_idx").on(table.status),
  }),
);

export const shadowPortfolios = pgTable(
  "shadow_portfolios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    benchmark: text("benchmark").notNull().default("Not configured"),
    strategy: text("strategy").notNull().default("Research only"),
    capitalModel: text("capital_model").notNull().default("hypothetical"),
    riskPolicy: text("risk_policy").notNull().default("No real capital; human review required"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("shadow_portfolios_household_idx").on(table.householdId),
  }),
);

export const shadowOrderIntents = pgTable(
  "shadow_order_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").notNull().references(() => familyOfficeProposals.id, { onDelete: "restrict" }),
    shadowPortfolioId: uuid("shadow_portfolio_id").notNull().references(() => shadowPortfolios.id, { onDelete: "restrict" }),
    symbol: text("symbol").notNull(),
    direction: text("direction").notNull(),
    hypotheticalQuantity: numeric("hypothetical_quantity", { precision: 24, scale: 8 }).notNull(),
    hypotheticalNotional: numeric("hypothetical_notional", { precision: 18, scale: 2 }).notNull(),
    referencePrice: numeric("reference_price", { precision: 24, scale: 8 }).notNull(),
    referenceTimestamp: timestamp("reference_timestamp", { withTimezone: true }).notNull(),
    timeHorizon: text("time_horizon").notNull(),
    model: text("model").notNull().default("shadow-reference"),
    agent: text("agent").notNull().default("AI CIO"),
    status: text("status").notNull().default("hypothetical"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("shadow_order_intents_household_idx").on(table.householdId),
    portfolioIdx: index("shadow_order_intents_portfolio_idx").on(table.shadowPortfolioId),
  }),
);

export const taxLienCandidates = pgTable(
  "tax_lien_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    jurisdiction: text("jurisdiction").notNull().default("Florida"),
    county: text("county").notNull(),
    parcelId: text("parcel_id").notNull(),
    certificateNumber: text("certificate_number").notNull(),
    propertyAddress: text("property_address").notNull(),
    sourceKind: text("source_kind").notNull().default("user_supplied"),
    sourceUrl: text("source_url"),
    sourceRetrievedAt: timestamp("source_retrieved_at", { withTimezone: true }),
    sourceFreshness: text("source_freshness").notNull().default("unknown"),
    officialParcelId: text("official_parcel_id"),
    officialCertificateNumber: text("official_certificate_number"),
    redemptionStatus: text("redemption_status").notNull().default("unknown"),
    redemptionDeadline: text("redemption_deadline"),
    liveAvailability: text("live_availability").notNull().default("unknown"),
    availabilityCheckedAt: timestamp("availability_checked_at", { withTimezone: true }),
    faceAmount: numeric("face_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    estimatedTotalExposure: numeric("estimated_total_exposure", { precision: 18, scale: 2 }).notNull().default("0"),
    estimatedPropertyValue: numeric("estimated_property_value", { precision: 18, scale: 2 }).notNull().default("0"),
    householdSafeToDeploy: numeric("household_safe_to_deploy", { precision: 18, scale: 2 }).notNull().default("0"),
    requiredReserveFloor: numeric("required_reserve_floor", { precision: 18, scale: 2 }).notNull().default("0"),
    reconciliationStatus: text("reconciliation_status").notNull().default("unresolved"),
    reserveStatus: text("reserve_status").notNull().default("unknown"),
    reviewStatus: text("review_status").notNull().default("research"),
    hardStops: jsonb("hard_stops").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("tax_lien_candidates_household_idx").on(table.householdId),
    countyIdx: index("tax_lien_candidates_county_idx").on(table.county),
    statusIdx: index("tax_lien_candidates_status_idx").on(table.reviewStatus),
  }),
);

export type FamilyOfficeRun = typeof familyOfficeRuns.$inferSelect;
export type FamilyOfficeEvidence = typeof familyOfficeEvidence.$inferSelect;
export type FamilyOfficeProposal = typeof familyOfficeProposals.$inferSelect;
export type ShadowPortfolio = typeof shadowPortfolios.$inferSelect;
export type ShadowOrderIntent = typeof shadowOrderIntents.$inferSelect;
export type TaxLienCandidate = typeof taxLienCandidates.$inferSelect;