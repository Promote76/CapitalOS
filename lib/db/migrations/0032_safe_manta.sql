CREATE TABLE "bank_statement_transaction_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"previous_value" jsonb,
	"corrected_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"corrected_by" uuid NOT NULL,
	"corrected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "last_review_action" text;--> statement-breakpoint
ALTER TABLE "bank_statement_transaction_corrections" ADD CONSTRAINT "bank_statement_transaction_corrections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transaction_corrections" ADD CONSTRAINT "bank_statement_transaction_corrections_transaction_id_bank_statement_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_statement_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_statement_transaction_corrections" ADD CONSTRAINT "bank_statement_transaction_corrections_corrected_by_capital_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_transaction_corrections_revision_unique" ON "bank_statement_transaction_corrections" USING btree ("transaction_id","revision");--> statement-breakpoint
CREATE INDEX "bank_statement_transaction_corrections_household_transaction_idx" ON "bank_statement_transaction_corrections" USING btree ("household_id","transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_transactions_household_fingerprint_unique" ON "bank_statement_transactions" USING btree ("household_id","evidence_fingerprint");