ALTER TABLE "business_profit_loss_documents" ADD COLUMN "source_kind" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "source_content_type" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "source_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "source_page_count" integer;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "extraction_status" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "extraction_reason" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "verification_status" text DEFAULT 'needs_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "source_content_type" text;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "source_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "source_page_count" integer;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "extraction_reason" text;