-- Capital OS external production schema synchronization\n-- Generated from the current development Drizzle schema.\n-- Review with the external PostgreSQL administrator before applying.\n-- Statements: 180\n-- Structural data loss detected: no\nALTER TYPE "public"."property_status" ADD VALUE 'discovered' BEFORE 'research';\n\nALTER TYPE "public"."property_status" ADD VALUE 'researching' BEFORE 'watchlist';\n\nALTER TYPE "public"."property_status" ADD VALUE 'high_priority' BEFORE 'tour';\n\nALTER TYPE "public"."property_status" ADD VALUE 'tour_candidate' BEFORE 'offer_candidate';\n\nALTER TYPE "public"."property_status" ADD VALUE 'financing_review' BEFORE 'offer_candidate';\n\nALTER TYPE "public"."property_status" ADD VALUE 'negotiating' BEFORE 'under_contract';\n\nALTER TYPE "public"."property_status" ADD VALUE 'inspection' BEFORE 'acquired';\n\nALTER TYPE "public"."property_status" ADD VALUE 'appraisal' BEFORE 'acquired';\n\nALTER TYPE "public"."property_status" ADD VALUE 'financing' BEFORE 'acquired';\n\nALTER TYPE "public"."property_status" ADD VALUE 'closing' BEFORE 'acquired';\n\nALTER TYPE "public"."property_status" ADD VALUE 'archived';\n\nCREATE TABLE "ai_analyses" (
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
\n\nCREATE TABLE "financing_scenarios" (
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
\n\nCREATE TABLE "preapproval_records" (
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
\n\nCREATE TABLE "cash_to_close_estimates" (
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
\n\nCREATE TABLE "buy_boxes" (
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
\n\nCREATE TABLE "recommendation_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"feedback" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "ai_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "property_readiness_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"property_goal_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"status" text NOT NULL,
	"factors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "research_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"strategy_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "property_stress_tests" (
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
\n\nCREATE TABLE "strategy_experiments" (
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
\n\nCREATE TABLE "reconciliation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid,
	"status" text DEFAULT 'CLEAN' NOT NULL,
	"mismatches" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"internal_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"venue_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_intent_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"external_event_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "trading_incidents" (
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
\n\nCREATE TABLE "venue_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_intent_id" uuid NOT NULL,
	"external_order_id" text,
	"venue_status" text,
	"raw_response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
\n\nCREATE TABLE "micro_live_sessions" (
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
\n\nCREATE TABLE "micro_live_policies" (
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
\n\nCREATE TABLE "execution_fills" (
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
\n\nCREATE TABLE "guardian_heartbeats" (
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
\n\nCREATE TABLE "order_intents" (
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
\n\nCREATE TABLE "venue_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"adapter_type" text DEFAULT 'simulated' NOT NULL,
	"status" text DEFAULT 'Research' NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"jurisdiction_confirmed" boolean DEFAULT false NOT NULL,
	"credentials_reference" text,
	"withdrawal_disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"integration_approved" boolean DEFAULT false NOT NULL,
	"terms_reviewed" boolean DEFAULT false NOT NULL,
	"market_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"withdrawal_reviewed" boolean DEFAULT false NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"security_review" jsonb,
	"jurisdiction_review" jsonb
);
\n\nCREATE TABLE "fill_snapshots" (
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
\n\nCREATE TABLE "post_incident_reviews" (
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
\n\nCREATE TABLE "position_snapshots" (
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
\n\nCREATE TABLE "reactivation_requirements" (
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
\n\nALTER TABLE "ai_recommendations" ADD COLUMN "analyst" text DEFAULT 'AI CIO' NOT NULL;\n\nALTER TABLE "ai_recommendations" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;\n\nALTER TABLE "ai_recommendations" ADD COLUMN "potential_downside" text DEFAULT 'No material downside identified.' NOT NULL;\n\nALTER TABLE "ai_recommendations" ADD COLUMN "data_quality" text DEFAULT 'medium' NOT NULL;\n\nALTER TABLE "ai_recommendations" ADD COLUMN "suggested_next_action" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "city" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "state" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "zip" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "market" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "bathrooms" numeric(4, 1) DEFAULT '2' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "estimated_market_value" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "annual_property_taxes" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "insurance" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "hoa" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "current_rents" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "vacancy_assumption" numeric(6, 4) DEFAULT '0.05' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "immediate_repairs" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "deferred_maintenance" numeric(18, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "square_footage" numeric(12, 0);\n\nALTER TABLE "property_candidates" ADD COLUMN "lot_size" numeric(12, 2);\n\nALTER TABLE "property_candidates" ADD COLUMN "year_built" numeric(5, 0);\n\nALTER TABLE "property_candidates" ADD COLUMN "listing_source" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "listing_url" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "date_discovered" date;\n\nALTER TABLE "property_candidates" ADD COLUMN "last_reviewed" date;\n\nALTER TABLE "property_candidates" ADD COLUMN "readiness_score" numeric(5, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "buy_box_score" numeric(5, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "deal_quality_score" numeric(5, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "data_confidence" numeric(5, 2) DEFAULT '0' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "readiness_status" text DEFAULT 'needs_data' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "risk_level" text DEFAULT 'moderate' NOT NULL;\n\nALTER TABLE "property_candidates" ADD COLUMN "notes" text;\n\nALTER TABLE "property_candidates" ADD COLUMN "next_action" text;\n\nALTER TABLE "strategies" ADD COLUMN "description" text;\n\nALTER TABLE "strategies" ADD COLUMN "owner" text;\n\nALTER TABLE "strategies" ADD COLUMN "hypothesis" text;\n\nALTER TABLE "strategies" ADD COLUMN "markets" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "venues" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "assets" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "time_horizon" text;\n\nALTER TABLE "strategies" ADD COLUMN "entry_logic" text;\n\nALTER TABLE "strategies" ADD COLUMN "exit_logic" text;\n\nALTER TABLE "strategies" ADD COLUMN "position_sizing_logic" text;\n\nALTER TABLE "strategies" ADD COLUMN "risk_logic" text;\n\nALTER TABLE "strategies" ADD COLUMN "execution_model" text;\n\nALTER TABLE "strategies" ADD COLUMN "required_data" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "assumptions" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "strategies" ADD COLUMN "known_risks" jsonb DEFAULT '[]'::jsonb NOT NULL;\n\nALTER TABLE "finance_bills" ADD COLUMN "active" boolean DEFAULT true NOT NULL;\n\nALTER TABLE "upcoming_finance_expenses" ADD COLUMN "active" boolean DEFAULT true NOT NULL;\n\nALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "financing_scenarios" ADD CONSTRAINT "financing_scenarios_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "financing_scenarios" ADD CONSTRAINT "financing_scenarios_property_candidate_id_property_candidates_i" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "preapproval_records" ADD CONSTRAINT "preapproval_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "cash_to_close_estimates" ADD CONSTRAINT "cash_to_close_estimates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "cash_to_close_estimates" ADD CONSTRAINT "cash_to_close_estimates_property_candidate_id_property_candidat" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "buy_boxes" ADD CONSTRAINT "buy_boxes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;\n\nALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_recommendation_id_ai_recommendations_id" FOREIGN KEY ("recommendation_id") REFERENCES "public"."ai_recommendations"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "property_readiness_snapshots" ADD CONSTRAINT "property_readiness_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "property_readiness_snapshots" ADD CONSTRAINT "property_readiness_snapshots_property_goal_id_property_goals_id" FOREIGN KEY ("property_goal_id") REFERENCES "public"."property_goals"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "research_journal_entries" ADD CONSTRAINT "research_journal_entries_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;\n\nALTER TABLE "property_stress_tests" ADD CONSTRAINT "property_stress_tests_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "property_stress_tests" ADD CONSTRAINT "property_stress_tests_property_candidate_id_property_candidates" FOREIGN KEY ("property_candidate_id") REFERENCES "public"."property_candidates"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "strategy_experiments" ADD CONSTRAINT "strategy_experiments_strategy_version_id_strategy_versions_id_f" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE restrict ON UPDATE no action;\n\nALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "reconciliation_runs" ADD CONSTRAINT "reconciliation_runs_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "trading_incidents" ADD CONSTRAINT "trading_incidents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "trading_incidents" ADD CONSTRAINT "trading_incidents_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "venue_orders" ADD CONSTRAINT "venue_orders_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "micro_live_sessions" ADD CONSTRAINT "micro_live_sessions_armed_by_capital_users_id_fk" FOREIGN KEY ("armed_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;\n\nALTER TABLE "micro_live_policies" ADD CONSTRAINT "micro_live_policies_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_order_intent_id_order_intents_id_fk" FOREIGN KEY ("order_intent_id") REFERENCES "public"."order_intents"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "execution_fills" ADD CONSTRAINT "execution_fills_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "guardian_heartbeats" ADD CONSTRAINT "guardian_heartbeats_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_strategy_version_id_strategy_versions_id_fk" FOREIGN KEY ("strategy_version_id") REFERENCES "public"."strategy_versions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "venue_registry" ADD CONSTRAINT "venue_registry_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "venue_registry" ADD CONSTRAINT "venue_registry_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "fill_snapshots" ADD CONSTRAINT "fill_snapshots_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_incident_id_trading_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."trading_incidents"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "post_incident_reviews" ADD CONSTRAINT "post_incident_reviews_reviewed_by_capital_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;\n\nALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_session_id_micro_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."micro_live_sessions"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "position_snapshots" ADD CONSTRAINT "position_snapshots_venue_id_venue_registry_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue_registry"("id") ON DELETE set null ON UPDATE no action;\n\nALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_incident_id_trading_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."trading_incidents"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_review_id_post_incident_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."post_incident_reviews"("id") ON DELETE cascade ON UPDATE no action;\n\nALTER TABLE "reactivation_requirements" ADD CONSTRAINT "reactivation_requirements_completed_by_capital_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;\n\nCREATE INDEX "ai_analyses_household_idx" ON "ai_analyses" USING btree ("household_id");\n\nCREATE INDEX "financing_scenarios_household_idx" ON "financing_scenarios" USING btree ("household_id");\n\nCREATE INDEX "financing_scenarios_property_idx" ON "financing_scenarios" USING btree ("property_candidate_id");\n\nCREATE INDEX "preapproval_records_household_idx" ON "preapproval_records" USING btree ("household_id");\n\nCREATE INDEX "recommendation_feedback_household_idx" ON "recommendation_feedback" USING btree ("household_id");\n\nCREATE INDEX "recommendation_feedback_recommendation_idx" ON "recommendation_feedback" USING btree ("recommendation_id");\n\nCREATE INDEX "ai_insights_household_idx" ON "ai_insights" USING btree ("household_id");\n\nCREATE INDEX "property_readiness_snapshots_goal_idx" ON "property_readiness_snapshots" USING btree ("property_goal_id");\n\nCREATE INDEX "research_journal_entries_household_idx" ON "research_journal_entries" USING btree ("household_id");\n\nCREATE INDEX "research_journal_entries_strategy_idx" ON "research_journal_entries" USING btree ("strategy_id");\n\nCREATE INDEX "property_stress_tests_property_idx" ON "property_stress_tests" USING btree ("property_candidate_id");\n\nCREATE INDEX "strategy_experiments_created_at_idx" ON "strategy_experiments" USING btree ("created_at");\n\nCREATE INDEX "strategy_experiments_household_idx" ON "strategy_experiments" USING btree ("household_id");\n\nCREATE INDEX "strategy_experiments_strategy_idx" ON "strategy_experiments" USING btree ("strategy_id");\n\nCREATE INDEX "reconciliation_runs_household_idx" ON "reconciliation_runs" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "order_events_external_event_idx" ON "order_events" USING btree ("external_event_id");\n\nCREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_intent_id");\n\nCREATE INDEX "trading_incidents_household_idx" ON "trading_incidents" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "venue_orders_intent_idx" ON "venue_orders" USING btree ("order_intent_id");\n\nCREATE INDEX "micro_live_sessions_household_idx" ON "micro_live_sessions" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "micro_live_policies_household_idx" ON "micro_live_policies" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "execution_fills_external_fill_idx" ON "execution_fills" USING btree ("external_fill_id");\n\nCREATE INDEX "execution_fills_household_idx" ON "execution_fills" USING btree ("household_id");\n\nCREATE INDEX "guardian_heartbeats_household_idx" ON "guardian_heartbeats" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "order_intents_client_order_id_idx" ON "order_intents" USING btree ("client_order_id");\n\nCREATE INDEX "order_intents_household_idx" ON "order_intents" USING btree ("household_id");\n\nCREATE INDEX "venue_registry_household_idx" ON "venue_registry" USING btree ("household_id");\n\nCREATE INDEX "fill_snapshots_captured_idx" ON "fill_snapshots" USING btree ("household_id","captured_at");\n\nCREATE UNIQUE INDEX "fill_snapshots_external_source_idx" ON "fill_snapshots" USING btree ("external_fill_id","source");\n\nCREATE INDEX "fill_snapshots_household_idx" ON "fill_snapshots" USING btree ("household_id");\n\nCREATE INDEX "post_incident_reviews_household_idx" ON "post_incident_reviews" USING btree ("household_id");\n\nCREATE UNIQUE INDEX "post_incident_reviews_incident_idx" ON "post_incident_reviews" USING btree ("incident_id");\n\nCREATE INDEX "position_snapshots_captured_idx" ON "position_snapshots" USING btree ("household_id","captured_at");\n\nCREATE INDEX "position_snapshots_household_idx" ON "position_snapshots" USING btree ("household_id");\n\nCREATE INDEX "reactivation_requirements_household_idx" ON "reactivation_requirements" USING btree ("household_id");\n\nCREATE INDEX "reactivation_requirements_incident_idx" ON "reactivation_requirements" USING btree ("incident_id");\n