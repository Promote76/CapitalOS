import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

/**
 * A household has at most one Schwab observation connection. OAuth material is
 * encrypted by the API service before it reaches these columns; plaintext
 * tokens and authorization codes are never database values.
 */
export const schwabConnections = pgTable("schwab_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("DISCONNECTED"),
  lifecycleGeneration: text("lifecycle_generation").notNull().default("legacy"),
  accessTokenCiphertext: text("access_token_ciphertext"),
  accessTokenNonce: text("access_token_nonce"),
  accessTokenAuthTag: text("access_token_auth_tag"),
  refreshTokenCiphertext: text("refresh_token_ciphertext"),
  refreshTokenNonce: text("refresh_token_nonce"),
  refreshTokenAuthTag: text("refresh_token_auth_tag"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  householdUnique: uniqueIndex("schwab_connections_household_unique").on(table.householdId),
  householdStatusIdx: index("schwab_connections_household_status_idx").on(table.householdId, table.status),
}));

/**
 * State is SHA-256 hashed before persistence. Consumption is explicit rather
 * than deletion so a replay is distinguishable from an unknown state.
 */
export const schwabOAuthStates = pgTable("schwab_oauth_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  stateHash: text("state_hash").notNull(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lifecycleGeneration: text("lifecycle_generation").notNull().default("legacy"),
  browserBindingHash: text("browser_binding_hash").notNull().default("legacy"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  stateHashUnique: uniqueIndex("schwab_oauth_states_hash_unique").on(table.stateHash),
  householdActorIdx: index("schwab_oauth_states_household_actor_idx").on(table.householdId, table.actorUserId),
  expiryIdx: index("schwab_oauth_states_expiry_idx").on(table.expiresAt),
}));

export const schwabMarketDataConnections = pgTable("schwab_market_data_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("DISCONNECTED"),
  lifecycleGeneration: text("lifecycle_generation").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext"),
  accessTokenNonce: text("access_token_nonce"),
  accessTokenAuthTag: text("access_token_auth_tag"),
  refreshTokenCiphertext: text("refresh_token_ciphertext"),
  refreshTokenNonce: text("refresh_token_nonce"),
  refreshTokenAuthTag: text("refresh_token_auth_tag"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  lastSuccessfulReadAt: timestamp("last_successful_read_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  householdUnique: uniqueIndex("schwab_market_data_connections_household_unique").on(table.householdId),
  householdStatusIdx: index("schwab_market_data_connections_household_status_idx").on(table.householdId, table.status),
}));

export const schwabMarketDataOAuthStates = pgTable("schwab_market_data_oauth_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  stateHash: text("state_hash").notNull(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lifecycleGeneration: text("lifecycle_generation").notNull(),
  browserBindingHash: text("browser_binding_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  stateHashUnique: uniqueIndex("schwab_market_data_oauth_states_hash_unique").on(table.stateHash),
  householdActorIdx: index("schwab_market_data_oauth_states_household_actor_idx").on(table.householdId, table.actorUserId),
  expiryIdx: index("schwab_market_data_oauth_states_expiry_idx").on(table.expiresAt),
}));

export const schwabObservationSnapshots = pgTable("schwab_observation_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => schwabConnections.id, { onDelete: "cascade" }),
  accounts: jsonb("accounts").$type<Record<string, unknown>[]>().notNull().default([]),
  balances: jsonb("balances").$type<Record<string, unknown>[]>().notNull().default([]),
  positions: jsonb("positions").$type<Record<string, unknown>[]>().notNull().default([]),
  orders: jsonb("orders").$type<Record<string, unknown>[]>().notNull().default([]),
  transactions: jsonb("transactions").$type<Record<string, unknown>[]>().notNull().default([]),
  quotes: jsonb("quotes").$type<Record<string, unknown>[]>().notNull().default([]),
  marketClock: jsonb("market_clock").$type<Record<string, unknown>>().notNull().default({}),
  counts: jsonb("counts").$type<Record<string, number>>().notNull().default({}),
  freshness: text("freshness").notNull().default("UNKNOWN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ householdCreatedIdx: index("schwab_observation_snapshots_household_created_idx").on(table.householdId, table.createdAt) }));

export type SchwabConnection = typeof schwabConnections.$inferSelect;
export type SchwabOAuthState = typeof schwabOAuthStates.$inferSelect;
export type SchwabMarketDataConnection = typeof schwabMarketDataConnections.$inferSelect;
export type SchwabMarketDataOAuthState = typeof schwabMarketDataOAuthStates.$inferSelect;
export type SchwabObservationSnapshot = typeof schwabObservationSnapshots.$inferSelect;