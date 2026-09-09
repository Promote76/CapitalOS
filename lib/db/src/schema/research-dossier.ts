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
export type InvestmentResearchDossier = typeof investmentResearchDossiers.$inferSelect;