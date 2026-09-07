import {
  boolean,
  index,
  integer,
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

export const familyOfficeRefreshes = pgTable(
  "family_office_refreshes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull().default("on_demand"),
    status: text("status").notNull().default("requested"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    providerStatus: text("provider_status").notNull().default("disabled"),
    failureClassification: text("failure_classification"),
    evidenceFreshness: text("evidence_freshness").notNull().default("unknown"),
    resultFingerprint: text("result_fingerprint"),
    skipReason: text("skip_reason"),
    runId: uuid("run_id").references(() => familyOfficeRuns.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id),
  },
  (table) => ({
    householdIdx: index("family_office_refreshes_household_idx").on(table.householdId),
    householdRequestedIdx: index("family_office_refreshes_household_requested_idx").on(table.householdId, table.requestedAt),
    triggerRequestedIdx: index("family_office_refreshes_trigger_requested_idx").on(table.trigger, table.requestedAt),
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

export const shadowPortfolioOutcomes = pgTable(
  "shadow_portfolio_outcomes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    shadowPortfolioId: uuid("shadow_portfolio_id").notNull().references(() => shadowPortfolios.id, { onDelete: "cascade" }),
    shadowIntentId: uuid("shadow_intent_id").references(() => shadowOrderIntents.id, { onDelete: "set null" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    status: text("status").notNull().default("unknown"),
    shadowReturnBps: numeric("shadow_return_bps", { precision: 10, scale: 2 }),
    benchmarkReturnBps: numeric("benchmark_return_bps", { precision: 10, scale: 2 }),
    attributionBps: numeric("attribution_bps", { precision: 10, scale: 2 }),
    maxDrawdownBps: numeric("max_drawdown_bps", { precision: 10, scale: 2 }),
    confidence: numeric("confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("shadow_portfolio_outcomes_household_idx").on(table.householdId),
    portfolioIdx: index("shadow_portfolio_outcomes_portfolio_idx").on(table.shadowPortfolioId),
    asOfIdx: index("shadow_portfolio_outcomes_as_of_idx").on(table.asOf),
  }),
);

export const familyOfficeAnalystScorecards = pgTable(
  "family_office_analyst_scorecards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    analyst: text("analyst").notNull(),
    specialty: text("specialty").notNull(),
    status: text("status").notNull().default("unrated"),
    assignmentCount: integer("assignment_count").notNull().default(0),
    completedCount: integer("completed_count").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    qualityScore: numeric("quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
    calibrationScore: numeric("calibration_score", { precision: 5, scale: 2 }).notNull().default("0"),
    budgetCents: integer("budget_cents").notNull().default(0),
    spentCents: integer("spent_cents").notNull().default(0),
    valueCents: integer("value_cents").notNull().default(0),
    authority: text("authority").notNull().default("advisory_only"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdAnalystIdx: index("family_office_analyst_scorecards_household_idx").on(table.householdId, table.analyst),
  }),
);

export const familyOfficeReports = pgTable(
  "family_office_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    reportType: text("report_type").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("unknown"),
    freshness: text("freshness").notNull().default("unknown"),
    summary: text("summary"),
    citations: jsonb("citations").$type<Array<{ title: string; sourceUrl: string | null; freshness: string }>>().notNull().default([]),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    executionDisabled: boolean("execution_disabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdReportIdx: index("family_office_reports_household_idx").on(table.householdId, table.reportType),
    scheduledIdx: index("family_office_reports_scheduled_idx").on(table.scheduledFor),
  }),
);

export const taxLienCertificateCandidates = pgTable(
  "tax_lien_certificate_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    jurisdictionPolicy: text("jurisdiction_policy").notNull().default("FLORIDA_COUNTY_HELD_V1"),
    county: text("county").notNull(),
    state: text("state").notNull().default("FL"),
    certificateNumber: text("certificate_number").notNull(),
    parcelNumber: text("parcel_number").notNull(),
    taxYear: text("tax_year").notNull(),
    faceAmount: numeric("face_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    currentPurchaseAmount: numeric("current_purchase_amount", { precision: 18, scale: 2 }).notNull().default("0"),
    statedRate: numeric("stated_rate", { precision: 7, scale: 4 }),
    status: text("status").notNull().default("historical_research"),
    owner: text("owner"),
    propertyAddress: text("property_address"),
    legalDescription: text("legal_description"),
    propertyUse: text("property_use"),
    acreage: numeric("acreage", { precision: 12, scale: 4 }),
    assessedValue: numeric("assessed_value", { precision: 18, scale: 2 }),
    justValue: numeric("just_value", { precision: 18, scale: 2 }),
    conservativeValue: numeric("conservative_value", { precision: 18, scale: 2 }),
    certToValue: numeric("cert_to_value", { precision: 8, scale: 4 }),
    totalLienExposure: numeric("total_lien_exposure", { precision: 18, scale: 2 }),
    totalExposureToValue: numeric("total_exposure_to_value", { precision: 8, scale: 4 }),
    homesteadStatus: text("homestead_status").notNull().default("unknown"),
    priorCertificates: jsonb("prior_certificates").$type<string[]>().notNull().default([]),
    openCertificates: jsonb("open_certificates").$type<string[]>().notNull().default([]),
    redeemedCertificates: jsonb("redeemed_certificates").$type<string[]>().notNull().default([]),
    taxDeedHistory: jsonb("tax_deed_history").$type<string[]>().notNull().default([]),
    access: text("access").notNull().default("unknown"),
    buildability: text("buildability").notNull().default("unknown"),
    flood: text("flood").notNull().default("unknown"),
    wetland: text("wetland").notNull().default("unknown"),
    codeStatus: text("code_status").notNull().default("unknown"),
    titleRisk: text("title_risk").notNull().default("unknown"),
    redemptionAssessment: text("redemption_assessment").notNull().default("unknown"),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    liveAvailability: text("live_availability").notNull().default("unverified"),
    parcelReconciliation: text("parcel_reconciliation").notNull().default("unresolved"),
    certificateReconciliation: text("certificate_reconciliation").notNull().default("unresolved"),
    sourceRecords: jsonb("source_records").$type<Array<{
      title: string;
      sourceKind: string;
      sourceUrl?: string;
      verifiedAt?: string;
    }>>().notNull().default([]),
    dataFreshness: text("data_freshness").notNull().default("unknown"),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    decision: text("decision").notNull().default("REVIEW_REQUIRED"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("tax_lien_certificate_candidates_household_idx").on(table.householdId),
    countyIdx: index("tax_lien_certificate_candidates_county_idx").on(table.county),
    parcelIdx: index("tax_lien_certificate_candidates_parcel_idx").on(table.parcelNumber),
    certificateIdx: index("tax_lien_certificate_candidates_certificate_idx").on(table.certificateNumber),
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
export type ShadowPortfolioOutcome = typeof shadowPortfolioOutcomes.$inferSelect;
export type FamilyOfficeAnalystScorecard = typeof familyOfficeAnalystScorecards.$inferSelect;
export type FamilyOfficeReport = typeof familyOfficeReports.$inferSelect;

export type TaxLienCertificateCandidate = typeof taxLienCertificateCandidates.$inferSelect;
export type TaxLienCandidate = typeof taxLienCandidates.$inferSelect;
