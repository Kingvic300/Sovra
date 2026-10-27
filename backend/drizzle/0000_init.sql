CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"balance" numeric(14, 2),
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"user_address" text NOT NULL,
	"category" text NOT NULL,
	"limit" numeric(14, 2) NOT NULL,
	CONSTRAINT "budgets_user_address_category_pk" PRIMARY KEY("user_address","category")
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"user_address" text NOT NULL,
	"merchant_key" text NOT NULL,
	"category" text NOT NULL,
	"memory_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_rules_user_address_merchant_key_pk" PRIMARY KEY("user_address","merchant_key")
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"name" text NOT NULL,
	"target" numeric(14, 2) NOT NULL,
	"saved" numeric(14, 2) DEFAULT '0' NOT NULL,
	"due" date NOT NULL,
	"weekly" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"job_id" text,
	"blob_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"forgotten_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_address" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"goal" jsonb,
	"limit" jsonb,
	"payday" text,
	"sources" jsonb DEFAULT '{"csv":false,"sui":true}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_address" text NOT NULL,
	"account_id" uuid,
	"date" date NOT NULL,
	"merchant" text NOT NULL,
	"merchant_key" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"category" text NOT NULL,
	"learned_from_memory_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "memories_user_idx" ON "memories" USING btree ("user_address");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_address","date");--> statement-breakpoint
CREATE INDEX "transactions_user_merchant_idx" ON "transactions" USING btree ("user_address","merchant_key");