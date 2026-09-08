CREATE TABLE "schwab_observation_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"balances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transactions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quotes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"market_clock" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"freshness" text DEFAULT 'UNKNOWN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schwab_observation_snapshots" ADD CONSTRAINT "schwab_observation_snapshots_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_observation_snapshots" ADD CONSTRAINT "schwab_observation_snapshots_connection_id_schwab_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."schwab_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schwab_observation_snapshots_household_created_idx" ON "schwab_observation_snapshots" USING btree ("household_id","created_at");