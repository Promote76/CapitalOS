ALTER TABLE "family_office_evidence" ADD COLUMN "retrieved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD COLUMN "source_retrieval" jsonb;