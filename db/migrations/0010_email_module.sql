CREATE TYPE "email_provider_kind" AS ENUM ('sandbox', 'microsoft_365', 'zoho_mail');
CREATE TYPE "email_connection_status" AS ENUM ('connected', 'degraded', 'disconnected');
CREATE TYPE "email_mailbox_type" AS ENUM ('personal', 'shared', 'system');
CREATE TYPE "email_mailbox_status" AS ENUM ('active', 'paused', 'error', 'deactivated');
CREATE TYPE "email_thread_status" AS ENUM ('open', 'waiting', 'done', 'snoozed');
CREATE TYPE "email_message_direction" AS ENUM ('inbound', 'outbound');
CREATE TYPE "email_draft_status" AS ENUM ('draft', 'queued', 'sent', 'discarded');
CREATE TYPE "email_send_job_status" AS ENUM ('pending', 'sending', 'sent', 'failed');
CREATE TYPE "email_crm_link_type" AS ENUM ('contact', 'project', 'initiative', 'action_item', 'milestone');

CREATE TABLE "email_provider_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider" "email_provider_kind" NOT NULL DEFAULT 'sandbox',
  "domain" text NOT NULL,
  "status" "email_connection_status" NOT NULL DEFAULT 'connected',
  "tenant_id" text,
  "provider_tenant_name" text,
  "encrypted_access_token" text,
  "encrypted_refresh_token" text,
  "webhook_client_state_hash" text,
  "health_status" text NOT NULL DEFAULT 'healthy',
  "health_detail" text,
  "last_health_at" timestamptz,
  "connected_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "connected_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_mailboxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider_connection_id" uuid NOT NULL REFERENCES "email_provider_connections"("id") ON DELETE CASCADE,
  "address" text NOT NULL,
  "display_name" text NOT NULL,
  "type" "email_mailbox_type" NOT NULL DEFAULT 'personal',
  "status" "email_mailbox_status" NOT NULL DEFAULT 'active',
  "provider_mailbox_id" text NOT NULL,
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "sync_enabled" boolean NOT NULL DEFAULT true,
  "send_enabled" boolean NOT NULL DEFAULT true,
  "ai_enabled" boolean NOT NULL DEFAULT false,
  "signature" text,
  "provider_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "unread_count" integer NOT NULL DEFAULT 0,
  "thread_count" integer NOT NULL DEFAULT 0,
  "last_synced_at" timestamptz,
  "last_sync_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_mailbox_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "mailbox_id" uuid NOT NULL REFERENCES "email_mailboxes"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "can_view" boolean NOT NULL DEFAULT true,
  "can_reply" boolean NOT NULL DEFAULT false,
  "can_send_as" boolean NOT NULL DEFAULT false,
  "can_assign" boolean NOT NULL DEFAULT false,
  "can_manage_access" boolean NOT NULL DEFAULT false,
  "can_manage_settings" boolean NOT NULL DEFAULT false,
  "granted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz
);

