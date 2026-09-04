CREATE TABLE "bank_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"household_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bank_webhook_events" ADD CONSTRAINT "bank_webhook_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_webhook_events" ADD CONSTRAINT "bank_webhook_events_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_webhook_events_provider_event_unique" ON "bank_webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "bank_webhook_events_household_idx" ON "bank_webhook_events" USING btree ("household_id","created_at");