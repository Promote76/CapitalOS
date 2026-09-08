ALTER TABLE "bank_statement_transactions" ADD COLUMN "source_line" integer;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "source_region" text;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "parser_version" text DEFAULT 'bank-statement-v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_statement_transactions" ADD COLUMN "evidence_fingerprint" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_statement_transactions_statement_fingerprint_unique" ON "bank_statement_transactions" USING btree ("bank_statement_document_id","evidence_fingerprint");