ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "normalized_category" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "economic_treatment" text DEFAULT 'UNKNOWN_REVIEW_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "normalized_category" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "economic_treatment" text DEFAULT 'UNKNOWN_REVIEW_REQUIRED' NOT NULL;