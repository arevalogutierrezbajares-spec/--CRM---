-- Treasury module: accounts, transactions, vendors, categories, subscriptions, FX rates.

DO $$ BEGIN
  CREATE TYPE "account_type" AS ENUM ('checking','savings','credit_card','cash','crypto','brokerage','loan','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "txn_source" AS ENUM ('manual','csv_import','email_parse','sync','api');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "category_kind" AS ENUM ('expense','income','transfer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "subscription_cycle" AS ENUM ('monthly','yearly','weekly','usage','one_off');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM ('active','paused','cancelled','trialing');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "fin_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "parent_id" uuid,
  "color" text,
  "kind" "category_kind" NOT NULL DEFAULT 'expense',
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "fin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "type" "account_type" NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "balance_cents" integer NOT NULL DEFAULT 0,
  "opening_balance_cents" integer NOT NULL DEFAULT 0,
  "color" text,
  "notes" text,
  "archived" boolean NOT NULL DEFAULT false,
  "provider" text NOT NULL DEFAULT 'manual',
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "fin_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "default_category_id" uuid REFERENCES "fin_categories"("id") ON DELETE SET NULL,
  "website" text,
  "logo_url" text,
  "notes" text,
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "fin_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "fin_accounts"("id") ON DELETE CASCADE,
  "posted_date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "usd_amount_cents" integer,
  "description" text NOT NULL,
  "vendor_id" uuid REFERENCES "fin_vendors"("id") ON DELETE SET NULL,
  "category_id" uuid REFERENCES "fin_categories"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
  "notes" text,
  "source" "txn_source" NOT NULL DEFAULT 'manual',
  "external_ref_id" text,
  "transfer_group_id" uuid,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fin_transactions_posted_date_idx"
  ON "fin_transactions" ("workspace_id", "posted_date" DESC);
CREATE INDEX IF NOT EXISTS "fin_transactions_account_idx"
  ON "fin_transactions" ("account_id", "posted_date" DESC);

CREATE TABLE IF NOT EXISTS "fin_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "fin_vendors"("id") ON DELETE CASCADE,
  "plan_name" text,
  "price_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "cycle" "subscription_cycle" NOT NULL DEFAULT 'monthly',
  "next_renewal_date" date,
  "started_on" date,
  "cancelled_on" date,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "status" "subscription_status" NOT NULL DEFAULT 'active',
  "last_used_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "fin_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "period_month" date NOT NULL,
  "category_id" uuid NOT NULL REFERENCES "fin_categories"("id") ON DELETE CASCADE,
  "planned_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD',
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "fin_fx_rates" (
  "currency" text NOT NULL,
  "rate_date" date NOT NULL,
  "rate_usd_per_million" integer NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("currency", "rate_date")
);

CREATE TABLE IF NOT EXISTS "fin_usage_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL REFERENCES "fin_vendors"("id") ON DELETE CASCADE,
  "snapshot_date" date NOT NULL,
  "metric_name" text NOT NULL,
  "quantity" integer NOT NULL,
  "cost_cents" integer,
  "currency" text DEFAULT 'USD'
);

-- Seed default categories per workspace on first treasury page visit (done in code).
