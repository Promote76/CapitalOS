ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "vehicle_price" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "vehicle_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "down_payment" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "down_payment" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "loan_amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "loan_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "estimated_apr" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "estimated_apr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "loan_term_months" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "loan_term_months" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "monthly_payment" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "monthly_payment" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "registration_reserve" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "registration_reserve" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "parking_tolls" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "parking_tolls" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "other_monthly_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "other_monthly_cost" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "total_monthly_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "total_monthly_cost" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "new_operating_cost" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "new_operating_cost" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "cash_buffer_impact" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "cash_buffer_impact" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "emergency_reserve_impact" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "emergency_reserve_impact" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "duplex_contribution_impact" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ALTER COLUMN "duplex_contribution_impact" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "new_operating_budget" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "new_floor_surplus" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "capital_surplus_impact" numeric(18, 2);--> statement-breakpoint
ALTER TABLE "household_vehicle_scenarios" ADD COLUMN "missing_inputs" jsonb;