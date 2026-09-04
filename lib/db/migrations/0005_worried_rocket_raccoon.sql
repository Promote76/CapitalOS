ALTER TABLE "capital_reservations" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "capital_reservations" ADD CONSTRAINT "capital_reservations_request_id_capital_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."capital_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capital_reservations_request_idx" ON "capital_reservations" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "capital_reservations" ADD CONSTRAINT "capital_reservations_request_id_unique" UNIQUE("request_id");