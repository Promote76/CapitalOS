ALTER TABLE "family_office_proposals" ADD COLUMN "ticker" text;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD COLUMN "dossier_kind" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD COLUMN "advisory_sections" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "family_office_proposals" ADD COLUMN "multi_agent_synthesis" jsonb DEFAULT '{}'::jsonb NOT NULL;