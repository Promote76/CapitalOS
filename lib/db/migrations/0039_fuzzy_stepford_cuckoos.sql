CREATE TABLE "schwab_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"access_token_ciphertext" text,
	"access_token_nonce" text,
	"access_token_auth_tag" text,
	"refresh_token_ciphertext" text,
	"refresh_token_nonce" text,
	"refresh_token_auth_tag" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schwab_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schwab_connections" ADD CONSTRAINT "schwab_connections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_connections" ADD CONSTRAINT "schwab_connections_created_by_user_id_capital_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_oauth_states" ADD CONSTRAINT "schwab_oauth_states_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schwab_oauth_states" ADD CONSTRAINT "schwab_oauth_states_actor_user_id_capital_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."capital_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schwab_connections_household_unique" ON "schwab_connections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "schwab_connections_household_status_idx" ON "schwab_connections" USING btree ("household_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "schwab_oauth_states_hash_unique" ON "schwab_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "schwab_oauth_states_household_actor_idx" ON "schwab_oauth_states" USING btree ("household_id","actor_user_id");--> statement-breakpoint
CREATE INDEX "schwab_oauth_states_expiry_idx" ON "schwab_oauth_states" USING btree ("expires_at");