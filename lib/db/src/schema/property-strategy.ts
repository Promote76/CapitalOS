import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";
import { milestoneStatusEnum, propertyStatusEnum, strategyStageEnum } from "./enums.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const propertyGoals = pgTable("property_goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetMarket: text("target_market"),
  targetBudget: money("target_budget"),
  estimatedDownPayment: money("estimated_down_payment"),
  estimatedClosingCosts: money("estimated_closing_costs"),
  readinessScore: numeric("readiness_score", { precision: 5, scale: 2 }).notNull().default("0"),
  targetDate: date("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const targetMarkets = pgTable(
  "target_markets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    medianPrice: money("median_price"),
    rentYield: numeric("rent_yield", { precision: 6, scale: 3 }).notNull().default("0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("target_markets_household_idx").on(table.householdId),
  }),
);

export const propertyCandidates = pgTable(
  "property_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyGoalId: uuid("property_goal_id")
      .notNull()
      .references(() => propertyGoals.id, { onDelete: "cascade" }),
    marketId: uuid("market_id").references(() => targetMarkets.id),
    addressLabel: text("address_label").notNull(),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    market: text("market"),
    propertyType: text("property_type").notNull().default("duplex"),
    units: numeric("units", { precision: 4, scale: 0 }).notNull().default("2"),
    bedrooms: numeric("bedrooms", { precision: 4, scale: 0 }).notNull().default("4"),
    bathrooms: numeric("bathrooms", { precision: 4, scale: 1 }).notNull().default("2"),
    askingPrice: money("asking_price"),
    estimatedMarketValue: money("estimated_market_value"),
    annualPropertyTaxes: money("annual_property_taxes"),
    insurance: money("insurance"),
    hoa: money("hoa"),
    estimatedRent: money("estimated_rent"),
    currentRents: money("current_rents"),
    vacancyAssumption: numeric("vacancy_assumption", { precision: 6, scale: 4 }).notNull().default("0.05"),
    downPayment: money("down_payment"),
    closingCosts: money("closing_costs"),
    repairs: money("repairs"),
    immediateRepairs: money("immediate_repairs"),
    deferredMaintenance: money("deferred_maintenance"),
    squareFootage: numeric("square_footage", { precision: 12, scale: 0 }),
    lotSize: numeric("lot_size", { precision: 12, scale: 2 }),
    yearBuilt: numeric("year_built", { precision: 5, scale: 0 }),
    listingSource: text("listing_source"),
    listingUrl: text("listing_url"),
    county: text("county"),
    zoning: text("zoning"),
    floodZone: text("flood_zone"),
    condition: text("condition"),
    utilities: money("utilities"),
    maintenance: money("maintenance"),
    ownerOccupancyEligible: boolean("owner_occupancy_eligible"),
    sourceKind: text("source_kind"),
    sourcePriority: numeric("source_priority", { precision: 3, scale: 0 }),
    dataFreshness: text("data_freshness").notNull().default("unknown"),
    liveAvailability: text("live_availability").notNull().default("unverified"),
    parcelReconciliation: text("parcel_reconciliation").notNull().default("unknown"),
    sourceRecords: jsonb("source_records").$type<Array<{
      title: string;
      sourceKind: string;
      sourceUrl?: string;
      verifiedAt?: string;
    }>>().notNull().default([]),
    dateDiscovered: date("date_discovered"),
    lastReviewed: date("last_reviewed"),
    financingEstimate: money("financing_estimate"),
    cashRequired: money("cash_required"),
    projectedCashFlow: money("projected_cash_flow"),
    readinessScore: numeric("readiness_score", { precision: 5, scale: 2 }).notNull().default("0"),
    buyBoxScore: numeric("buy_box_score", { precision: 5, scale: 2 }).notNull().default("0"),
    dealQualityScore: numeric("deal_quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
    dataConfidence: numeric("data_confidence", { precision: 5, scale: 2 }).notNull().default("0"),
    readinessStatus: text("readiness_status").notNull().default("needs_data"),
    riskLevel: text("risk_level").notNull().default("moderate"),
    notes: text("notes"),
    nextAction: text("next_action"),
    status: propertyStatusEnum("status").notNull().default("research"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    goalIdx: index("property_candidates_goal_idx").on(table.propertyGoalId),
  }),
);