CREATE TABLE "email_threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "mailbox_id" uuid NOT NULL REFERENCES "email_mailboxes"("id") ON DELETE CASCADE,
  "provider_thread_id" text NOT NULL,
  "subject" text NOT NULL,
  "status" "email_thread_status" NOT NULL DEFAULT 'open',
  "assigned_to_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "last_message_at" timestamptz NOT NULL DEFAULT now(),
  "last_message_preview" text,
  "is_unread" boolean NOT NULL DEFAULT true,
  "has_attachments" boolean NOT NULL DEFAULT false,
  "snoozed_until" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "email_threads"("id") ON DELETE CASCADE,
  "mailbox_id" uuid NOT NULL REFERENCES "email_mailboxes"("id") ON DELETE CASCADE,
  "provider_message_id" text NOT NULL,
  "internet_message_id" text,
  "direction" "email_message_direction" NOT NULL,
  "from_address" text NOT NULL,
  "from_name" text,
  "to_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cc_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bcc_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "subject" text NOT NULL,
  "body_text" text NOT NULL,
  "body_html" text,
  "sent_at" timestamptz,
  "received_at" timestamptz,
  "is_read" boolean NOT NULL DEFAULT false,
  "provider_folder" text NOT NULL DEFAULT 'inbox',
  "in_reply_to" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "email_messages"("id") ON DELETE CASCADE,
  "provider_attachment_id" text NOT NULL,
  "filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL DEFAULT 0,
  "storage_path" text,
  "is_inline" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" uuid REFERENCES "email_threads"("id") ON DELETE CASCADE,
  "mailbox_id" uuid NOT NULL REFERENCES "email_mailboxes"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "email_draft_status" NOT NULL DEFAULT 'draft',
  "to_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cc_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bcc_recipients" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "subject" text NOT NULL,
  "body_text" text NOT NULL,
  "attachment_metadata" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ai_generated" boolean NOT NULL DEFAULT false,
  "ai_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "client_mutation_id" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_send_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "draft_id" uuid REFERENCES "email_drafts"("id") ON DELETE SET NULL,
  "mailbox_id" uuid NOT NULL REFERENCES "email_mailboxes"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "users"("id"),
  "idempotency_key" text NOT NULL,
  "status" "email_send_job_status" NOT NULL DEFAULT 'pending',
  "provider_message_id" text,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_internal_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "email_threads"("id") ON DELETE CASCADE,
  "author_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "body" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_thread_crm_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "thread_id" uuid NOT NULL REFERENCES "email_threads"("id") ON DELETE CASCADE,
  "link_type" "email_crm_link_type" NOT NULL,
  "ref_id" uuid NOT NULL,
  "label" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "email_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "mailbox_id" uuid REFERENCES "email_mailboxes"("id") ON DELETE SET NULL,
  "thread_id" uuid REFERENCES "email_threads"("id") ON DELETE SET NULL,
  "message_id" uuid REFERENCES "email_messages"("id") ON DELETE SET NULL,
  "action" text NOT NULL,
  "reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "email_provider_connections_workspace_provider_domain_uniq"
  ON "email_provider_connections" ("workspace_id", "provider", "domain");
CREATE UNIQUE INDEX "email_mailboxes_workspace_address_uniq"
  ON "email_mailboxes" ("workspace_id", "address");
CREATE UNIQUE INDEX "email_mailboxes_workspace_provider_mailbox_uniq"
  ON "email_mailboxes" ("workspace_id", "provider_mailbox_id");
CREATE UNIQUE INDEX "email_mailbox_access_mailbox_user_uniq"
  ON "email_mailbox_access" ("mailbox_id", "user_id");
CREATE UNIQUE INDEX "email_threads_mailbox_provider_thread_uniq"
  ON "email_threads" ("mailbox_id", "provider_thread_id");
CREATE UNIQUE INDEX "email_messages_mailbox_provider_message_uniq"
  ON "email_messages" ("mailbox_id", "provider_message_id");
CREATE UNIQUE INDEX "email_attachments_message_provider_attachment_uniq"
  ON "email_attachments" ("message_id", "provider_attachment_id");
CREATE UNIQUE INDEX "email_send_jobs_idempotency_key_uniq"
  ON "email_send_jobs" ("idempotency_key");
CREATE UNIQUE INDEX "email_thread_crm_links_thread_ref_uniq"
  ON "email_thread_crm_links" ("thread_id", "link_type", "ref_id");

CREATE INDEX "email_threads_workspace_last_message_idx"
  ON "email_threads" ("workspace_id", "last_message_at" DESC);
CREATE INDEX "email_threads_workspace_assignee_idx"
  ON "email_threads" ("workspace_id", "assigned_to_id");
CREATE INDEX "email_messages_workspace_thread_idx"
  ON "email_messages" ("workspace_id", "thread_id", "created_at");
CREATE INDEX "email_audit_events_workspace_created_idx"
  ON "email_audit_events" ("workspace_id", "created_at" DESC);
