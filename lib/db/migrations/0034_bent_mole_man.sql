ALTER TABLE "statement_financial_inclusions" ADD COLUMN "review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD COLUMN "mismatch_code" text;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD COLUMN "reconciliation_status" text DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD COLUMN "reconciled_by" uuid;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "statement_financial_inclusions" ADD CONSTRAINT "statement_financial_inclusions_reconciled_by_capital_users_id_fk" FOREIGN KEY ("reconciled_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;