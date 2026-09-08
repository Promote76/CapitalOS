CREATE TYPE "public"."statement_category_decision_status" AS ENUM('UNCLASSIFIED', 'SUGGESTED', 'USER_CONFIRMED', 'USER_CORRECTED', 'NOT_APPLICABLE_TRANSFER', 'NOT_APPLICABLE_SETTLEMENT', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."statement_economic_classification" AS ENUM('HOUSEHOLD', 'BUSINESS', 'TRANSFER', 'SETTLEMENT_LINK', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."statement_financial_inclusion_status" AS ENUM('NOT_REVIEWED', 'READY_FOR_INCLUSION_REVIEW', 'MATCH_CANDIDATE', 'DUPLICATE_REVIEW_REQUIRED', 'READY_TO_IMPORT', 'LINKED_EXISTING', 'IMPORTED_NEW', 'EXCLUDED_TRANSFER', 'EXCLUDED_SETTLEMENT', 'EXCLUDED_DUPLICATE', 'REVERSED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."finance_data_source" ADD VALUE 'bank_statement_import' BEFORE 'capital_os_ledger';--> statement-breakpoint
CREATE TABLE "statement_financial_inclusions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"statement_document_id" uuid NOT NULL,
	"statement_row_id" uuid NOT NULL,
	"statement_row_fingerprint" text NOT NULL,
	"evidence_decision" text NOT NULL,
	"category_id" uuid,
	"inclusion_decision" text NOT NULL,
	"matched_finance_transaction_id" uuid,
	"created_finance_transaction_id" uuid,
	"duplicate_status" text DEFAULT 'NOT_REVIEWED' NOT NULL,
	"transfer_status" text DEFAULT 'NOT_REVIEWED' NOT NULL,
	"settlement_link_status" text DEFAULT 'NOT_REVIEWED' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversed_at" timestamp with time zone,
	"status" "statement_financial_inclusion_status" DEFAULT 'NOT_REVIEWED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_financial_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"inclusion_id" uuid NOT NULL,
	"statement_row_id" uuid NOT NULL,
	"finance_transaction_id" uuid,
	"previous_state" jsonb NOT NULL,
	"new_state" jsonb NOT NULL,
	"reason" text NOT NULL,
	"actor" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "source_document_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "source_statement_row_id" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "statement_row_fingerprint" text;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "imported_by" uuid;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD COLUMN "imported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "suggested_category_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "suggested_category_confidence" text;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "suggested_category_reason" text;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "suggested_category_source" text;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "selected_category_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "category_decision_status" "statement_category_decision_status" DEFAULT 'UNCLASSIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "category_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "category_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "category_correction_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "economic_classification" "statement_economic_classification" DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_statement_document_id_bank_statement_documents_id_fk" FOREIGN KEY ("statement_document_id") REFERENCES "public"."bank_statement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_statement_row_id_bank_statement_transactions_id_fk" FOREIGN KEY ("statement_row_id") REFERENCES "public"."bank_statement_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_matched_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("matched_finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_created_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("created_finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_reversed_by_capital_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_reversals" ADD CONSTRAINT "statement_financial_reversals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_reversals" ADD CONSTRAINT "statement_financial_reversals_inclusion_id_statement_financial_inclusions_id_fk" FOREIGN KEY ("inclusion_id") REFERENCES "public"."statement_financial_inclusions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_reversals" ADD CONSTRAINT "statement_financial_reversals_statement_row_id_bank_statement_transactions_id_fk" FOREIGN KEY ("statement_row_id") REFERENCES "public"."bank_statement_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_reversals" ADD CONSTRAINT "statement_financial_reversals_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_financial_reversals" ADD CONSTRAINT "statement_financial_reversals_actor_capital_users_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "statement_financial_inclusions_household_status_idx" ON "statement_financial_inclusions" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "statement_financial_inclusions_household_row_idx" ON "statement_financial_inclusions" USING btree ("household_id","statement_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_financial_inclusions_household_row_unique" ON "statement_financial_inclusions" USING btree ("household_id","statement_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_financial_inclusions_household_fingerprint_unique" ON "statement_financial_inclusions" USING btree ("household_id","statement_row_fingerprint");--> statement-breakpoint
CREATE INDEX "statement_financial_reversals_household_inclusion_idx" ON "statement_financial_reversals" USING btree ("household_id","inclusion_id");--> statement-breakpoint
CREATE INDEX "statement_financial_reversals_household_row_idx" ON "statement_financial_reversals" USING btree ("household_id","statement_row_id");--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_imported_by_capital_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_suggested_category_id_finance_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_selected_category_id_finance_categories_id_fk" FOREIGN KEY ("selected_category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_category_decided_by_capital_users_id_fk" FOREIGN KEY ("category_decided_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_transactions_household_statement_row_fingerprint_unique" ON "finance_transactions" USING btree ("household_id","statement_row_fingerprint");--> statement-breakpoint
CREATE INDEX "bank_statement_transactions_household_category_decision_idx" ON "bank_statement_transactions" USING btree ("household_id","category_decision_status");