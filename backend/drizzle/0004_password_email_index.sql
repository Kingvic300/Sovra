DROP INDEX "users_email_account_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "users_password_email_idx" ON "users" USING btree ("email") WHERE "users"."password_hash" is not null;