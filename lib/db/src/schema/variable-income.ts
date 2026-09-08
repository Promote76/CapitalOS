import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

const money = (name: string) => numeric(name, { precision: 18, scale: 2 }).notNull().default("0");

export const variableIncomeProfiles = pgTable(
  "variable_income_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    calculationDate: date("calculation_date", { mode: "string" }).notNull(),
    currentMonthVerifiedIncome: money("current_month_verified_income"),
    trailing4WeekIncome: money("trailing_4_week_income"),
    trailing8WeekIncome: money("trailing_8_week_income"),
    trailing13WeekIncome: money("trailing_13_week_income"),
    trailing3MonthIncome: money("trailing_3_month_income"),
    trailing6MonthIncome: money("trailing_6_month_income"),
    highestRecentMonth: money("highest_recent_month"),
    lowestRecentMonth: money("lowest_recent_month"),
    medianRecentMonth: money("median_recent_month"),
    incomeFloor: money("income_floor"),
    baseIncome: money("base_income"),
    strongMonthIncome: money("strong_month_income"),
    incomeVolatility: numeric("income_volatility", { precision: 8, scale: 4 }).notNull().default("0"),
    sourceCount: numeric("source_count", { precision: 10, scale: 0 }).notNull().default("0"),
    sourceFreshness: date("source_freshness", { mode: "string" }),
    policy: text("policy").notNull().default("TRAILING_MEDIAN_DISCOUNTED"),
    confidenceStatus: text("confidence_status").notNull().default("INSUFFICIENT_HISTORY"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdDateUnique: uniqueIndex("variable_income_profiles_household_date_unique").on(table.householdId, table.calculationDate),
    householdIdx: index("variable_income_profiles_household_idx").on(table.householdId, table.calculationDate),
  }),
);

export const householdVehicleScenarios = pgTable(
  "household_vehicle_scenarios",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    vehiclePrice: money("vehicle_price"),
    downPayment: money("down_payment"),
    loanAmount: money("loan_amount"),
    estimatedApr: numeric("estimated_apr", { precision: 8, scale: 4 }).notNull().default("0"),
    loanTermMonths: numeric("loan_term_months", { precision: 6, scale: 0 }).notNull().default("0"),
    monthlyPayment: money("monthly_payment"),
    insurance: money("insurance"),
    fuel: money("fuel"),
    maintenanceReserve: money("maintenance_reserve"),
    registrationReserve: money("registration_reserve"),
    parkingTolls: money("parking_tolls"),
    otherMonthlyCost: money("other_monthly_cost"),
    totalMonthlyCost: money("total_monthly_cost"),
    affordabilityStatus: text("affordability_status").notNull().default("INSUFFICIENT_DATA"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdIdx: index("household_vehicle_scenarios_household_idx").on(table.householdId, table.createdAt),
  }),
);

export type VariableIncomeProfile = typeof variableIncomeProfiles.$inferSelect;
export type HouseholdVehicleScenario = typeof householdVehicleScenarios.$inferSelect;