CREATE TABLE "observability_alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"destination_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"correlation_id" text,
	"provider_receipt" text,
	"error_code" text,
	"attempted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observability_alert_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'slack' NOT NULL,
	"target" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observability_alert_destinations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "observability_alert_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"household_id" uuid,
	"correlation_id" text,
	"severity" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"occurrence_count" integer DEFAULT 1 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "observability_alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_key" text NOT NULL,
	"metric" text NOT NULL,
	"severity" text NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"dedupe_window_seconds" integer DEFAULT 300 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observability_alert_rules_rule_key_unique" UNIQUE("rule_key")
);
--> statement-breakpoint
ALTER TABLE "observability_alert_deliveries" ADD CONSTRAINT "observability_alert_deliveries_incident_id_observability_alert_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."observability_alert_incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_deliveries" ADD CONSTRAINT "observability_alert_deliveries_destination_id_observability_alert_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."observability_alert_destinations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_destinations" ADD CONSTRAINT "observability_alert_destinations_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_incidents" ADD CONSTRAINT "observability_alert_incidents_rule_id_observability_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."observability_alert_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_incidents" ADD CONSTRAINT "observability_alert_incidents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_incidents" ADD CONSTRAINT "observability_alert_incidents_resolved_by_capital_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observability_alert_rules" ADD CONSTRAINT "observability_alert_rules_created_by_capital_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "observability_delivery_incident_attempt_unique" ON "observability_alert_deliveries" USING btree ("incident_id","destination_id","attempt");--> statement-breakpoint
CREATE INDEX "observability_incidents_open_rule_idx" ON "observability_alert_incidents" USING btree ("rule_id","status");