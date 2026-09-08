ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "payment_source" text DEFAULT 'USER_PROVIDED' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "current_operating_cost" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "new_operating_cost" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "cash_buffer_impact" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "emergency_reserve_impact" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "duplex_contribution_impact" numeric(18, 2) DEFAULT '0' NOT NULL;