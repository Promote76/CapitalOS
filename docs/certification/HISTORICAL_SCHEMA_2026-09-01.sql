-- Capital OS historical schema certification artifact
-- Source commit: a312958528d65e5258b1a4cf3e8772b9104be909
-- Source date: 2026-09-01 07:10:18 UTC
-- Generated with the workspace-pinned drizzle-kit 0.31.10.
-- This is a historical snapshot only; do not apply it to production.
CREATE TYPE "public"."account_type" AS ENUM('protected_capital', 'active_capital', 'cash_reserve', 'duplex_reserve', 'opportunity_reserve', 'strategy_capital', 'property_capital', 'treasury');--> statement-breakpoint
CREATE TYPE "public"."bank_connection_status" AS ENUM('connected', 'healthy', 'needs_reauthentication', 'syncing', 'delayed', 'disconnected', 'manual', 'error');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('upcoming', 'due_soon', 'paid', 'overdue', 'estimated', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."budget_category_type" AS ENUM('fixed_expense', 'variable_essential', 'variable_discretionary', 'savings', 'investment', 'debt_payment', 'transfer', 'income', 'one_time_expense');--> statement-breakpoint
CREATE TYPE "public"."business_tag" AS ENUM('household', 'business', 'mixed', 'reimbursable');--> statement-breakpoint
CREATE TYPE "public"."essential_status" AS ENUM('essential', 'discretionary', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."finance_data_source" AS ENUM('plaid', 'manual', 'csv_import', 'capital_os_ledger', 'user_entered', 'calculated');--> statement-breakpoint
CREATE TYPE "public"."finance_review_status" AS ENUM('approved', 'needs_review', 'uncategorized', 'possible_duplicate', 'possible_transfer', 'possible_business', 'possible_property', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."financial_account_type" AS ENUM('checking', 'savings', 'money_market', 'credit_card', 'loan', 'mortgage', 'brokerage', 'retirement', 'crypto', 'business_checking', 'protected_duplex', 'opportunity_reserve', 'other');--> statement-breakpoint
CREATE TYPE "public"."goal_priority" AS ENUM('critical', 'high', 'normal', 'low');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('draft', 'active', 'on_track', 'behind', 'ahead', 'completed', 'paused');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'partner', 'viewer', 'advisor');--> statement-breakpoint
CREATE TYPE "public"."income_source_type" AS ENUM('employment', 'contract', 'business', 'rental', 'investment', 'interest', 'other');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('future', 'current', 'complete', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('research', 'watchlist', 'qualified', 'tour', 'offer_candidate', 'offer_submitted', 'under_contract', 'acquired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('proposed', 'under_review', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."risk_class" AS ENUM('protected', 'conservative', 'moderate', 'experimental');--> statement-breakpoint
CREATE TYPE "public"."safety_state" AS ENUM('normal', 'review', 'safe_mode', 'stop', 'evacuate', 'locked');--> statement-breakpoint
CREATE TYPE "public"."strategy_stage" AS ENUM('research', 'backtest', 'shadow', 'paper', 'micro_live', 'approved', 'production', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."transaction_category" AS ENUM('contribution', 'transfer', 'strategy_allocation', 'strategy_return', 'strategy_loss', 'property_expense', 'closing_expense', 'income', 'withdrawal', 'adjustment', 'refund');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('draft', 'pending', 'authorized', 'processing', 'completed', 'failed', 'cancelled', 'reversed');--> statement-breakpoint
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
	"display_name" text NOT NULL,
	"email" text NOT NULL,
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
CREATE TABLE "property_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"market_id" uuid,
	"address_label" text NOT NULL,
	"property_type" text DEFAULT 'duplex' NOT NULL,
	"units" numeric(4, 0) DEFAULT '2' NOT NULL,
	"bedrooms" numeric(4, 0) DEFAULT '4' NOT NULL,
	"asking_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_rent" numeric(18, 2) DEFAULT '0' NOT NULL,
	"down_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"closing_costs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"repairs" numeric(18, 2) DEFAULT '0' NOT NULL,
	"financing_estimate" numeric(18, 2) DEFAULT '0' NOT NULL,
	"cash_required" numeric(18, 2) DEFAULT '0' NOT NULL,
	"projected_cash_flow" numeric(18, 2) DEFAULT '0' NOT NULL,
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
CREATE TABLE "strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"strategy_type" text NOT NULL,
	"stage" "strategy_stage" DEFAULT 'research' NOT NULL,
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
CREATE TABLE "ai_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recommendation" text NOT NULL,
	"rationale" text NOT NULL,
	"expected_benefit" text NOT NULL,
	"risk_impact" text NOT NULL,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "property_candidates" ADD CONSTRAINT "property_candidates_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD CONSTRAINT "property_candidates_market_id_target_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."target_markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_goals" ADD CONSTRAINT "property_goals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_milestones" ADD CONSTRAINT "property_milestones_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_property_goal_id_property_goals_id_fk" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_notes" ADD CONSTRAINT "property_notes_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_approvals" ADD CONSTRAINT "strategy_approvals_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_approvals" ADD CONSTRAINT "strategy_approvals_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_performance" ADD CONSTRAINT "strategy_performance_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "strategy_versions" ADD CONSTRAINT "strategy_versions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "target_markets" ADD CONSTRAINT "target_markets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "income_sources" ADD CONSTRAINT "income_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_account_id_household_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."household_financial_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_finance_transactions" ADD CONSTRAINT "recurring_finance_transactions_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upcoming_finance_expenses" ADD CONSTRAINT "upcoming_finance_expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_household_user_unique" ON "household_members" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "household_members_household_idx" ON "household_members" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_accounts_household_idx" ON "capital_accounts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "allocation_rules_household_active_idx" ON "allocation_rules" USING btree ("household_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "contributions_household_idempotency_unique" ON "contributions" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "contributions_household_idx" ON "contributions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "capital_goals_household_idx" ON "capital_goals" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_transaction_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_idx" ON "ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_household_idx" ON "ledger_transactions" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_household_idempotency_unique" ON "ledger_transactions" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "property_candidates_goal_idx" ON "property_candidates" USING btree ("property_goal_id");--> statement-breakpoint
CREATE INDEX "property_milestones_goal_idx" ON "property_milestones" USING btree ("property_goal_id");--> statement-breakpoint
CREATE INDEX "strategies_household_idx" ON "strategies" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "target_markets_household_idx" ON "target_markets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ai_recommendations_household_idx" ON "ai_recommendations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "audit_events_household_idx" ON "audit_events" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "audit_events_timestamp_idx" ON "audit_events" USING btree ("timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_household_key_unique" ON "idempotency_keys" USING btree ("household_id","key");--> statement-breakpoint
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
CREATE INDEX "upcoming_finance_expenses_household_date_idx" ON "upcoming_finance_expenses" USING btree ("household_id","expected_date");