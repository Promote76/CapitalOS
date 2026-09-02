import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { householdRoleEnum } from "./enums.ts";

export const users = pgTable("capital_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalAuthId: text("external_auth_id"),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  externalAuthIdUnique: uniqueIndex("capital_users_external_auth_id_unique").on(table.externalAuthId),
}));

export const households = pgTable("households", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("America/Chicago"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const householdMembers = pgTable(
  "household_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: householdRoleEnum("role").notNull().default("viewer"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdUserUnique: uniqueIndex("household_members_household_user_unique").on(
      table.householdId,
      table.userId,
    ),
    householdIdx: index("household_members_household_idx").on(table.householdId),
  }),
);

export const householdSettings = pgTable("household_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .unique()
    .references(() => households.id, { onDelete: "cascade" }),
  aiAdvisoryOnly: boolean("ai_advisory_only").notNull().default(true),
  blockchainEnabled: boolean("blockchain_enabled").notNull().default(false),
  emergencyStopActive: boolean("emergency_stop_active").notNull().default(false),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type HouseholdMember = typeof householdMembers.$inferSelect;