export const buyBoxes = pgTable("buy_boxes", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().unique().references(() => households.id, { onDelete: "cascade" }),
  propertyType: text("property_type").notNull().default("duplex"),
  ownerOccupied: boolean("owner_occupied").notNull().default(true),
  purchasePriceMinimum: money("purchase_price_minimum"),
  purchasePriceMaximum: money("purchase_price_maximum"),
  targetCashToClose: money("target_cash_to_close"),
  minimumBedroomsPerUnit: numeric("minimum_bedrooms_per_unit", { precision: 4, scale: 0 }).notNull().default("2"),
  minimumBathroomsPerUnit: numeric("minimum_bathrooms_per_unit", { precision: 4, scale: 1 }).notNull().default("1"),
  minimumEstimatedRent: money("minimum_estimated_rent"),
  maximumEstimatedRehabilitation: money("maximum_estimated_rehabilitation"),
  minimumCashFlow: money("minimum_cash_flow"),
  maximumMonthlyHousingCost: money("maximum_monthly_housing_cost"),
  minimumDscrEstimate: numeric("minimum_dscr_estimate", { precision: 6, scale: 3 }).notNull().default("1.15"),
  maximumPropertyAge: numeric("maximum_property_age", { precision: 5, scale: 0 }),
  minimumPropertyCondition: text("minimum_property_condition").notNull().default("fair"),
  targetMarkets: text("target_markets").array().notNull().default([]),
  excludedMarkets: text("excluded_markets").array().notNull().default([]),
  truckParkingProximity: text("truck_parking_proximity"),
  neighborhoodRequirements: text("neighborhood_requirements"),
  propertyTaxCeiling: money("property_tax_ceiling"),
  insuranceCostCeiling: money("insurance_cost_ceiling"),
  minimumReadinessScore: numeric("minimum_readiness_score", { precision: 5, scale: 2 }).notNull().default("60"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financingScenarios = pgTable(
  "financing_scenarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    propertyCandidateId: uuid("property_candidate_id").references(() => propertyCandidates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    loanType: text("loan_type").notNull().default("conventional"),
    purchasePrice: money("purchase_price"),
    downPaymentPercent: numeric("down_payment_percent", { precision: 7, scale: 4 }).notNull().default("0.05"),
    interestRate: numeric("interest_rate", { precision: 7, scale: 4 }).notNull().default("0.07"),
    termYears: numeric("term_years", { precision: 4, scale: 0 }).notNull().default("30"),
    mortgageInsurance: money("mortgage_insurance"),
    loanFees: money("loan_fees"),
    closingCosts: money("closing_costs"),
    initialReserves: money("initial_reserves"),
    loanAmount: money("loan_amount"),
    monthlyPrincipalInterest: money("monthly_principal_interest"),
    estimatedMonthlyHousingCost: money("estimated_monthly_housing_cost"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("financing_scenarios_household_idx").on(table.householdId),
    propertyIdx: index("financing_scenarios_property_idx").on(table.propertyCandidateId),
  }),
);

export const cashToCloseEstimates = pgTable("cash_to_close_estimates", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  propertyCandidateId: uuid("property_candidate_id").references(() => propertyCandidates.id, { onDelete: "cascade" }),
  downPayment: money("down_payment"),
  earnestMoney: money("earnest_money"),
  inspection: money("inspection"),
  appraisal: money("appraisal"),
  loanFees: money("loan_fees"),
  originationFees: money("origination_fees"),
  titleFees: money("title_fees"),
  recordingFees: money("recording_fees"),
  prepaidTaxes: money("prepaid_taxes"),
  prepaidInsurance: money("prepaid_insurance"),
  escrows: money("escrows"),
  immediateRepairs: money("immediate_repairs"),
  movingCosts: money("moving_costs"),
  initialReserves: money("initial_reserves"),
  emergencyBuffer: money("emergency_buffer"),
  otherClosingCosts: money("other_closing_costs"),
  estimatedCashToClose: money("estimated_cash_to_close"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const propertyStressTests = pgTable(
  "property_stress_tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    propertyCandidateId: uuid("property_candidate_id").notNull().references(() => propertyCandidates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    assumptions: jsonb("assumptions").$type<Record<string, number>>().notNull().default({}),
    monthlyCashFlow: money("monthly_cash_flow"),
    emergencyReserveRemaining: money("emergency_reserve_remaining"),
    monthsUntilLiquidityBreach: numeric("months_until_liquidity_breach", { precision: 8, scale: 2 }),
    result: text("result").notNull().default("review"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    propertyIdx: index("property_stress_tests_property_idx").on(table.propertyCandidateId),
  }),
);

export const propertyReadinessSnapshots = pgTable(
  "property_readiness_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    propertyGoalId: uuid("property_goal_id").notNull().references(() => propertyGoals.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    status: text("status").notNull(),
    factors: jsonb("factors").$type<Record<string, number>>().notNull().default({}),
    nextAction: text("next_action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    goalIdx: index("property_readiness_snapshots_goal_idx").on(table.propertyGoalId),
  }),
);

export const preapprovalRecords = pgTable(
  "preapproval_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    contact: text("contact"),
    dateContacted: date("date_contacted"),
    status: text("status").notNull().default("research"),
    estimatedMaximumPurchasePrice: money("estimated_maximum_purchase_price"),
    estimatedRate: numeric("estimated_rate", { precision: 7, scale: 4 }),
    estimatedCashRequired: money("estimated_cash_required"),
    expiration: date("expiration"),
    documentsNeeded: text("documents_needed"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("preapproval_records_household_idx").on(table.householdId),
  }),
);

