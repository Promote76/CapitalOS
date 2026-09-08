CREATE TABLE "financial_evidence_deletion_tombstones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor" uuid NOT NULL,
	"scope" text NOT NULL,
	"reason" text NOT NULL,
	"confirmation_phrase" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"deleted_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"removed_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"post_reset_verification" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storage_object_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_evidence_deletion_tombstones" ADD CONSTRAINT "financial_evidence_deletion_tombstones_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_evidence_deletion_tombstones" ADD CONSTRAINT "financial_evidence_deletion_tombstones_actor_capital_users_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."capital_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_evidence_deletion_tombstones_household_created_idx" ON "financial_evidence_deletion_tombstones" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_evidence_deletion_tombstones_household_idempotency_unique" ON "financial_evidence_deletion_tombstones" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE TRIGGER financial_evidence_deletion_tombstones_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.financial_evidence_deletion_tombstones
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_audit_mutation();--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON public.financial_evidence_deletion_tombstones FROM PUBLIC;--> statement-breakpoint
COMMENT ON TABLE public.financial_evidence_deletion_tombstones IS 'Immutable metadata-only evidence deletion history; source contents are never retained here.';