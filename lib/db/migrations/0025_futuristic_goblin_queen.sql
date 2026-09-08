ALTER TABLE "business_profit_loss_documents" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "source_page" integer;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "review_status" text DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "review_decision" text;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD CONSTRAINT "business_profit_loss_documents_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD CONSTRAINT "business_profit_loss_lines_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD CONSTRAINT "business_settlement_deduction_lines_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD CONSTRAINT "business_settlement_documents_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD CONSTRAINT "business_settlement_revenue_lines_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;