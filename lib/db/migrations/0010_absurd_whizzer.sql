CREATE TYPE "public"."budget_planning_period_status" AS ENUM('draft', 'approved', 'closed');--> statement-breakpoint
CREATE TABLE "budget_planning_category_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"source_category_id" uuid,
	"name" text NOT NULL,
	"category_type" "budget_category_type" NOT NULL,
	"essential_status" "essential_status" NOT NULL,
	"monthly_target" numeric(18, 2) DEFAULT '0' NOT NULL,
	"warning_threshold" numeric(6, 4) DEFAULT '1.00' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_planning_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"month" date NOT NULL,
	"status" "budget_planning_period_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"copied_from_period_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budget_planning_category_snapshots" ADD CONSTRAINT "budget_planning_category_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_category_snapshots" ADD CONSTRAINT "budget_planning_category_snapshots_period_id_budget_planning_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."budget_planning_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_category_snapshots" ADD CONSTRAINT "budget_planning_category_snapshots_source_category_id_finance_categories_id_fk" FOREIGN KEY ("source_category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_category_snapshots" ADD CONSTRAINT "budget_planning_category_snapshots_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_category_snapshots" ADD CONSTRAINT "budget_planning_category_snapshots_updated_by_capital_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_periods" ADD CONSTRAINT "budget_planning_periods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_periods" ADD CONSTRAINT "budget_planning_periods_copied_from_period_id_budget_planning_periods_id_fk" FOREIGN KEY ("copied_from_period_id") REFERENCES "public"."budget_planning_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_periods" ADD CONSTRAINT "budget_planning_periods_approved_by_capital_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_periods" ADD CONSTRAINT "budget_planning_periods_closed_by_capital_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."capital_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_planning_periods" ADD CONSTRAINT "budget_planning_periods_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_planning_category_snapshots_period_sort_unique" ON "budget_planning_category_snapshots" USING btree ("period_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_planning_category_snapshots_period_source_unique" ON "budget_planning_category_snapshots" USING btree ("period_id","source_category_id");--> statement-breakpoint
CREATE INDEX "budget_planning_category_snapshots_household_period_idx" ON "budget_planning_category_snapshots" USING btree ("household_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_planning_periods_household_month_unique" ON "budget_planning_periods" USING btree ("household_id","month");--> statement-breakpoint
CREATE INDEX "budget_planning_periods_household_status_idx" ON "budget_planning_periods" USING btree ("household_id","status","month");