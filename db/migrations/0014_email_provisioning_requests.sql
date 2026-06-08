CREATE TYPE "email_provisioning_kind" AS ENUM ('import_existing', 'shared_mailbox', 'team_member');
CREATE TYPE "email_provisioning_status" AS ENUM ('requested', 'provider_pending', 'provider_ready', 'completed', 'failed', 'cancelled');

CREATE TABLE "email_provisioning_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider_connection_id" uuid REFERENCES "email_provider_connections"("id") ON DELETE SET NULL,
  "kind" "email_provisioning_kind" NOT NULL,
  "status" "email_provisioning_status" NOT NULL DEFAULT 'requested',
  "target_email" text NOT NULL,
  "display_name" text NOT NULL,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "target_mailbox_id" uuid REFERENCES "email_mailboxes"("id") ON DELETE SET NULL,
  "requested_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "completed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "desired_access" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "provider_plan" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "provider_result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "provider_error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "next_check_at" timestamptz,
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "email_provisioning_requests_workspace_status_idx"
  ON "email_provisioning_requests" ("workspace_id", "status", "created_at");
CREATE INDEX "email_provisioning_requests_workspace_target_idx"
  ON "email_provisioning_requests" ("workspace_id", "target_email");