export const propertyMilestones = pgTable(
  "property_milestones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    propertyGoalId: uuid("property_goal_id")
      .notNull()
      .references(() => propertyGoals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: milestoneStatusEnum("status").notNull().default("future"),
    progress: numeric("progress", { precision: 5, scale: 2 }).notNull().default("0"),
    target: text("target"),
    currentState: text("current_state"),
    nextAction: text("next_action"),
    dueDate: date("due_date"),
    sortOrder: numeric("sort_order", { precision: 4, scale: 0 }).notNull().default("0"),
  },
  (table) => ({
    goalIdx: index("property_milestones_goal_idx").on(table.propertyGoalId),
  }),
);

export const propertyNotes = pgTable("property_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyGoalId: uuid("property_goal_id")
    .notNull()
    .references(() => propertyGoals.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const propertyDocuments = pgTable("property_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  propertyGoalId: uuid("property_goal_id")
    .notNull()
    .references(() => propertyGoals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  storagePath: text("storage_path"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategies = pgTable(
  "strategies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    strategyType: text("strategy_type").notNull(),
    stage: strategyStageEnum("stage").notNull().default("research"),
    owner: text("owner"),
    hypothesis: text("hypothesis"),
    markets: jsonb("markets").$type<string[]>().notNull().default([]),
    venues: jsonb("venues").$type<string[]>().notNull().default([]),
    assets: jsonb("assets").$type<string[]>().notNull().default([]),
    timeHorizon: text("time_horizon"),
    entryLogic: text("entry_logic"),
    exitLogic: text("exit_logic"),
    positionSizingLogic: text("position_sizing_logic"),
    riskLogic: text("risk_logic"),
    executionModel: text("execution_model"),
    requiredData: jsonb("required_data").$type<string[]>().notNull().default([]),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    knownRisks: jsonb("known_risks").$type<string[]>().notNull().default([]),
    allocation: money("allocation"),
    expectedEdge: numeric("expected_edge", { precision: 8, scale: 4 }).notNull().default("0"),
    maxDrawdown: numeric("max_drawdown", { precision: 8, scale: 4 }).notNull().default("0"),
    confidenceScore: numeric("confidence_score", { precision: 5, scale: 2 }).notNull().default("0"),
    riskLevel: text("risk_level").notNull().default("low"),
    runtimeDays: numeric("runtime_days", { precision: 8, scale: 0 }).notNull().default("0"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("strategies_household_idx").on(table.householdId),
  }),
);

export const strategyVersions = pgTable("strategy_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  configuration: jsonb("configuration").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyPerformance = pgTable("strategy_performance", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  observations: numeric("observations", { precision: 12, scale: 0 }).notNull().default("0"),
  fills: numeric("fills", { precision: 12, scale: 0 }).notNull().default("0"),
  runtimeHours: numeric("runtime_hours", { precision: 12, scale: 2 }).notNull().default("0"),
  expectancy: numeric("expectancy", { precision: 12, scale: 6 }).notNull().default("0"),
  drawdown: numeric("drawdown", { precision: 12, scale: 6 }).notNull().default("0"),
  reconciliationAccuracy: numeric("reconciliation_accuracy", { precision: 8, scale: 5 }).notNull().default("0"),
  criticalErrorCount: numeric("critical_error_count", { precision: 8, scale: 0 }).notNull().default("0"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyApprovals = pgTable("strategy_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  strategyId: uuid("strategy_id")
    .notNull()
    .references(() => strategies.id, { onDelete: "cascade" }),
  fromStage: strategyStageEnum("from_stage").notNull(),
  toStage: strategyStageEnum("to_stage").notNull(),
  approvedBy: uuid("approved_by").references(() => users.id),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyExperiments = pgTable(
  "strategy_experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    strategyId: uuid("strategy_id").notNull().references(() => strategies.id, { onDelete: "cascade" }),
    strategyVersionId: uuid("strategy_version_id").notNull().references(() => strategyVersions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    mode: text("mode").notNull().default("backtest"),
    datasetVersion: text("dataset_version").notNull(),
    status: text("status").notNull().default("completed"),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull().default({}),
    executionAssumptions: jsonb("execution_assumptions").$type<Record<string, unknown>>().notNull().default({}),
    riskLimits: jsonb("risk_limits").$type<Record<string, unknown>>().notNull().default({}),
    randomSeed: numeric("random_seed", { precision: 12, scale: 0 }).notNull().default("0"),
    softwareVersion: text("software_version").notNull().default("capital-os-lab-1"),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull().default({}),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    householdIdx: index("strategy_experiments_household_idx").on(table.householdId),
    strategyIdx: index("strategy_experiments_strategy_idx").on(table.strategyId),
    createdAtIdx: index("strategy_experiments_created_at_idx").on(table.createdAt),
  }),
);

export const researchJournalEntries = pgTable(
  "research_journal_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    strategyId: uuid("strategy_id").notNull().references(() => strategies.id, { onDelete: "cascade" }),
    entryType: text("entry_type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("research_journal_entries_household_idx").on(table.householdId),
    strategyIdx: index("research_journal_entries_strategy_idx").on(table.strategyId),
  }),
);

export type PropertyGoal = typeof propertyGoals.$inferSelect;
export type PropertyMilestone = typeof propertyMilestones.$inferSelect;
export type PropertyCandidate = typeof propertyCandidates.$inferSelect;
export type Strategy = typeof strategies.$inferSelect;
export type StrategyExperiment = typeof strategyExperiments.$inferSelect;
export type ResearchJournalEntry = typeof researchJournalEntries.$inferSelect;