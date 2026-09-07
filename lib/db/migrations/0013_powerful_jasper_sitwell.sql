CREATE TABLE "tax_lien_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"jurisdiction" text DEFAULT 'Florida' NOT NULL,
	"county" text NOT NULL,
	"parcel_id" text NOT NULL,
	"certificate_number" text NOT NULL,
	"property_address" text NOT NULL,
	"source_kind" text DEFAULT 'user_supplied' NOT NULL,
	"source_url" text,
	"source_retrieved_at" timestamp with time zone,
	"source_freshness" text DEFAULT 'unknown' NOT NULL,
	"official_parcel_id" text,
	"official_certificate_number" text,
	"redemption_status" text DEFAULT 'unknown' NOT NULL,
	"redemption_deadline" text,
	"live_availability" text DEFAULT 'unknown' NOT NULL,
	"availability_checked_at" timestamp with time zone,
	"face_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_total_exposure" numeric(18, 2) DEFAULT '0' NOT NULL,
	"estimated_property_value" numeric(18, 2) DEFAULT '0' NOT NULL,
	"household_safe_to_deploy" numeric(18, 2) DEFAULT '0' NOT NULL,
	"required_reserve_floor" numeric(18, 2) DEFAULT '0' NOT NULL,
	"reconciliation_status" text DEFAULT 'unresolved' NOT NULL,
	"reserve_status" text DEFAULT 'unknown' NOT NULL,
	"review_status" text DEFAULT 'research' NOT NULL,
	"hard_stops" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tax_lien_candidates" ADD CONSTRAINT "tax_lien_candidates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_lien_candidates_household_idx" ON "tax_lien_candidates" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "tax_lien_candidates_county_idx" ON "tax_lien_candidates" USING btree ("county");--> statement-breakpoint
CREATE INDEX "tax_lien_candidates_status_idx" ON "tax_lien_candidates" USING btree ("review_status");