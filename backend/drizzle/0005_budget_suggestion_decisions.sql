CREATE TABLE "budget_suggestion_decisions" (
	"user_address" text NOT NULL,
	"suggestion_id" text NOT NULL,
	"category" text NOT NULL,
	"direction" text NOT NULL,
	"from_limit" numeric(14, 2) NOT NULL,
	"to_limit" numeric(14, 2) NOT NULL,
	"decision" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_suggestion_decisions_user_address_suggestion_id_pk" PRIMARY KEY("user_address","suggestion_id")
);
--> statement-breakpoint
ALTER TABLE "budget_suggestion_decisions" ADD CONSTRAINT "budget_suggestion_decisions_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_suggestion_decisions_category_idx" ON "budget_suggestion_decisions" USING btree ("user_address","category");