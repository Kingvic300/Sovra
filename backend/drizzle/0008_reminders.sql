CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"due_date" date NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tone" text NOT NULL,
	"link" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_kind_ref_due_unique" ON "reminders" USING btree ("user_address","kind","ref","due_date");