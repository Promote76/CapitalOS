CREATE TABLE "bank_statement_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"account_id" uuid,
	"institution_name" text,
	"account_display_name" text,
	"account_mask" text,
	"statement_start" date,
	"statement_end" date,
	"opening_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"closing_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_deposits" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_withdrawals" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'document_evidence_pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_statement_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bank_statement_document_id" uuid NOT NULL,
	"posted_date" date,
	"description" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"direction" text,
	"running_balance" numeric(18, 2),
	"reference" text,
	"confidence" numeric(5, 2),
	"source_page" integer,
	"original_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"corrected_value" jsonb,
	"correction_reason" text,
	"review_status" text DEFAULT 'document_evidence_pending_review' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"linked_settlement_document_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid,
	"document_type" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"source_institution" text,
	"source_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"source_object_path" text NOT NULL,
	"document_hash" text NOT NULL,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"period_start" date,
	"period_end" date,
	"statement_date" date,
	"parser_version" text,
	"source_record_type" text,
	"source_record_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_decision" text,
	"review_reason" text,
	"reconciled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "household_financial_accounts" ADD COLUMN "data_mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ADD CONSTRAINT "bank_statement_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ADD CONSTRAINT "bank_statement_documents_document_id_financial_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."financial_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ADD CONSTRAINT "bank_statement_documents_account_id_household_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."household_financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_bank_statement_document_id_bank_statement_documents_id_fk" FOREIGN KEY ("bank_statement_document_id") REFERENCES "public"."bank_statement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD CONSTRAINT "bank_statement_transactions_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_uploaded_by_capital_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_documents" ADD CONSTRAINT "financial_documents_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_documents_document_unique" ON "bank_statement_documents" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "bank_statement_documents_household_idx" ON "bank_statement_documents" USING btree ("household_id","statement_end");--> statement-breakpoint
CREATE INDEX "bank_statement_transactions_household_review_idx" ON "bank_statement_transactions" USING btree ("household_id","review_status");--> statement-breakpoint
CREATE INDEX "financial_documents_household_uploaded_idx" ON "financial_documents" USING btree ("household_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "financial_documents_household_status_idx" ON "financial_documents" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_documents_household_hash_unique" ON "financial_documents" USING btree ("household_id","document_hash");