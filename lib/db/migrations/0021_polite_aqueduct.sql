CREATE TABLE "business_advances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"advance_date" date NOT NULL,
	"counterparty" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"recovered_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_cash_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"as_of" date NOT NULL,
	"bank_cash" numeric(18, 2) DEFAULT '0' NOT NULL,
	"pending_deposits" numeric(18, 2) DEFAULT '0' NOT NULL,
	"outstanding_advances" numeric(18, 2) DEFAULT '0' NOT NULL,
	"escrow_held" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reimbursements_due" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reserve_floor" numeric(18, 2) DEFAULT '0' NOT NULL,
	"safe_to_distribute" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_earnings_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"event_type" text NOT NULL,
	"settlement_document_id" uuid,
	"profit_loss_document_id" uuid,
	"finance_transaction_id" uuid,
	"gross_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"business_expense_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"pass_through_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"household_income_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"classification" text DEFAULT 'needs_review' NOT NULL,
	"notes" text,
	"idempotency_key" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_escrow_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"movement_date" date NOT NULL,
	"direction" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"counterparty" text,
	"status" text DEFAULT 'held' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_income_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"anomaly_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "business_economic_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"linked_event_id" uuid NOT NULL,
	"link_type" text NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_owner_draw_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"proposal_date" date NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"eligible_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"blocked_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profit_loss_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"statement_period_start" date NOT NULL,
	"statement_period_end" date NOT NULL,
	"source_file_name" text,
	"source_object_path" text,
	"source_sha256" text,
	"reported_revenue" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_expenses" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_profit" numeric(18, 2),
	"status" text DEFAULT 'needs_review' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profit_loss_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"profit_loss_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"line_type" text DEFAULT 'expense' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profit_loss_reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"statement_period_start" date NOT NULL,
	"statement_period_end" date NOT NULL,
	"settlement_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"settlement_deductions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"operating_expenses" numeric(18, 2) DEFAULT '0' NOT NULL,
	"calculated_profit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_profit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"variance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"period_coverage" text DEFAULT 'incomplete' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_reimbursement_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"finance_transaction_id" uuid,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settlement_cash_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"settlement_document_id" uuid NOT NULL,
	"finance_transaction_id" uuid,
	"matched_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"match_status" text DEFAULT 'unmatched' NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settlement_deduction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"settlement_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'other_deduction' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_deduction" boolean DEFAULT false NOT NULL,
	"pass_through" boolean DEFAULT false NOT NULL,
	"owner_draw" boolean DEFAULT false NOT NULL,
	"reimbursement" boolean DEFAULT false NOT NULL,
	"source_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settlement_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"source_kind" text DEFAULT 'manual' NOT NULL,
	"document_type" text DEFAULT 'settlement' NOT NULL,
	"provider" text,
	"statement_period_start" date NOT NULL,
	"statement_period_end" date NOT NULL,
	"paid_date" date,
	"source_file_name" text,
	"source_object_path" text,
	"source_sha256" text,
	"extraction_status" text DEFAULT 'manual' NOT NULL,
	"verification_status" text DEFAULT 'needs_review' NOT NULL,
	"reported_gross" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_deductions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"corrected_from_id" uuid,
	"source_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settlement_math_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"settlement_document_id" uuid NOT NULL,
	"revenue_line_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"deduction_line_total" numeric(18, 2) DEFAULT '0' NOT NULL,
	"calculated_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_net" numeric(18, 2) DEFAULT '0' NOT NULL,
	"variance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'needs_review' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_settlement_revenue_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"settlement_document_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'operating_revenue' NOT NULL,
	"quantity" numeric(18, 4),
	"unit_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"service_date" date,
	"source_page" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_verified_household_income_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"owner_draw_proposal_id" uuid NOT NULL,
	"income_date" date NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"source_type" text DEFAULT 'business_distribution' NOT NULL,
	"verification_status" text DEFAULT 'verified' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_advances" ADD CONSTRAINT "business_advances_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_advances" ADD CONSTRAINT "business_advances_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_advances" ADD CONSTRAINT "business_advances_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_cash_positions" ADD CONSTRAINT "business_cash_positions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_cash_positions" ADD CONSTRAINT "business_cash_positions_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_settlement_document_id_business_settlement_documents_id_fk" FOREIGN KEY ("settlement_document_id") REFERENCES "public"."business_settlement_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_profit_loss_document_id_business_profit_loss_documents_id_fk" FOREIGN KEY ("profit_loss_document_id") REFERENCES "public"."business_profit_loss_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_earnings_events" ADD CONSTRAINT "business_earnings_events_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_escrow_movements" ADD CONSTRAINT "business_escrow_movements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_escrow_movements" ADD CONSTRAINT "business_escrow_movements_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_escrow_movements" ADD CONSTRAINT "business_escrow_movements_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_income_anomalies" ADD CONSTRAINT "business_income_anomalies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_income_anomalies" ADD CONSTRAINT "business_income_anomalies_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_income_anomalies" ADD CONSTRAINT "business_income_anomalies_resolved_by_capital_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_economic_event_links" ADD CONSTRAINT "business_economic_event_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_economic_event_links" ADD CONSTRAINT "business_economic_event_links_event_id_business_earnings_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."business_earnings_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_economic_event_links" ADD CONSTRAINT "business_economic_event_links_linked_event_id_business_earnings_events_id_fk" FOREIGN KEY ("linked_event_id") REFERENCES "public"."business_earnings_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_economic_event_links" ADD CONSTRAINT "business_economic_event_links_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_owner_draw_proposals" ADD CONSTRAINT "business_owner_draw_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_owner_draw_proposals" ADD CONSTRAINT "business_owner_draw_proposals_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_owner_draw_proposals" ADD CONSTRAINT "business_owner_draw_proposals_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_owner_draw_proposals" ADD CONSTRAINT "business_owner_draw_proposals_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD CONSTRAINT "business_profit_loss_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD CONSTRAINT "business_profit_loss_documents_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_documents" ADD CONSTRAINT "business_profit_loss_documents_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD CONSTRAINT "business_profit_loss_lines_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_lines" ADD CONSTRAINT "business_profit_loss_lines_profit_loss_document_id_business_profit_loss_documents_id_fk" FOREIGN KEY ("profit_loss_document_id") REFERENCES "public"."business_profit_loss_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_reconciliation_runs" ADD CONSTRAINT "business_profit_loss_reconciliation_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_reconciliation_runs" ADD CONSTRAINT "business_profit_loss_reconciliation_runs_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profit_loss_reconciliation_runs" ADD CONSTRAINT "business_profit_loss_reconciliation_runs_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reimbursement_matches" ADD CONSTRAINT "business_reimbursement_matches_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reimbursement_matches" ADD CONSTRAINT "business_reimbursement_matches_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reimbursement_matches" ADD CONSTRAINT "business_reimbursement_matches_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reimbursement_matches" ADD CONSTRAINT "business_reimbursement_matches_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_cash_matches" ADD CONSTRAINT "business_settlement_cash_matches_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_cash_matches" ADD CONSTRAINT "business_settlement_cash_matches_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_cash_matches" ADD CONSTRAINT "business_settlement_cash_matches_settlement_document_id_business_settlement_documents_id_fk" FOREIGN KEY ("settlement_document_id") REFERENCES "public"."business_settlement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_cash_matches" ADD CONSTRAINT "business_settlement_cash_matches_finance_transaction_id_finance_transactions_id_fk" FOREIGN KEY ("finance_transaction_id") REFERENCES "public"."finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_cash_matches" ADD CONSTRAINT "business_settlement_cash_matches_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD CONSTRAINT "business_settlement_deduction_lines_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_deduction_lines" ADD CONSTRAINT "business_settlement_deduction_lines_settlement_document_id_business_settlement_documents_id_fk" FOREIGN KEY ("settlement_document_id") REFERENCES "public"."business_settlement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD CONSTRAINT "business_settlement_documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD CONSTRAINT "business_settlement_documents_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_documents" ADD CONSTRAINT "business_settlement_documents_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_math_reconciliations" ADD CONSTRAINT "business_settlement_math_reconciliations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_math_reconciliations" ADD CONSTRAINT "business_settlement_math_reconciliations_settlement_document_id_business_settlement_documents_id_fk" FOREIGN KEY ("settlement_document_id") REFERENCES "public"."business_settlement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD CONSTRAINT "business_settlement_revenue_lines_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settlement_revenue_lines" ADD CONSTRAINT "business_settlement_revenue_lines_settlement_document_id_business_settlement_documents_id_fk" FOREIGN KEY ("settlement_document_id") REFERENCES "public"."business_settlement_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_verified_household_income_events" ADD CONSTRAINT "business_verified_household_income_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_verified_household_income_events" ADD CONSTRAINT "business_verified_household_income_events_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_verified_household_income_events" ADD CONSTRAINT "business_verified_household_income_events_owner_draw_proposal_id_business_owner_draw_proposals_id_fk" FOREIGN KEY ("owner_draw_proposal_id") REFERENCES "public"."business_owner_draw_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_verified_household_income_events" ADD CONSTRAINT "business_verified_household_income_events_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "business_cash_positions_business_date_unique" ON "business_cash_positions" USING btree ("business_id","as_of");--> statement-breakpoint
