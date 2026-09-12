import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { households, users } from "./households.ts";

export const researchAdvisoryDecisionKinds = ["SKIP", "WATCH", "REVIEW", "SHADOW", "OPEN_SCHWAB"] as const;
export type ResearchAdvisoryDecisionKind = (typeof researchAdvisoryDecisionKinds)[number];

/**
 * Durable, household-scoped research intent. This is deliberately separate from
 * proposals, shadow order intents, and every execution or capital table.
 */
export const researchAdvisoryDecisions = pgTable(
  "research_advisory_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").notNull().references(() => users.id),
    ticker: text("ticker").notNull(),
    decision: text("decision").notNull(),
    reason: text("reason"),
    opportunitySnapshot: jsonb("opportunity_snapshot").$type<Record<string, unknown>>().notNull(),
    evidenceSnapshot: jsonb("evidence_snapshot").$type<Record<string, unknown>[]>().notNull().default([]),
    advisoryOnly: boolean("advisory_only").notNull().default(true),
    executionAuthority: text("execution_authority").notNull().default("none"),
    noTradingOrMoneyMovement: boolean("no_trading_or_money_movement").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    householdCreatedIdx: index("research_advisory_decisions_household_created_idx").on(table.householdId, table.createdAt),
    householdTickerIdx: index("research_advisory_decisions_household_ticker_idx").on(table.householdId, table.ticker),
    decisionCheck: check("research_advisory_decisions_decision_check", sql`${table.decision} in ('SKIP','WATCH','REVIEW','SHADOW','OPEN_SCHWAB')`),
    advisoryCheck: check("research_advisory_decisions_advisory_check", sql`${table.advisoryOnly} = true and ${table.executionAuthority} = 'none' and ${table.noTradingOrMoneyMovement} = true`),
  }),
);

export type ResearchAdvisoryDecision = typeof researchAdvisoryDecisions.$inferSelect;