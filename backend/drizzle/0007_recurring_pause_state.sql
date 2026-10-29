CREATE TABLE "recurring_states" (
	"user_address" text NOT NULL,
	"merchant_key" text NOT NULL,
	"status" text NOT NULL,
	"paused_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_states_user_address_merchant_key_pk" PRIMARY KEY("user_address","merchant_key")
);
--> statement-breakpoint
ALTER TABLE "recurring_states" ADD CONSTRAINT "recurring_states_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;