CREATE INDEX "business_earnings_events_household_date_idx" ON "business_earnings_events" USING btree ("household_id","event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "business_earnings_events_idempotency_unique" ON "business_earnings_events" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "business_economic_event_links_event_pair_unique" ON "business_economic_event_links" USING btree ("event_id","linked_event_id","link_type");--> statement-breakpoint
CREATE INDEX "business_profit_loss_documents_household_period_idx" ON "business_profit_loss_documents" USING btree ("household_id","statement_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "business_profit_loss_lines_document_line_unique" ON "business_profit_loss_lines" USING btree ("profit_loss_document_id","line_number");--> statement-breakpoint
CREATE INDEX "business_profit_loss_reconciliation_runs_household_period_idx" ON "business_profit_loss_reconciliation_runs" USING btree ("household_id","statement_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "business_reimbursement_matches_transaction_unique" ON "business_reimbursement_matches" USING btree ("finance_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_cash_matches_settlement_unique" ON "business_settlement_cash_matches" USING btree ("settlement_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_cash_matches_transaction_unique" ON "business_settlement_cash_matches" USING btree ("finance_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_deduction_lines_document_line_unique" ON "business_settlement_deduction_lines" USING btree ("settlement_document_id","line_number");--> statement-breakpoint
CREATE INDEX "business_settlement_deduction_lines_household_idx" ON "business_settlement_deduction_lines" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "business_settlement_documents_household_period_idx" ON "business_settlement_documents" USING btree ("household_id","statement_period_end");--> statement-breakpoint
CREATE INDEX "business_settlement_documents_business_period_idx" ON "business_settlement_documents" USING btree ("business_id","statement_period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_documents_source_hash_unique" ON "business_settlement_documents" USING btree ("household_id","source_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_math_reconciliations_settlement_unique" ON "business_settlement_math_reconciliations" USING btree ("settlement_document_id");--> statement-breakpoint
CREATE INDEX "business_settlement_math_reconciliations_household_idx" ON "business_settlement_math_reconciliations" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_settlement_revenue_lines_document_line_unique" ON "business_settlement_revenue_lines" USING btree ("settlement_document_id","line_number");--> statement-breakpoint
CREATE INDEX "business_settlement_revenue_lines_household_idx" ON "business_settlement_revenue_lines" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_verified_household_income_events_proposal_unique" ON "business_verified_household_income_events" USING btree ("owner_draw_proposal_id");