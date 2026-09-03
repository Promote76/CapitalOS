import {
  boolean,
  date,
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
import { businessEntities } from "./business.ts";
import { propertyCandidates } from "./property-strategy.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const financingLiabilities = pgTable(
  "financing_liabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    businessEntityId: uuid("business_entity_id").references(() => businessEntities.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    liabilityType: text("liability_type").notNull().default("installment"),
    ownership: text("ownership").notNull().default("household"),
    status: text("status").notNull().default("active"),
    originalBalance: money("original_balance"),
    currentBalance: money("current_balance"),
    monthlyPayment: money("monthly_payment"),
    interestRate: numeric("interest_rate", { precision: 8, scale: 5 }).notNull().default("0"),
    termMonths: integer("term_months"),
    remainingTermMonths: integer("remaining_term_months"),
    creditLimit: money("credit_limit"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("financing_liabilities_household_idx").on(table.householdId),
    householdStatusIdx: index("financing_liabilities_household_status_idx").on(table.householdId, table.status),
  }),
);

export const financingCreditProfiles = pgTable("financing_credit_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().unique().references(() => households.id, { onDelete: "cascade" }),
  score: integer("score"),
  scoreSource: text("score_source").notNull().default("not_provided"),
  scoreAsOf: date("score_as_of"),
  scoreConfidence: text("score_confidence").notNull().default("unknown"),
  creditworthinessStatus: text("creditworthiness_status").notNull().default("not_assessed"),
  utilizationPercent: numeric("utilization_percent", { precision: 8, scale: 3 }).notNull().default("0"),
  paymentHistoryStatus: text("payment_history_status").notNull().default("not_provided"),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financingOffers = pgTable(
  "financing_offers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    propertyCandidateId: uuid("property_candidate_id").references(() => propertyCandidates.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    lenderLabel: text("lender_label"),
    programLabel: text("program_label").notNull(),
    loanType: text("loan_type").notNull().default("conventional"),
    commitmentStatus: text("commitment_status").notNull().default("illustrative"),
    offerStatus: text("offer_status").notNull().default("research"),
    loanAmount: money("loan_amount"),
    interestRate: numeric("interest_rate", { precision: 8, scale: 5 }).notNull().default("0"),
    termYears: integer("term_years").notNull().default(30),
    estimatedMonthlyPayment: money("estimated_monthly_payment"),
    estimatedCashToClose: money("estimated_cash_to_close"),
    expirationDate: date("expiration_date"),
    assumptions: jsonb("assumptions").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("financing_offers_household_idx").on(table.householdId),
    propertyIdx: index("financing_offers_property_idx").on(table.propertyCandidateId),
  }),
);

export const financingPipelines = pgTable("financing_pipelines", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().unique().references(() => households.id, { onDelete: "cascade" }),
  stage: text("stage").notNull().default("research"),
  nextAction: text("next_action").notNull().default("Confirm financing assumptions before any lender conversation."),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const financingPipelineEvents = pgTable(
  "financing_pipeline_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    pipelineId: uuid("pipeline_id").notNull().references(() => financingPipelines.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("financing_pipeline_events_household_idx").on(table.householdId, table.createdAt),
  }),
);

export const financingDocuments = pgTable(
  "financing_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("needed"),
    sensitivity: text("sensitivity").notNull().default("sensitive"),
    dueDate: date("due_date"),
    storagePath: text("storage_path"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("financing_documents_household_idx").on(table.householdId, table.status),
  }),
);

export type FinancingLiability = typeof financingLiabilities.$inferSelect;
export type FinancingCreditProfile = typeof financingCreditProfiles.$inferSelect;
export type FinancingOffer = typeof financingOffers.$inferSelect;
export type FinancingPipeline = typeof financingPipelines.$inferSelect;
export type FinancingPipelineEvent = typeof financingPipelineEvents.$inferSelect;
export type FinancingDocument = typeof financingDocuments.$inferSelect;