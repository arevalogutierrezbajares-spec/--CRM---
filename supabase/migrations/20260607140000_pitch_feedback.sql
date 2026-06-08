CREATE TYPE "pitch_feedback_audience" AS ENUM (
  'friends_family',
  'advisor',
  'partner',
  'customer',
  'investor',
  'internal'
);
CREATE TYPE "pitch_feedback_campaign_status" AS ENUM (
  'draft',
  'active',
  'closed',
  'archived'
);
CREATE TYPE "pitch_feedback_invite_status" AS ENUM (
  'draft',
  'link_generated',
  'sent',
  'opened',
  'in_progress',
  'completed',
  'expired',
  'revoked'
);
CREATE TYPE "pitch_feedback_channel" AS ENUM (
  'email',
  'whatsapp',
  'signal',
  'link',
  'manual'
);
CREATE TYPE "pitch_feedback_event_type" AS ENUM (
  'invite_created',
  'link_generated',
  'invite_sent',
  'invite_copied',
  'link_opened',
  'session_started',
  'section_entered',
  'section_completed',
  'reaction_submitted',
  'question_answered',
  'final_feedback_submitted',
  'invite_completed',
  'ai_summary_generated',
  'followup_draft_created',
  'followup_task_created',
  'followup_sent',
  'invite_expired',
  'invite_revoked',
  'feedback_redacted'
);
CREATE TYPE "pitch_feedback_response_type" AS ENUM (
  'reaction',
  'score',
  'text',
  'intro',
  'objection',
  'final'
);
CREATE TYPE "pitch_feedback_insight_scope" AS ENUM (
  'invite',
  'contact',
  'campaign'
);
CREATE TYPE "pitch_feedback_sentiment" AS ENUM (
  'positive',
  'neutral',
  'mixed',
  'negative'
);
CREATE TYPE "pitch_feedback_support_level" AS ENUM (
  'champion',
  'supportive',
  'curious',
  'skeptical',
  'disengaged'
);
CREATE TYPE "pitch_feedback_delivery_status" AS ENUM (
  'pending',
  'sent',
  'failed',
  'copied',
  'manual'
);

CREATE TABLE "pitch_feedback_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "description" text,
  "audience" "pitch_feedback_audience" NOT NULL DEFAULT 'friends_family',
  "status" "pitch_feedback_campaign_status" NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "sections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pitch_feedback_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "pitch_feedback_campaigns"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "token_hash" text,
  "status" "pitch_feedback_invite_status" NOT NULL DEFAULT 'draft',
  "channel" "pitch_feedback_channel" NOT NULL DEFAULT 'manual',
  "personalization" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "campaign_version" integer NOT NULL DEFAULT 1,
  "sections_snapshot" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sent_message" text,
  "sent_at" timestamptz,
  "first_opened_at" timestamptz,
  "last_viewed_at" timestamptz,
  "completed_at" timestamptz,
  "expires_at" timestamptz,
  "revoked_at" timestamptz,
  "completion_percent" integer NOT NULL DEFAULT 0,
  "current_section_key" text,
  "view_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pitch_feedback_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "invite_id" uuid NOT NULL REFERENCES "pitch_feedback_invites"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "user_agent_hash" text,
  "ip_hash" text,
  "referrer" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE "pitch_feedback_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "invite_id" uuid NOT NULL REFERENCES "pitch_feedback_invites"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "pitch_feedback_sessions"("id") ON DELETE SET NULL,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" "pitch_feedback_event_type" NOT NULL,
  "section_key" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pitch_feedback_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "invite_id" uuid NOT NULL REFERENCES "pitch_feedback_invites"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "pitch_feedback_sessions"("id") ON DELETE SET NULL,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "section_key" text NOT NULL,
  "prompt_key" text NOT NULL,
  "response_type" "pitch_feedback_response_type" NOT NULL,
  "value" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "redacted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pitch_feedback_ai_insights" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "pitch_feedback_campaigns"("id") ON DELETE CASCADE,
  "invite_id" uuid REFERENCES "pitch_feedback_invites"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
  "scope" "pitch_feedback_insight_scope" NOT NULL DEFAULT 'invite',
  "model" text NOT NULL DEFAULT 'heuristic',
  "summary" text NOT NULL,
  "sentiment" "pitch_feedback_sentiment" NOT NULL DEFAULT 'neutral',
  "confidence_score" integer NOT NULL DEFAULT 50,
  "support_level" "pitch_feedback_support_level" NOT NULL DEFAULT 'curious',
  "objections" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confusion_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "positive_signals" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recommended_followup" text,
  "suggested_pitch_edits" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "source_response_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "pitch_feedback_delivery_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "invite_id" uuid NOT NULL REFERENCES "pitch_feedback_invites"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
  "channel" "pitch_feedback_channel" NOT NULL DEFAULT 'manual',
  "status" "pitch_feedback_delivery_status" NOT NULL DEFAULT 'pending',
  "message_snapshot" text NOT NULL DEFAULT '',
  "provider_result" jsonb,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "pitch_feedback_invites_token_hash_uniq"
  ON "pitch_feedback_invites" ("token_hash");
CREATE UNIQUE INDEX "pitch_feedback_responses_invite_section_prompt_uniq"
  ON "pitch_feedback_responses" ("invite_id", "section_key", "prompt_key");
CREATE UNIQUE INDEX "pitch_feedback_delivery_invite_channel_msg_uniq"
  ON "pitch_feedback_delivery_attempts" ("invite_id", "channel", "message_snapshot");

CREATE INDEX "pitch_feedback_campaigns_workspace_status_idx"
  ON "pitch_feedback_campaigns" ("workspace_id", "status", "updated_at" DESC);
CREATE INDEX "pitch_feedback_invites_workspace_contact_idx"
  ON "pitch_feedback_invites" ("workspace_id", "contact_id", "updated_at" DESC);
CREATE INDEX "pitch_feedback_invites_workspace_campaign_idx"
  ON "pitch_feedback_invites" ("workspace_id", "campaign_id", "updated_at" DESC);
CREATE INDEX "pitch_feedback_invites_workspace_status_idx"
  ON "pitch_feedback_invites" ("workspace_id", "status");
CREATE INDEX "pitch_feedback_sessions_invite_idx"
  ON "pitch_feedback_sessions" ("invite_id", "started_at" DESC);
CREATE INDEX "pitch_feedback_events_invite_created_idx"
  ON "pitch_feedback_events" ("invite_id", "created_at" DESC);
CREATE INDEX "pitch_feedback_events_workspace_created_idx"
  ON "pitch_feedback_events" ("workspace_id", "created_at" DESC);
CREATE INDEX "pitch_feedback_responses_invite_created_idx"
  ON "pitch_feedback_responses" ("invite_id", "created_at");
CREATE INDEX "pitch_feedback_ai_insights_invite_created_idx"
  ON "pitch_feedback_ai_insights" ("invite_id", "created_at" DESC);
