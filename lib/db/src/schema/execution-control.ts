import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

export const executionControlStates = [
  "DISABLED",
  "MICRO_LIVE_ELIGIBLE",
  "MICRO_LIVE_ARMED",
  "MICRO_LIVE_ACTIVE",
  "SAFE_MODE",
  "STOP",
  "EVACUATE",
  "LOCKED",
] as const;

export type ExecutionControlState = typeof executionControlStates[number];

export const executionControls = pgTable(
  "execution_controls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    state: text("state").notNull().default("DISABLED"),
    version: integer("version").notNull().default(1),
    reason: text("reason").notNull().default("Execution control initialized fail-closed"),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    correlationId: text("correlation_id"),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdUnique: uniqueIndex("execution_controls_household_unique").on(table.householdId),
    householdStateIdx: index("execution_controls_household_state_idx").on(table.householdId, table.state),
  }),
);

export type ExecutionControl = typeof executionControls.$inferSelect;