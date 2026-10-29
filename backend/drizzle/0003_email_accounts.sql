ALTER TABLE "users" ADD COLUMN "password_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_account_idx" ON "users" USING btree ("email") WHERE "users"."method" = 'email';