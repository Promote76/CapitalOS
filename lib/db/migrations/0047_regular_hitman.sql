DROP INDEX "family_office_runs_id_household_unique";--> statement-breakpoint
ALTER TABLE "family_office_runs" ADD CONSTRAINT "family_office_runs_id_household_unique" UNIQUE("id","household_id");