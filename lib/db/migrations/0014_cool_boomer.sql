CREATE TABLE "tax_lien_certificate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"jurisdiction_policy" text DEFAULT 'FLORIDA_COUNTY_HELD_V1' NOT NULL,
	"county" text NOT NULL,
	"state" text DEFAULT 'FL' NOT NULL,
	"certificate_number" text NOT NULL,
	"parcel_number" text NOT NULL,
	"tax_year" text NOT NULL,
	"face_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"current_purchase_amount" numeric(18, 2) DEFAULT '0' NOT NULL,
	"stated_rate" numeric(7, 4),
	"status" text DEFAULT 'historical_research' NOT NULL,
	"owner" text,
	"property_address" text,
	"legal_description" text,
	"property_use" text,
	"acreage" numeric(12, 4),
	"assessed_value" numeric(18, 2),
	"just_value" numeric(18, 2),
	"conservative_value" numeric(18, 2),
	"cert_to_value" numeric(8, 4),
	"total_lien_exposure" numeric(18, 2),
	"total_exposure_to_value" numeric(8, 4),
	"homestead_status" text DEFAULT 'unknown' NOT NULL,
	"prior_certificates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_certificates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redeemed_certificates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tax_deed_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access" text DEFAULT 'unknown' NOT NULL,
	"buildability" text DEFAULT 'unknown' NOT NULL,
	"flood" text DEFAULT 'unknown' NOT NULL,
	"wetland" text DEFAULT 'unknown' NOT NULL,
	"code_status" text DEFAULT 'unknown' NOT NULL,
	"title_risk" text DEFAULT 'unknown' NOT NULL,
	"redemption_assessment" text DEFAULT 'unknown' NOT NULL,
	"risk_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_availability" text DEFAULT 'unverified' NOT NULL,
	"parcel_reconciliation" text DEFAULT 'unresolved' NOT NULL,
	"certificate_reconciliation" text DEFAULT 'unresolved' NOT NULL,
	"source_records" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data_freshness" text DEFAULT 'unknown' NOT NULL,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"decision" text DEFAULT 'REVIEW_REQUIRED' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "county" text;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "zoning" text;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "flood_zone" text;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "condition" text;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "utilities" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "maintenance" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "owner_occupancy_eligible" boolean;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "source_kind" text;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "source_priority" numeric(3, 0);--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "data_freshness" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "live_availability" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "parcel_reconciliation" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "property_candidates" ADD COLUMN "source_records" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_lien_certificate_candidates" ADD CONSTRAINT "tax_lien_certificate_candidates_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tax_lien_certificate_candidates_household_idx" ON "tax_lien_certificate_candidates" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "tax_lien_certificate_candidates_county_idx" ON "tax_lien_certificate_candidates" USING btree ("county");--> statement-breakpoint
CREATE INDEX "tax_lien_certificate_candidates_parcel_idx" ON "tax_lien_certificate_candidates" USING btree ("parcel_number");--> statement-breakpoint
CREATE INDEX "tax_lien_certificate_candidates_certificate_idx" ON "tax_lien_certificate_candidates" USING btree ("certificate_number");