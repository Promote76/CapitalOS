CREATE TABLE "schwab_research_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"result" text NOT NULL,
	"record" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schwab_research_certifications" ADD CONSTRAINT "schwab_research_certifications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_research_certifications" ADD CONSTRAINT "schwab_research_certifications_actor_user_id_capital_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schwab_research_certifications_household_created_idx" ON "schwab_research_certifications" USING btree ("household_id","created_at");