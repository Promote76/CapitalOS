CREATE TABLE "household_vehicle_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"vehicle_price" numeric(18, 2) DEFAULT '0' NOT NULL,
	"down_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"loan_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_apr" numeric(8, 4) DEFAULT '0' NOT NULL,
	"loan_term_months" numeric(6, 0) DEFAULT '0' NOT NULL,
	"monthly_payment" numeric(18, 2) DEFAULT '0' NOT NULL,
	"insurance" numeric(18, 2) DEFAULT '0' NOT NULL,
	"fuel" numeric(18, 2) DEFAULT '0' NOT NULL,
	"maintenance_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"registration_reserve" numeric(18, 2) DEFAULT '0' NOT NULL,
	"parking_tolls" numeric(18, 2) DEFAULT '0' NOT NULL,
	"other_monthly_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"total_monthly_cost" numeric(18, 2) DEFAULT '0' NOT NULL,
	"affordability_status" text DEFAULT 'INSUFFICIENT_DATA' NOT NULL,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variable_income_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"calculation_date" date NOT NULL,
	"current_month_verified_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trailing_4_week_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trailing_8_week_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trailing_13_week_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trailing_3_month_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"trailing_6_month_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"highest_recent_month" numeric(18, 2) DEFAULT '0' NOT NULL,
	"lowest_recent_month" numeric(18, 2) DEFAULT '0' NOT NULL,
	"median_recent_month" numeric(18, 2) DEFAULT '0' NOT NULL,
	"income_floor" numeric(18, 2) DEFAULT '0' NOT NULL,
	"base_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"strong_month_income" numeric(18, 2) DEFAULT '0' NOT NULL,
	"income_volatility" numeric(8, 4) DEFAULT '0' NOT NULL,
	"source_count" numeric(10, 0) DEFAULT '0' NOT NULL,
	"source_freshness" date,
	"policy" text DEFAULT 'TRAILING_MEDIAN_DISCOUNTED' NOT NULL,
	"confidence_status" text DEFAULT 'INSUFFICIENT_HISTORY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD CONSTRAINT "household_vehicle_scenarios_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD CONSTRAINT "household_vehicle_scenarios_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variable_income_profiles" ADD CONSTRAINT "variable_income_profiles_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_vehicle_scenarios_household_idx" ON "household_vehicle_scenarios" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "variable_income_profiles_household_date_unique" ON "variable_income_profiles" USING btree ("household_id","calculation_date");--> statement-breakpoint
CREATE INDEX "variable_income_profiles_household_idx" ON "variable_income_profiles" USING btree ("household_id","calculation_date");