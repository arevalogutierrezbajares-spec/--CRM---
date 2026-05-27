-- Work management: themes, initiatives, sprints + extends milestones.
-- Overlord mirror: read-only cache of TOURISM repo's section-*/TASKS.md.

/* ─── Enums ──────────────────────────────────────────────────────────── */

DO $$ BEGIN
  CREATE TYPE "work_priority" AS ENUM ('now','next','later','backlog');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "initiative_status" AS ENUM ('planning','active','paused','done','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "sprint_status" AS ENUM ('planned','active','completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "overlord_status" AS ENUM ('todo','in_progress','in_review','blocked','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "overlord_priority" AS ENUM ('NOW','NEXT','LATER','BACKLOG');
EXCEPTION WHEN duplicate_object THEN null; END $$;

/* ─── Extend milestone_status enum (add new values; existing rows unchanged) ─── */

ALTER TYPE "milestone_status" ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE "milestone_status" ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE "milestone_status" ADD VALUE IF NOT EXISTS 'cancelled';

/* ─── Work management tables ─────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS "themes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text,
  "icon" text,
  "description" text,
  "archived" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "initiatives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "summary" text,
  "goal" text,
  "status" "initiative_status" NOT NULL DEFAULT 'planning',
  "priority" "work_priority" NOT NULL DEFAULT 'next',
  "health_color" "health_color" NOT NULL DEFAULT 'green',
  "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "start_date" date,
  "target_end_date" date,
  "actual_end_date" date,
  "notes" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "initiatives_workspace_status_idx"
  ON "initiatives" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "sprints" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "initiative_id" uuid REFERENCES "initiatives"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "goal" text,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" "sprint_status" NOT NULL DEFAULT 'planned',
  "retro_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sprints_workspace_status_idx"
  ON "sprints" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "initiative_themes" (
  "initiative_id" uuid NOT NULL REFERENCES "initiatives"("id") ON DELETE CASCADE,
  "theme_id" uuid NOT NULL REFERENCES "themes"("id") ON DELETE CASCADE,
  PRIMARY KEY ("initiative_id", "theme_id")
);

CREATE TABLE IF NOT EXISTS "milestone_themes" (
  "milestone_id" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE CASCADE,
  "theme_id" uuid NOT NULL REFERENCES "themes"("id") ON DELETE CASCADE,
  PRIMARY KEY ("milestone_id", "theme_id")
);

CREATE TABLE IF NOT EXISTS "milestone_deps" (
  "blocker_id" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE CASCADE,
  "blocked_id" uuid NOT NULL REFERENCES "milestones"("id") ON DELETE CASCADE,
  PRIMARY KEY ("blocker_id", "blocked_id")
);

/* ─── Extend milestones ──────────────────────────────────────────────── */

ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "initiative_id" uuid REFERENCES "initiatives"("id") ON DELETE SET NULL;
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "sprint_id" uuid REFERENCES "sprints"("id") ON DELETE SET NULL;
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "priority" "work_priority";
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "parent_milestone_id" uuid REFERENCES "milestones"("id") ON DELETE SET NULL;
ALTER TABLE "milestones" ADD COLUMN IF NOT EXISTS "estimate_points" integer;

CREATE INDEX IF NOT EXISTS "milestones_initiative_idx"
  ON "milestones" ("initiative_id");
CREATE INDEX IF NOT EXISTS "milestones_sprint_idx"
  ON "milestones" ("sprint_id");
CREATE INDEX IF NOT EXISTS "milestones_assignee_idx"
  ON "milestones" ("assignee_user_id");

/* ─── Overlord mirror ────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS "overlord_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "section_key" text NOT NULL,
  "name" text NOT NULL,
  "file_path" text NOT NULL,
  "description" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("workspace_id", "section_key")
);

CREATE TABLE IF NOT EXISTS "overlord_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "overlord_sections"("id") ON DELETE CASCADE,
  "task_key" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "status" "overlord_status" NOT NULL DEFAULT 'todo',
  "priority" "overlord_priority",
  "task_type" text,
  "claimed_by_agent" text,
  "claimed_at" timestamp with time zone,
  "completed_by_agent" text,
  "completed_at" timestamp with time zone,
  "recommended_model" text,
  "est_tokens" text,
  "complexity" text,
  "risk" text,
  "parallel_safe" boolean,
  "depends_on" text,
  "scope_paths" jsonb DEFAULT '[]'::jsonb,
  "branch" text,
  "last_heartbeat" timestamp with time zone,
  "created_date" date,
  "last_modified_date" date,
  "description" text,
  "acceptance_criteria" jsonb DEFAULT '[]'::jsonb,
  "activity_log" jsonb DEFAULT '[]'::jsonb,
  "raw_markdown" text,
  "last_synced_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "overlord_tasks_section_status_idx"
  ON "overlord_tasks" ("section_id", "status");
CREATE INDEX IF NOT EXISTS "overlord_tasks_status_idx"
  ON "overlord_tasks" ("status");
CREATE INDEX IF NOT EXISTS "overlord_tasks_claimed_by_idx"
  ON "overlord_tasks" ("claimed_by_agent");
