import { boolean, date, index, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const businessEntities = pgTable("business_entities", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  entityType: text("entity_type").notNull().default("single_member_llc"),
  ownershipPercentage: numeric("ownership_percentage", { precision: 6, scale: 3 }).notNull().default("100"),
  taxClassification: text("tax_classification"),
  industry: text("industry"),
  status: text("status").notNull().default("active"),
  formationDate: date("formation_date", { mode: "string" }),
  state: text("state"),
  einReference: text("ein_reference"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDisplayNameUnique: uniqueIndex("business_entities_household_display_name_unique").on(table.householdId, table.displayName),
  householdStatusIdx: index("business_entities_household_status_idx").on(table.householdId, table.status),
}));

export const businessRevenue = pgTable("business_revenue", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  revenueDate: date("revenue_date", { mode: "string" }).notNull(),
  category: text("category").notNull().default("operating"),
  amount: money("amount"),
  customer: text("customer"),
  description: text("description").notNull(),
  recurring: boolean("recurring").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDateIdx: index("business_revenue_household_date_idx").on(table.householdId, table.revenueDate),
  businessDateIdx: index("business_revenue_business_date_idx").on(table.businessId, table.revenueDate),
}));

export const businessExpenses = pgTable("business_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  expenseDate: date("expense_date", { mode: "string" }).notNull(),
  category: text("category").notNull().default("other"),
  amount: money("amount"),
  description: text("description").notNull(),
  expenseType: text("expense_type").notNull().default("operating"),
  classification: text("classification").notNull().default("business"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDateIdx: index("business_expenses_household_date_idx").on(table.householdId, table.expenseDate),
  businessDateIdx: index("business_expenses_business_date_idx").on(table.businessId, table.expenseDate),
}));

export const businessReserves = pgTable("business_reserves", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  targetMethod: text("target_method").notNull().default("3_months"),
  targetAmount: money("target_amount"),
  taxReserve: money("tax_reserve"),
  safetyBuffer: money("safety_buffer"),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  businessUnique: uniqueIndex("business_reserves_business_unique").on(table.businessId),
}));

export const businessDistributions = pgTable("business_distributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  businessId: uuid("business_id").notNull().references(() => businessEntities.id, { onDelete: "cascade" }),
  distributionDate: date("distribution_date", { mode: "string" }).notNull(),
  amount: money("amount"),
  status: text("status").notNull().default("proposed"),
  householdDestination: text("household_destination").notNull().default("household_cash"),
  notes: text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdDateIdx: index("business_distributions_household_date_idx").on(table.householdId, table.distributionDate),
  businessDateIdx: index("business_distributions_business_date_idx").on(table.businessId, table.distributionDate),
}));

export type BusinessEntity = typeof businessEntities.$inferSelect;
export type BusinessRevenue = typeof businessRevenue.$inferSelect;
export type BusinessExpense = typeof businessExpenses.$inferSelect;
export type BusinessReserve = typeof businessReserves.$inferSelect;
export type BusinessDistribution = typeof businessDistributions.$inferSelect;