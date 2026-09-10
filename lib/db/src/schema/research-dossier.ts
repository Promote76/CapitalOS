import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, boolean } from "drizzle-orm/pg-core";
import { households, users } from "./households.ts";

export const researchEvidence = pgTable("research_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  financialDocumentId: uuid("financial_document_id"),
  title: text("title").notNull(),
  provenanceClass: text("provenance_class").notNull(),
  reviewStatus: text("review_status").notNull().default("PENDING_HUMAN_REVIEW"),
  mimeType: text("mime_type").notNull(),
  objectPath: text("object_path").notNull(),
  byteLength: integer("byte_length").notNull(),
  sha256: text("sha256").notNull(),
  extractedText: text("extracted_text"),
  extractionStatus: text("extraction_status").notNull().default("needs_review"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdHashUnique: uniqueIndex("research_evidence_household_sha256_unique").on(table.householdId, table.sha256),
  householdIdx: index("research_evidence_household_created_idx").on(table.householdId, table.createdAt),
  provenanceCheck: check("research_evidence_provenance_check", sql`${table.provenanceClass} in ('UPLOADED_LICENSED_RESEARCH','PRIMARY_SOURCE')`),
  reviewCheck: check("research_evidence_review_check", sql`${table.reviewStatus} in ('PENDING_HUMAN_REVIEW','REVIEWED','REJECTED')`),
  extractionCheck: check("research_evidence_extraction_check", sql`${table.extractionStatus} in ('needs_review','needs_review_unsupported_pdf','complete','failed','failed_timeout','failed_output_bound')`),
  byteLengthCheck: check("research_evidence_byte_length_check", sql`${table.byteLength} > 0 and ${table.byteLength} <= 10485760`),
}));

/** Provider-normalized market snapshot draft. Raw Schwab responses are never stored. */
export const schwabMarketSnapshots = pgTable("schwab_market_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  providerAsOf: timestamp("provider_as_of", { withTimezone: true }),
  marketDate: text("market_date"),
  realtime: boolean("realtime"),
  delayed: boolean("delayed"),
  freshness: text("freshness").notNull(),
  missingFlags: jsonb("missing_flags").$type<string[]>().notNull().default([]),
  qualityFlags: jsonb("quality_flags").$type<string[]>().notNull().default([]),
  reviewStatus: text("review_status").notNull().default("PENDING_HUMAN_REVIEW"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdIdx: index("schwab_market_snapshots_household_created_idx").on(table.householdId, table.createdAt),
  reviewCheck: check("schwab_market_snapshots_review_check", sql`${table.reviewStatus} in ('PENDING_HUMAN_REVIEW','APPROVED','REJECTED')`),
}));

/** Immutable canonical evidence emitted only by an APPROVE disposition. */
export const reviewedResearchEvidence = pgTable("reviewed_research_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id").notNull().references(() => schwabMarketSnapshots.id),
  ticker: text("ticker").notNull(),
  canonicalContent: jsonb("canonical_content").$type<Record<string, unknown>>().notNull(),
  canonicalSha256: text("canonical_sha256").notNull(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  readOnly: boolean("read_only").notNull().default(true),
  tradingEnabled: boolean("trading_enabled").notNull().default(false),
  executionAuthority: text("execution_authority").notNull().default("none"),
  nonAuthoritative: boolean("non_authoritative").notNull().default(false),
  approvedBy: uuid("approved_by").notNull().references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  snapshotUnique: uniqueIndex("reviewed_research_evidence_snapshot_unique").on(table.snapshotId),
  digestUnique: uniqueIndex("reviewed_research_evidence_household_digest_unique").on(table.householdId, table.canonicalSha256),
  householdIdx: index("reviewed_research_evidence_household_created_idx").on(table.householdId, table.createdAt),
  authorityCheck: check("reviewed_research_evidence_authority_check", sql`${table.readOnly} = true and ${table.tradingEnabled} = false and ${table.executionAuthority} = 'none' and ${table.nonAuthoritative} = false`),
}));

