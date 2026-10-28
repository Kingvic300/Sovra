ALTER TABLE "users" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "users_expires_at_idx" ON "users" USING btree ("expires_at");