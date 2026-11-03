CREATE TABLE "agent_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"monthly_allowance" numeric(14, 2) NOT NULL,
	"max_per_payment" numeric(14, 2),
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guard_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"agent_key_id" uuid,
	"payee" text NOT NULL,
	"payee_address" text,
	"amount" numeric(14, 2) NOT NULL,
	"category" text,
	"memo" text,
	"decision" text NOT NULL,
	"risk" integer NOT NULL,
	"reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guard_policies" (
	"user_address" text PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_keys" ADD CONSTRAINT "agent_keys_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_checks" ADD CONSTRAINT "guard_checks_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_checks" ADD CONSTRAINT "guard_checks_agent_key_id_agent_keys_id_fk" FOREIGN KEY ("agent_key_id") REFERENCES "public"."agent_keys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guard_policies" ADD CONSTRAINT "guard_policies_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_keys_hash_unique" ON "agent_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "agent_keys_user_idx" ON "agent_keys" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "guard_checks_user_created_idx" ON "guard_checks" USING btree ("user_address","created_at");--> statement-breakpoint
CREATE INDEX "guard_checks_key_created_idx" ON "guard_checks" USING btree ("agent_key_id","created_at");