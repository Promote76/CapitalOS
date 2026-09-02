CREATE TYPE "public"."account_type" AS ENUM('protected_capital', 'active_capital', 'cash_reserve', 'duplex_reserve', 'opportunity_reserve', 'strategy_capital', 'property_capital', 'treasury');--> statement-breakpoint
CREATE TYPE "public"."bank_connection_status" AS ENUM('connected', 'healthy', 'needs_reauthentication', 'syncing', 'delayed', 'disconnected', 'manual', 'error');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('upcoming', 'due_soon', 'paid', 'overdue', 'estimated', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."budget_category_type" AS ENUM('fixed_expense', 'variable_essential', 'variable_discretionary', 'savings', 'investment', 'debt_payment', 'transfer', 'income', 'one_time_expense');--> statement-breakpoint
CREATE TYPE "public"."business_tag" AS ENUM('household', 'business', 'mixed', 'reimbursable');--> statement-breakpoint
CREATE TYPE "public"."capital_request_status" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."essential_status" AS ENUM('essential', 'discretionary', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."finance_data_source" AS ENUM('plaid', 'manual', 'csv_import', 'capital_os_ledger', 'user_entered', 'calculated');--> statement-breakpoint
CREATE TYPE "public"."finance_review_status" AS ENUM('approved', 'needs_review', 'uncategorized', 'possible_duplicate', 'possible_transfer', 'possible_business', 'possible_property', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('checking', 'savings', 'money_market', 'credit_card', 'loan', 'mortgage', 'brokerage', 'retirement', 'crypto', 'business_checking', 'protected_duplex', 'opportunity_reserve', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('draft', 'active', 'on_track', 'behind', 'ahead', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'partner', 'viewer', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."income_source_type" AS ENUM('employment', 'contract', 'business', 'rental', 'investment', 'interest', 'other');--> statement-breakpoint
CREATE TYPE "public"."liquidity_class" AS ENUM('IMMEDIATE', 'ONE_TO_THREE_DAYS', 'THREE_TO_SEVEN_DAYS', 'SEVEN_TO_THIRTY_DAYS', 'ILLIQUID');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('future', 'current', 'complete', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('discovered', 'research', 'researching', 'watchlist', 'qualified', 'high_priority', 'tour', 'tour_candidate', 'financing_review', 'offer_candidate', 'offer_submitted', 'negotiating', 'under_contract', 'inspection', 'appraisal', 'financing', 'closing', 'acquired', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('proposed', 'under_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."risk_class" AS ENUM('protected', 'conservative', 'moderate', 'experimental');--> statement-breakpoint
CREATE TYPE "public"."safety_state" AS ENUM('normal', 'review', 'safe_mode', 'stop', 'evacuate', 'locked');--> statement-breakpoint
CREATE TYPE "public"."strategy_stage" AS ENUM('research', 'backtest', 'shadow', 'paper', 'micro_live', 'approved', 'production', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('contribution', 'transfer', 'strategy_allocation', 'strategy_return', 'strategy_loss', 'property_expense', 'closing_expense', 'income', 'withdrawal', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('draft', 'pending', 'authorized', 'processing', 'completed', 'failed', 'cancelled', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."treasury_bucket_type" AS ENUM('OPERATING', 'EMERGENCY', 'PROTECTED_GOAL', 'PROPERTY', 'TREASURY', 'OPPORTUNITY', 'STRATEGY', 'LONG_TERM', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."upcoming_expense_priority" AS ENUM('low', 'normal', 'high', 'critical');--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ai_advisory_only" boolean DEFAULT true NOT NULL,
	"blockchain_enabled" boolean DEFAULT false NOT NULL,
	"emergency_stop_active" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_settings_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_auth_id" text,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"risk_class" "risk_class" DEFAULT 'conservative' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"total_weekly" numeric(18, 2) DEFAULT '0' NOT NULL,
	"duplex_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"capital_os" numeric(18, 2) DEFAULT '0' NOT NULL,
	"opportunity_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"goal_id" uuid,
	"allocation_rule_id" uuid,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"protected_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"weekly_contribution" numeric(18, 2) DEFAULT '0' NOT NULL,
	"start_date" date NOT NULL,
	"target_date" date NOT NULL,
	"priority" "goal_priority" DEFAULT 'normal' NOT NULL,
	"status" "goal_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"source_account_id" uuid,
	"destination_account_id" uuid,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"category" "transaction_category" NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"external_reference" text,
	"created_by" uuid,
	"idempotency_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buy_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_type" text DEFAULT 'duplex' NOT NULL,
	"owner_occupied" boolean DEFAULT true NOT NULL,
	"purchase_price_minimum" numeric(18, 2) DEFAULT '0' NOT NULL,
	"purchase_price_maximum" numeric(18, 2) DEFAULT '0' NOT NULL,
	"target_cash_to_close" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimum_bedrooms_per_unit" numeric(4, 0) DEFAULT '2' NOT NULL,
	"minimum_bathrooms_per_unit" numeric(4, 1) DEFAULT '1' NOT NULL,
	"minimum_estimated_rent" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maximum_estimated_rehabilitation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimum_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maximum_monthly_housing_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimum_dscr_estimate" numeric(6, 3) DEFAULT '1.15' NOT NULL,
	"maximum_property_age" numeric(5, 0),
	"minimum_property_condition" text DEFAULT 'fair' NOT NULL,
	"target_markets" text[] DEFAULT '{}' NOT NULL,
	"excluded_markets" text[] DEFAULT '{}' NOT NULL,
	"truck_parking_proximity" text,
	"neighborhood_requirements" text,
	"property_tax_ceiling" numeric(18, 2) DEFAULT '0' NOT NULL,
	"insurance_cost_ceiling" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimum_readiness_score" numeric(5, 2) DEFAULT '60' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buy_boxes_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "cash_to_close_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_candidate_id" uuid,
	"down_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"earnest_money" numeric(18, 2) DEFAULT '0' NOT NULL,
	"inspection" numeric(18, 2) DEFAULT '0' NOT NULL,
	"appraisal" numeric(18, 2) DEFAULT '0' NOT NULL,
	"loan_fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"origination_fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"title_fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"recording_fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"prepaid_taxes" numeric(18, 2) DEFAULT '0' NOT NULL,
	"prepaid_insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"escrows" numeric(18, 2) DEFAULT '0' NOT NULL,
	"immediate_repairs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"moving_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"initial_reserves" numeric(18, 2) DEFAULT '0' NOT NULL,
	"emergency_buffer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"other_closing_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_cash_to_close" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financing_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_candidate_id" uuid,
	"name" text NOT NULL,
	"loan_type" text DEFAULT 'conventional' NOT NULL,
	"purchase_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"down_payment_percent" numeric(7, 4) DEFAULT '0.05' NOT NULL,
	"interest_rate" numeric(7, 4) DEFAULT '0.07' NOT NULL,
	"term_years" numeric(4, 0) DEFAULT '30' NOT NULL,
	"mortgage_insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"loan_fees" numeric(18, 2) DEFAULT '0' NOT NULL,
	"closing_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"initial_reserves" numeric(18, 2) DEFAULT '0' NOT NULL,
	"loan_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"monthly_principal_interest" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_monthly_housing_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preapproval_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"contact" text,
	"date_contacted" date,
	"status" text DEFAULT 'research' NOT NULL,
	"estimated_maximum_purchase_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_rate" numeric(7, 4),
	"estimated_cash_required" numeric(18, 2) DEFAULT '0' NOT NULL,
	"expiration" date,
	"documents_needed" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"market_id" uuid,
	"address_label" text NOT NULL,
	"city" text,
	"state" text,
	"zip" text,
	"market" text,
	"property_type" text DEFAULT 'duplex' NOT NULL,
	"units" numeric(4, 0) DEFAULT '2' NOT NULL,
	"bedrooms" numeric(4, 0) DEFAULT '4' NOT NULL,
	"bathrooms" numeric(4, 1) DEFAULT '2' NOT NULL,
	"asking_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_market_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"annual_property_taxes" numeric(18, 2) DEFAULT '0' NOT NULL,
	"insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"hoa" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_rent" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_rents" numeric(18, 2) DEFAULT '0' NOT NULL,
	"vacancy_assumption" numeric(6, 4) DEFAULT '0.05' NOT NULL,
	"down_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"closing_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"repairs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"immediate_repairs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"deferred_maintenance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"square_footage" numeric(12, 0),
	"lot_size" numeric(12, 2),
	"year_built" numeric(5, 0),
	"listing_source" text,
	"listing_url" text,
	"date_discovered" date,
	"last_reviewed" date,
	"financing_estimate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cash_required" numeric(18, 2) DEFAULT '0' NOT NULL,
	"projected_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"readiness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"buy_box_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"deal_quality_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"data_confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"readiness_status" text DEFAULT 'needs_data' NOT NULL,
	"risk_level" text DEFAULT 'moderate' NOT NULL,
	"notes" text,
	"next_action" text,
	"status" "property_status" DEFAULT 'research' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"storage_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_market" text,
	"target_budget" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_down_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_closing_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"readiness_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "milestone_status" DEFAULT 'future' NOT NULL,
	"progress" numeric(5, 2) DEFAULT '0' NOT NULL,
	"target" text,
	"current_state" text,
	"next_action" text,
	"due_date" date,
	"sort_order" numeric(4, 0) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_readiness_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"status" text NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_stress_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_candidate_id" uuid NOT NULL,
	"name" text NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"monthly_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"emergency_reserve_remaining" numeric(18, 2) DEFAULT '0' NOT NULL,
	"months_until_liquidity_breach" numeric(8, 2),
	"result" text DEFAULT 'review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "research_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"strategy_type" text NOT NULL,
	"stage" "strategy_stage" DEFAULT 'research' NOT NULL,
	"owner" text,
	"hypothesis" text,
	"markets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"venues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"time_horizon" text,
	"entry_logic" text,
	"exit_logic" text,
	"position_sizing_logic" text,
	"risk_logic" text,
	"execution_model" text,
	"required_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"known_risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allocation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"expected_edge" numeric(8, 4) DEFAULT '0' NOT NULL,
	"max_drawdown" numeric(8, 4) DEFAULT '0' NOT NULL,
	"confidence_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"runtime_days" numeric(8, 0) DEFAULT '0' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"from_stage" "strategy_stage" NOT NULL,
	"to_stage" "strategy_stage" NOT NULL,
	"approved_by" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"strategy_version_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'backtest' NOT NULL,
	"dataset_version" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"execution_assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk_limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"random_seed" numeric(12, 0) DEFAULT '0' NOT NULL,
	"software_version" text DEFAULT 'capital-os-lab-1' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "strategy_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"observations" numeric(12, 0) DEFAULT '0' NOT NULL,
	"fills" numeric(12, 0) DEFAULT '0' NOT NULL,
	"runtime_hours" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expectancy" numeric(12, 6) DEFAULT '0' NOT NULL,
	"drawdown" numeric(12, 6) DEFAULT '0' NOT NULL,
	"reconciliation_accuracy" numeric(8, 5) DEFAULT '0' NOT NULL,
	"critical_error_count" numeric(8, 0) DEFAULT '0' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy_id" uuid NOT NULL,
	"version" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"median_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"rent_yield" numeric(6, 3) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"analyst" text NOT NULL,
	"scope" text NOT NULL,
	"summary" text NOT NULL,
	"data_quality" text DEFAULT 'medium' NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recommendation" text NOT NULL,
	"analyst" text DEFAULT 'AI CIO' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"rationale" text NOT NULL,
	"expected_benefit" text NOT NULL,
	"potential_downside" text DEFAULT 'No material downside identified.' NOT NULL,
	"risk_impact" text NOT NULL,
	"data_quality" text DEFAULT 'medium' NOT NULL,
	"suggested_next_action" text,
	"affected_goal_id" uuid,
	"affected_capital" text,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"status" "recommendation_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"key" text NOT NULL,
	"operation" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"feedback" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"severity" text NOT NULL,
	"message" text NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"state" "safety_state" DEFAULT 'normal' NOT NULL,
	"max_active_capital" numeric(18, 2) DEFAULT '0' NOT NULL,
	"max_strategy_allocation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"max_weekly_risk" numeric(8, 4) DEFAULT '0' NOT NULL,
	"max_drawdown" numeric(8, 4) DEFAULT '0' NOT NULL,
	"minimum_cash_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"protected_capital_locked" boolean DEFAULT true NOT NULL,
	"emergency_stop_active" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_states_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" "bank_connection_status" DEFAULT 'manual' NOT NULL,
	"institution_name" text NOT NULL,
	"provider_connection_ref" text,
	"last_successful_sync" timestamp with time zone,
	"last_balance_refresh" timestamp with time zone,
	"last_transaction_sync" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emergency_reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"target_months" integer DEFAULT 6 NOT NULL,
	"essential_monthly_expenses" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid,
	"recurring_transaction_id" uuid,
	"bill_name" text NOT NULL,
	"due_date" date NOT NULL,
	"expected_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" "bill_status" DEFAULT 'upcoming' NOT NULL,
	"essential" boolean DEFAULT true NOT NULL,
	"auto_pay" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category_type" "budget_category_type" NOT NULL,
	"essential_status" "essential_status" NOT NULL,
	"monthly_target" numeric(18, 2) DEFAULT '0' NOT NULL,
	"warning_threshold" numeric(6, 4) DEFAULT '1.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"gross_inflow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"essential_outflow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"discretionary_outflow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"debt_service" numeric(18, 2) DEFAULT '0' NOT NULL,
	"savings_contributions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"investment_contributions" numeric(18, 2) DEFAULT '0' NOT NULL,
	"net_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"free_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
	"safe_to_deploy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"safe_to_deploy_confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"financial_health_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"budget_performance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text,
	"transaction_date" date NOT NULL,
	"description" text NOT NULL,
	"merchant" text,
	"original_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 2) NOT NULL,
	"category_id" uuid,
	"data_source" "finance_data_source" DEFAULT 'manual' NOT NULL,
	"review_status" "finance_review_status" DEFAULT 'uncategorized' NOT NULL,
	"business_tag" "business_tag" DEFAULT 'household' NOT NULL,
	"excluded_from_budget" boolean DEFAULT false NOT NULL,
	"pending" boolean DEFAULT false NOT NULL,
	"transfer_group_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bank_connection_id" uuid,
	"institution" text NOT NULL,
	"nickname" text NOT NULL,
	"account_type" "financial_account_type" NOT NULL,
	"current_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"available_balance" numeric(18, 2),
	"last_sync" timestamp with time zone,
	"connection_status" "bank_connection_status" DEFAULT 'manual' NOT NULL,
	"included_in_net_worth" boolean DEFAULT true NOT NULL,
	"included_in_budget" boolean DEFAULT true NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"business_entity_id" uuid,
	"data_source" "finance_data_source" DEFAULT 'manual' NOT NULL,
	"last_successful_sync" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" "income_source_type" NOT NULL,
	"expected_monthly" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cadence" "recurring_frequency" DEFAULT 'monthly' NOT NULL,
	"next_pay_date" date DEFAULT '2026-09-15' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_finance_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"merchant" text NOT NULL,
	"expected_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"average_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"frequency" "recurring_frequency" NOT NULL,
	"next_expected_date" date NOT NULL,
	"confidence" numeric(5, 2) DEFAULT '0' NOT NULL,
	"essential_status" "essential_status" NOT NULL,
	"annual_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upcoming_finance_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"estimated_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"expected_date" date NOT NULL,
	"priority" "upcoming_expense_priority" DEFAULT 'normal' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"funded_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_fills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"order_intent_id" uuid,
	"venue_id" uuid,
	"external_fill_id" text NOT NULL,
	"market_id" text NOT NULL,
	"side" text NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"price" numeric(18, 8) NOT NULL,
	"fee" numeric(18, 8) DEFAULT '0' NOT NULL,
	"markouts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fill_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"venue_id" uuid,
	"external_fill_id" text NOT NULL,
	"market_id" text NOT NULL,
	"source" text DEFAULT 'VENUE' NOT NULL,
	"side" text NOT NULL,
	"quantity" numeric(18, 8) NOT NULL,
	"price" numeric(18, 8) NOT NULL,
	"fee" numeric(18, 8) DEFAULT '0' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"service" text NOT NULL,
	"status" text DEFAULT 'HEALTHY' NOT NULL,
	"observed_exposure" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reported_exposure" numeric(18, 2) DEFAULT '0' NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature_valid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "micro_live_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"policy_version" text DEFAULT 'sandbox-1' NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_scale" boolean DEFAULT false NOT NULL,
	"leverage_enabled" boolean DEFAULT false NOT NULL,
	"margin_enabled" boolean DEFAULT false NOT NULL,
	"borrowing_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "micro_live_policies_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "micro_live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"strategy_id" uuid,
	"strategy_version_id" uuid,
	"venue_id" uuid,
	"status" text DEFAULT 'DISABLED' NOT NULL,
	"mode" text DEFAULT 'LIVE_REHEARSAL' NOT NULL,
	"capital_allocated" numeric(18, 2) DEFAULT '0' NOT NULL,
	"session_loss_limit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"session_exposure_cap" numeric(18, 2) DEFAULT '0' NOT NULL,
	"authorization_expires_at" timestamp with time zone,
	"armed_by" uuid,
	"armed_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_intent_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"external_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"strategy_id" uuid,
	"strategy_version_id" uuid,
	"venue_id" uuid,
	"market_id" text NOT NULL,
	"client_order_id" text NOT NULL,
	"side" text NOT NULL,
	"order_type" text NOT NULL,
	"price" numeric(18, 8),
	"quantity" numeric(18, 8) NOT NULL,
	"state" text DEFAULT 'CREATED' NOT NULL,
	"validation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "position_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"venue_id" uuid,
	"market_id" text NOT NULL,
	"source" text DEFAULT 'INTERNAL' NOT NULL,
	"quantity" numeric(18, 8) DEFAULT '0' NOT NULL,
	"average_price" numeric(18, 8) DEFAULT '0' NOT NULL,
	"mark_price" numeric(18, 8) DEFAULT '0' NOT NULL,
	"notional" numeric(18, 2) DEFAULT '0' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_incident_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"root_cause" text NOT NULL,
	"capital_impact" numeric(18, 2) DEFAULT '0' NOT NULL,
	"safeguards_worked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_fixes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reactivation_requirements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_incident_reviews_incident_id_unique" UNIQUE("incident_id")
);
--> statement-breakpoint
CREATE TABLE "reactivation_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"completed_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"status" text DEFAULT 'CLEAN' NOT NULL,
	"mismatches" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"internal_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"venue_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"severity" text NOT NULL,
	"incident_type" text NOT NULL,
	"title" text NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"capital_impact" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "venue_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_intent_id" uuid NOT NULL,
	"external_order_id" text,
	"venue_status" text,
	"raw_response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"adapter_type" text DEFAULT 'simulated' NOT NULL,
	"status" text DEFAULT 'Research' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"jurisdiction_confirmed" boolean DEFAULT false NOT NULL,
	"credentials_reference" text,
	"integration_approved" boolean DEFAULT false NOT NULL,
	"terms_reviewed" boolean DEFAULT false NOT NULL,
	"market_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"withdrawal_reviewed" boolean DEFAULT false NOT NULL,
	"withdrawal_disabled" boolean DEFAULT false NOT NULL,
	"security_review" jsonb,
	"jurisdiction_review" jsonb,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"requesting_module" text NOT NULL,
	"strategy_id" uuid,
	"requested_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"purpose" text NOT NULL,
	"expected_duration" text NOT NULL,
	"risk_class" "risk_class" NOT NULL,
	"expected_return_assumption" text NOT NULL,
	"liquidity_requirement" text NOT NULL,
	"current_allocation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"requested_new_allocation" numeric(18, 2) DEFAULT '0' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "capital_request_status" DEFAULT 'SUBMITTED' NOT NULL,
	"decision_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capital_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"bucket_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reserved_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"starts_at" date NOT NULL,
	"expires_at" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_capital_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bucket_type" "treasury_bucket_type" NOT NULL,
	"priority" integer NOT NULL,
	"target_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"minimum_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maximum_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"liquid" boolean DEFAULT true NOT NULL,
	"liquidity_class" "liquidity_class" NOT NULL,
	"risk_class" "risk_class" DEFAULT 'conservative' NOT NULL,
	"withdrawal_policy" text NOT NULL,
	"funding_rule" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treasury_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"minimum_operating_cash" numeric(18, 2) DEFAULT '0' NOT NULL,
	"emergency_target_months" integer DEFAULT 6 NOT NULL,
	"minimum_weekly_duplex_contribution" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maximum_strategy_percent" numeric(5, 2) DEFAULT '15' NOT NULL,
	"maximum_single_strategy_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
	"maximum_single_venue_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
	"maximum_illiquid_percent" numeric(5, 2) DEFAULT '20' NOT NULL,
	"maximum_active_percent" numeric(5, 2) DEFAULT '30' NOT NULL,
	"auto_scale" boolean DEFAULT false NOT NULL,
	"hierarchy" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "treasury_policies_household_id_unique" UNIQUE("household_id")
);
--> statement-breakpoint
CREATE TABLE "operations_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"alert_key" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"domain" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operations_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"related_entity" text NOT NULL,
	"current_state" text NOT NULL,
	"proposed_state" text NOT NULL,
	"financial_impact" text NOT NULL,
	"risk_impact" text NOT NULL,
	"duplex_impact" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_authority" text NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operations_automations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"last_run" timestamp with time zone,
	"next_run" timestamp with time zone,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"critical_alerts" jsonb DEFAULT '["in_app","email"]'::jsonb NOT NULL,
	"bills" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"budget" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"duplex_goal" jsonb DEFAULT '["in_app","email"]'::jsonb NOT NULL,
	"property" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"strategies" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"accounting" jsonb DEFAULT '["in_app"]'::jsonb NOT NULL,
	"security" jsonb DEFAULT '["in_app","email"]'::jsonb NOT NULL,
	"weekly_reports" jsonb DEFAULT '["in_app","email"]'::jsonb NOT NULL,
	"monthly_reports" jsonb DEFAULT '["in_app","email"]'::jsonb NOT NULL,
	"quiet_hours_start" text,
	"quiet_hours_end" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"automation_id" uuid NOT NULL,
	"result" text NOT NULL,
	"actions_created" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safe_boundary" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"domain" text NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"due_date" date NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid NOT NULL,
	"source" text DEFAULT 'USER' NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "business_distributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"distribution_date" date NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"household_destination" text DEFAULT 'household_cash' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"entity_type" text DEFAULT 'single_member_llc' NOT NULL,
	"ownership_percentage" numeric(6, 3) DEFAULT '100' NOT NULL,
	"tax_classification" text,
	"industry" text,
	"status" text DEFAULT 'active' NOT NULL,
	"formation_date" date,
	"state" text,
	"ein_reference" text,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"expense_date" date NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"description" text NOT NULL,
	"expense_type" text DEFAULT 'operating' NOT NULL,
	"classification" text DEFAULT 'business' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_reserves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"target_method" text DEFAULT '3_months' NOT NULL,
	"target_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"tax_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"safety_buffer" numeric(18, 2) DEFAULT '0' NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_revenue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"revenue_date" date NOT NULL,
	"category" text DEFAULT 'operating' NOT NULL,
	"amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"customer" text,
	"description" text NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_capital_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."capital_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_settings" ADD CONSTRAINT "household_settings_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_accounts" ADD CONSTRAINT "capital_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_rules" ADD CONSTRAINT "allocation_rules_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_rules" ADD CONSTRAINT "allocation_rules_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_goal_id_capital_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."capital_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_allocation_rule_id_allocation_rules_id_fk" FOREIGN KEY ("allocation_rule_id") REFERENCES "public"."allocation_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_goals" ADD CONSTRAINT "capital_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_capital_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."capital_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_source_account_id_capital_accounts_id_fk" FOREIGN KEY ("source_account_id") REFERENCES "public"."capital_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_destination_account_id_capital_accounts_id_fk" FOREIGN KEY ("destination_account_id") REFERENCES "public"."capital_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_boxes" ADD CONSTRAINT "buy_boxes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_to_close_estimates" ADD CONSTRAINT "cash_to_close_estimates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_to_close_estimates" ADD CONSTRAINT "cash_to_close_estimates_property_candidate_id_property_candidates_id_fk" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_scenarios" ADD CONSTRAINT "financing_scenarios_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financing_scenarios" ADD CONSTRAINT "financing_scenarios_property_candidate_id_property_candidates_id_fk" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preapproval_records" ADD CONSTRAINT "preapproval_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD CONSTRAINT "property_candidates_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD CONSTRAINT "property_candidates_market_id_target_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."target_markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_goals" ADD CONSTRAINT "property_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_milestones" ADD CONSTRAINT "property_milestones_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_readiness_snapshots" ADD CONSTRAINT "property_readiness_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_readiness_snapshots" ADD CONSTRAINT "property_readiness_snapshots_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_stress_tests" ADD CONSTRAINT "property_stress_tests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_stress_tests" ADD CONSTRAINT "property_stress_tests_property_candidate_id_property_candidates_id_fk" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_approvals" ADD CONSTRAINT "strategy_approvals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_approvals" ADD CONSTRAINT "strategy_approvals_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_performance" ADD CONSTRAINT "strategy_performance_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_markets" ADD CONSTRAINT "target_markets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_recommendation_id_ai_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ai_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_states" ADD CONSTRAINT "risk_states_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_reserves" ADD CONSTRAINT "emergency_reserves_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_account_id_household_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."household_financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_bills" ADD CONSTRAINT "finance_bills_recurring_transaction_id_recurring_finance_transactions_id_fk" FOREIGN KEY ("recurring_transaction_id") REFERENCES "public"."recurring_finance_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_snapshots" ADD CONSTRAINT "finance_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_account_id_household_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."household_financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_transactions" ADD CONSTRAINT "finance_transactions_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_financial_accounts" ADD CONSTRAINT "household_financial_accounts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_financial_accounts" ADD CONSTRAINT "household_financial_accounts_bank_connection_id_bank_connections_id_fk" FOREIGN KEY ("bank_connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_financial_accounts" ADD CONSTRAINT "household_financial_accounts_business_entity_id_business_entities_id_fk" FOREIGN KEY ("business_entity_id") REFERENCES "public"."business_entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_account_id_household_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."household_financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upcoming_finance_expenses" ADD CONSTRAINT "upcoming_finance_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_heartbeats" ADD CONSTRAINT "guardian_heartbeats_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_policies" ADD CONSTRAINT "micro_live_policies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_armed_by_capital_users_id_fk" FOREIGN KEY ("armed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_incident_id_trading_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."trading_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_incident_id_trading_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."trading_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_review_id_post_incident_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."post_incident_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_completed_by_capital_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_incidents" ADD CONSTRAINT "trading_incidents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_incidents" ADD CONSTRAINT "trading_incidents_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_orders" ADD CONSTRAINT "venue_orders_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_registry" ADD CONSTRAINT "venue_registry_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_registry" ADD CONSTRAINT "venue_registry_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_requests" ADD CONSTRAINT "capital_requests_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_reservations" ADD CONSTRAINT "capital_reservations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_reservations" ADD CONSTRAINT "capital_reservations_bucket_id_treasury_capital_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."treasury_capital_buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capital_reservations" ADD CONSTRAINT "capital_reservations_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_capital_buckets" ADD CONSTRAINT "treasury_capital_buckets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_policies" ADD CONSTRAINT "treasury_policies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treasury_policies" ADD CONSTRAINT "treasury_policies_updated_by_capital_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_alerts" ADD CONSTRAINT "operations_alerts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_approvals" ADD CONSTRAINT "operations_approvals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_approvals" ADD CONSTRAINT "operations_approvals_requested_by_capital_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_automations" ADD CONSTRAINT "operations_automations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_automations" ADD CONSTRAINT "operations_automations_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_notification_preferences" ADD CONSTRAINT "operations_notification_preferences_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_notification_preferences" ADD CONSTRAINT "operations_notification_preferences_user_id_capital_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."capital_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_runs" ADD CONSTRAINT "operations_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_runs" ADD CONSTRAINT "operations_runs_automation_id_operations_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."operations_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_tasks" ADD CONSTRAINT "operations_tasks_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_tasks" ADD CONSTRAINT "operations_tasks_assigned_to_capital_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations_tasks" ADD CONSTRAINT "operations_tasks_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_distributions" ADD CONSTRAINT "business_distributions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_distributions" ADD CONSTRAINT "business_distributions_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_distributions" ADD CONSTRAINT "business_distributions_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_entities" ADD CONSTRAINT "business_entities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_entities" ADD CONSTRAINT "business_entities_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_expenses" ADD CONSTRAINT "business_expenses_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reserves" ADD CONSTRAINT "business_reserves_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reserves" ADD CONSTRAINT "business_reserves_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_reserves" ADD CONSTRAINT "business_reserves_updated_by_capital_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_revenue" ADD CONSTRAINT "business_revenue_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_revenue" ADD CONSTRAINT "business_revenue_business_id_business_entities_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_revenue" ADD CONSTRAINT "business_revenue_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_user_unique" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "household_members_household_idx" ON "household_members" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capital_users_external_auth_id_unique" ON "capital_users" USING btree ("external_auth_id");--> statement-breakpoint
CREATE INDEX "capital_accounts_household_idx" ON "capital_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "allocation_rules_household_active_idx" ON "allocation_rules" USING btree ("household_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_household_idempotency_unique" ON "contributions" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "contributions_household_idx" ON "contributions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_goals_household_idx" ON "capital_goals" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_household_idx" ON "ledger_transactions" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_household_idempotency_unique" ON "ledger_transactions" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "financing_scenarios_household_idx" ON "financing_scenarios" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "financing_scenarios_property_idx" ON "financing_scenarios" USING btree ("property_candidate_id");--> statement-breakpoint
CREATE INDEX "preapproval_records_household_idx" ON "preapproval_records" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "property_candidates_goal_idx" ON "property_candidates" USING btree ("property_goal_id");--> statement-breakpoint
CREATE INDEX "property_milestones_goal_idx" ON "property_milestones" USING btree ("property_goal_id");--> statement-breakpoint
CREATE INDEX "property_readiness_snapshots_goal_idx" ON "property_readiness_snapshots" USING btree ("property_goal_id");--> statement-breakpoint
CREATE INDEX "property_stress_tests_property_idx" ON "property_stress_tests" USING btree ("property_candidate_id");--> statement-breakpoint
CREATE INDEX "research_journal_entries_household_idx" ON "research_journal_entries" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "research_journal_entries_strategy_idx" ON "research_journal_entries" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategies_household_idx" ON "strategies" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "strategy_experiments_household_idx" ON "strategy_experiments" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "strategy_experiments_strategy_idx" ON "strategy_experiments" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "strategy_experiments_created_at_idx" ON "strategy_experiments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "target_markets_household_idx" ON "target_markets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ai_analyses_household_idx" ON "ai_analyses" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ai_insights_household_idx" ON "ai_insights" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ai_recommendations_household_idx" ON "ai_recommendations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "audit_events_household_idx" ON "audit_events" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_household_key_unique" ON "idempotency_keys" USING btree ("household_id","key");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_household_idx" ON "recommendation_feedback" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "recommendation_feedback_recommendation_idx" ON "recommendation_feedback" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "risk_events_household_idx" ON "risk_events" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "bank_connections_household_idx" ON "bank_connections" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_reserves_household_unique" ON "emergency_reserves" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "finance_bills_household_due_idx" ON "finance_bills" USING btree ("household_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_categories_household_name_unique" ON "finance_categories" USING btree ("household_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_snapshots_household_date_unique" ON "finance_snapshots" USING btree ("household_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "finance_transactions_household_date_idx" ON "finance_transactions" USING btree ("household_id","transaction_date");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_transactions_account_external_unique" ON "finance_transactions" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "household_financial_accounts_household_idx" ON "household_financial_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "income_sources_household_idx" ON "income_sources" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "recurring_finance_transactions_household_idx" ON "recurring_finance_transactions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "upcoming_finance_expenses_household_date_idx" ON "upcoming_finance_expenses" USING btree ("household_id","expected_date");--> statement-breakpoint
CREATE INDEX "execution_fills_household_idx" ON "execution_fills" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_fills_external_fill_idx" ON "execution_fills" USING btree ("external_fill_id");--> statement-breakpoint
CREATE INDEX "fill_snapshots_household_idx" ON "fill_snapshots" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fill_snapshots_external_source_idx" ON "fill_snapshots" USING btree ("external_fill_id","source");--> statement-breakpoint
CREATE INDEX "fill_snapshots_captured_idx" ON "fill_snapshots" USING btree ("household_id","captured_at");--> statement-breakpoint
CREATE INDEX "guardian_heartbeats_household_idx" ON "guardian_heartbeats" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "micro_live_policies_household_idx" ON "micro_live_policies" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "micro_live_sessions_household_idx" ON "micro_live_sessions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_events_external_event_idx" ON "order_events" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "order_intents_household_idx" ON "order_intents" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_intents_client_order_id_idx" ON "order_intents" USING btree ("client_order_id");--> statement-breakpoint
CREATE INDEX "position_snapshots_household_idx" ON "position_snapshots" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "position_snapshots_captured_idx" ON "position_snapshots" USING btree ("household_id","captured_at");--> statement-breakpoint
CREATE INDEX "post_incident_reviews_household_idx" ON "post_incident_reviews" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_incident_reviews_incident_idx" ON "post_incident_reviews" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "reactivation_requirements_household_idx" ON "reactivation_requirements" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "reactivation_requirements_incident_idx" ON "reactivation_requirements" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "reconciliation_runs_household_idx" ON "reconciliation_runs" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "trading_incidents_household_idx" ON "trading_incidents" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "venue_orders_intent_idx" ON "venue_orders" USING btree ("order_intent_id");--> statement-breakpoint
CREATE INDEX "venue_registry_household_idx" ON "venue_registry" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_requests_household_idx" ON "capital_requests" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_requests_household_status_idx" ON "capital_requests" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "capital_reservations_household_idx" ON "capital_reservations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_reservations_bucket_idx" ON "capital_reservations" USING btree ("bucket_id");--> statement-breakpoint
CREATE INDEX "treasury_buckets_household_idx" ON "treasury_capital_buckets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "treasury_buckets_household_priority_idx" ON "treasury_capital_buckets" USING btree ("household_id","priority");--> statement-breakpoint
CREATE INDEX "treasury_policies_household_idx" ON "treasury_policies" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_alerts_household_key_unique" ON "operations_alerts" USING btree ("household_id","alert_key");--> statement-breakpoint
CREATE INDEX "operations_alerts_household_status_idx" ON "operations_alerts" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "operations_approvals_household_status_idx" ON "operations_approvals" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "operations_automations_household_idx" ON "operations_automations" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operations_notification_preferences_household_user_unique" ON "operations_notification_preferences" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "operations_runs_household_idx" ON "operations_runs" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "operations_tasks_household_status_idx" ON "operations_tasks" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "operations_tasks_due_date_idx" ON "operations_tasks" USING btree ("household_id","due_date");--> statement-breakpoint
CREATE INDEX "business_distributions_household_date_idx" ON "business_distributions" USING btree ("household_id","distribution_date");--> statement-breakpoint
CREATE INDEX "business_distributions_business_date_idx" ON "business_distributions" USING btree ("business_id","distribution_date");--> statement-breakpoint
CREATE UNIQUE INDEX "business_entities_household_display_name_unique" ON "business_entities" USING btree ("household_id","display_name");--> statement-breakpoint
CREATE INDEX "business_entities_household_status_idx" ON "business_entities" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "business_expenses_household_date_idx" ON "business_expenses" USING btree ("household_id","expense_date");--> statement-breakpoint
CREATE INDEX "business_expenses_business_date_idx" ON "business_expenses" USING btree ("business_id","expense_date");--> statement-breakpoint
CREATE UNIQUE INDEX "business_reserves_business_unique" ON "business_reserves" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_revenue_household_date_idx" ON "business_revenue" USING btree ("household_id","revenue_date");--> statement-breakpoint
CREATE INDEX "business_revenue_business_date_idx" ON "business_revenue" USING btree ("business_id","revenue_date");