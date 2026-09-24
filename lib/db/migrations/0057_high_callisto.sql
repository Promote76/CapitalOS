ALTER TABLE "bank_statement_documents" ALTER COLUMN "opening_balance" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "opening_balance" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "closing_balance" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "closing_balance" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "total_deposits" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "total_deposits" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "total_withdrawals" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bank_statement_documents" ALTER COLUMN "total_withdrawals" DROP NOT NULL;
