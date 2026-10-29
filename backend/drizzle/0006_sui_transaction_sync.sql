ALTER TABLE "accounts" ADD COLUMN "sync_pending" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_sui_unique" ON "accounts" USING btree ("user_address") WHERE "accounts"."kind" = 'sui';--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_external_unique" ON "transactions" USING btree ("user_address","external_id");