/** Normalized SEC filing retrieval drafts. SEC payloads are never retained. */
export const secFilingSnapshots = pgTable("sec_filing_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  filingForm: text("filing_form").notNull(),
  filingDate: text("filing_date").notNull(),
  accession: text("accession").notNull(),
  sourceUrl: text("source_url").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  missingFields: jsonb("missing_fields").$type<string[]>().notNull().default([]),
  evidenceQuality: text("evidence_quality").notNull(),
  extractionTimestamp: timestamp("extraction_timestamp", { withTimezone: true }).notNull(),
  reviewStatus: text("review_status").notNull().default("PENDING_HUMAN_REVIEW"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdAccessionUnique: uniqueIndex("sec_filing_snapshots_household_accession_unique").on(table.householdId, table.accession),
  householdIdx: index("sec_filing_snapshots_household_created_idx").on(table.householdId, table.createdAt),
  reviewCheck: check("sec_filing_snapshots_review_check", sql`${table.reviewStatus} in ('PENDING_HUMAN_REVIEW','APPROVED','REJECTED')`),
  qualityCheck: check("sec_filing_snapshots_quality_check", sql`${table.evidenceQuality} in ('HIGH','MEDIUM','LOW')`),
}));

/** Immutable approved SEC evidence containing only the reviewed normalized allowlist. */
export const reviewedSecFilingEvidence = pgTable("reviewed_sec_filing_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id").notNull().references(() => secFilingSnapshots.id),
  ticker: text("ticker").notNull(),
  canonicalContent: jsonb("canonical_content").$type<Record<string, unknown>>().notNull(),
  canonicalSha256: text("canonical_sha256").notNull(),
  provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull(),
  approvedBy: uuid("approved_by").notNull().references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  readOnly: boolean("read_only").notNull().default(true),
  tradingEnabled: boolean("trading_enabled").notNull().default(false),
  executionAuthority: text("execution_authority").notNull().default("none"),
}, (table) => ({
  snapshotUnique: uniqueIndex("reviewed_sec_filing_evidence_snapshot_unique").on(table.snapshotId),
  digestUnique: uniqueIndex("reviewed_sec_filing_evidence_household_digest_unique").on(table.householdId, table.canonicalSha256),
  authorityCheck: check("reviewed_sec_filing_evidence_authority_check", sql`${table.readOnly} = true and ${table.tradingEnabled} = false and ${table.executionAuthority} = 'none'`),
}));

export const investmentResearchDossiers = pgTable("investment_research_dossiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  householdId: uuid("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  ticker: text("ticker").notNull(),
  title: text("title").notNull(),
  evidenceIds: jsonb("evidence_ids").$type<string[]>().notNull().default([]),
  digestion: jsonb("digestion").$type<Record<string, unknown>>(),
  report: jsonb("report").$type<Record<string, unknown>>(),
  reviewStatus: text("review_status").notNull().default("PENDING_HUMAN_REVIEW"),
  advisoryOnly: boolean("advisory_only").notNull().default(true),
  executionAuthority: text("execution_authority").notNull().default("none"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  householdCreatedIdx: index("investment_research_dossiers_household_created_idx").on(table.householdId, table.createdAt),
  advisoryCheck: check("investment_research_dossiers_advisory_only_check", sql`${table.advisoryOnly} = true`),
  authorityCheck: check("investment_research_dossiers_execution_authority_check", sql`${table.executionAuthority} = 'none'`),
}));

export type ResearchEvidence = typeof researchEvidence.$inferSelect;
export type SchwabMarketSnapshot = typeof schwabMarketSnapshots.$inferSelect;
export type ReviewedResearchEvidence = typeof reviewedResearchEvidence.$inferSelect;
export type SecFilingSnapshot = typeof secFilingSnapshots.$inferSelect;
export type ReviewedSecFilingEvidence = typeof reviewedSecFilingEvidence.$inferSelect;
export type InvestmentResearchDossier = typeof investmentResearchDossiers.$inferSelect;