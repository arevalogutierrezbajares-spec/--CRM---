import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  time,
  primaryKey,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

export const contactType = pgEnum("contact_type", ["person", "org"]);
export const relationshipType = pgEnum("relationship_type", [
  "friend",
  "lead",
  "partner",
  "prospect",
]);
export const projectStatus = pgEnum("project_status", [
  "active",
  "waiting",
  "done",
  "lost",
]);
export const healthColor = pgEnum("health_color", ["green", "amber", "red"]);
export const milestoneStatus = pgEnum("milestone_status", [
  "pending",
  "done",
  "blocked",
  "in_progress",
  "in_review",
  "cancelled",
]);
export const channelKind = pgEnum("channel_kind", [
  "email",
  "phone",
  "whatsapp",
  "instagram",
  "domain",
]);
export const touchChannel = pgEnum("touch_channel", [
  "email",
  "whatsapp",
  "call",
  "meeting",
  "voice_memo",
  "manual",
  "obsidian",
]);
export const meetingType = pgEnum("meeting_type", [
  "one_on_one",
  "group",
  "event",
  "call",
]);
export const meetingSource = pgEnum("meeting_source", [
  "calendar",
  "manual",
  "whatsapp",
  "voice",
]);
export const tagKind = pgEnum("tag_kind", ["venture", "custom"]);
export const defaultOwner = pgEnum("default_owner", [
  "tomas",
  "cofounder",
  "either",
]);
export const reminderRecur = pgEnum("reminder_recur", [
  "once",
  "daily",
  "weekly",
  "monthly",
]);
export const waDirection = pgEnum("wa_direction", [
  "in",
  "out",
  "tool",
  "reject",
  "error",
]);
/* ─── Project links ────────────────────────────────────────────────────── */

export const linkCategory = pgEnum("link_category", [
  "business",
  "marketing",
  "tech",
  "ops",
  "design",
  "finance",
  "other",
]);

/* ─── Work-mgmt enums ──────────────────────────────────────────────────── */

export const workPriority = pgEnum("work_priority", [
  "now",
  "next",
  "later",
  "backlog",
]);

export const initiativeStatus = pgEnum("initiative_status", [
  "planning",
  "active",
  "paused",
  "done",
  "cancelled",
]);

export const sprintStatus = pgEnum("sprint_status", [
  "planned",
  "active",
  "completed",
]);

/* ─── Overlord enums (mirror only) ─────────────────────────────────────── */

export const overlordStatus = pgEnum("overlord_status", [
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "cancelled",
]);

export const overlordPriority = pgEnum("overlord_priority", [
  "NOW",
  "NEXT",
  "LATER",
  "BACKLOG",
]);

/* ─── Treasury enums ───────────────────────────────────────────────────── */

export const accountType = pgEnum("account_type", [
  "checking",
  "savings",
  "credit_card",
  "cash",
  "crypto",
  "brokerage",
  "loan",
  "other",
]);

export const txnSource = pgEnum("txn_source", [
  "manual",
  "csv_import",
  "email_parse",
  "sync",
  "api",
]);

export const categoryKind = pgEnum("category_kind", [
  "expense",
  "income",
  "transfer",
]);

export const subscriptionCycle = pgEnum("subscription_cycle", [
  "monthly",
  "yearly",
  "weekly",
  "usage",
  "one_off",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "paused",
  "cancelled",
  "trialing",
]);

export const workspaceRole = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
]);

export const partnerKind = pgEnum("partner_kind", [
  "creative",
  "equity_capital",
  "non_equity_capital",
  "strategic",
  "operating",
  "advisor",
  "client",
  "other",
]);

export const partnerRoomStatus = pgEnum("partner_room_status", [
  "draft",
  "active",
  "paused",
  "revoked",
]);

// Language a partner room renders in for the guest. Extensible: add a value here
// + a dictionary in lib/partner-room-i18n.ts + an entry in ROOM_LOCALE_OPTIONS.
export const roomLocale = pgEnum("room_locale", ["es", "en"]);

export const partnerShareChannel = pgEnum("partner_share_channel", [
  "email",
  "whatsapp",
  "signal",
  "link",
  "meeting",
  "manual",
]);

export const partnerAccessEventType = pgEnum("partner_access_event_type", [
  "room_created",
  "room_invited",
  "room_updated",
  "room_status_changed",
  "access_link_generated",
  "share_created",
  "share_sent",
  "viewed",
  "downloaded",
  "commented",
  "question",
  "revoked",
  "expired",
  "partner_uploaded",
  "next_step_created",
  "next_step_completed",
  "next_step_deleted",
  "member_identified",
  "message_posted",
  "passcode_set",
  "passcode_removed",
  "share_updated",
  "item_added",
  "item_commented",
  "signature_requested",
  "document_signed",
]);

/* ─── Pitch feedback module enums ─────────────────────────────────────── */

export const pitchFeedbackAudience = pgEnum("pitch_feedback_audience", [
  "friends_family",
  "advisor",
  "partner",
  "customer",
  "investor",
  "internal",
]);

export const pitchFeedbackCampaignStatus = pgEnum(
  "pitch_feedback_campaign_status",
  ["draft", "active", "closed", "archived"],
);

export const pitchFeedbackInviteStatus = pgEnum(
  "pitch_feedback_invite_status",
  [
    "draft",
    "link_generated",
    "sent",
    "opened",
    "in_progress",
    "completed",
    "expired",
    "revoked",
  ],
);

export const pitchFeedbackChannel = pgEnum("pitch_feedback_channel", [
  "email",
  "whatsapp",
  "signal",
  "link",
  "manual",
]);

export const pitchFeedbackEventType = pgEnum("pitch_feedback_event_type", [
  "invite_created",
  "link_generated",
  "invite_sent",
  "invite_copied",
  "link_opened",
  "session_started",
  "section_entered",
  "section_completed",
  "reaction_submitted",
  "question_answered",
  "final_feedback_submitted",
  "invite_completed",
  "ai_summary_generated",
  "followup_draft_created",
  "followup_task_created",
  "followup_sent",
  "invite_expired",
  "invite_revoked",
  "feedback_redacted",
]);

export const pitchFeedbackResponseType = pgEnum(
  "pitch_feedback_response_type",
  ["reaction", "score", "text", "intro", "objection", "final"],
);

export const pitchFeedbackInsightScope = pgEnum("pitch_feedback_insight_scope", [
  "invite",
  "contact",
  "campaign",
]);

export const pitchFeedbackSentiment = pgEnum("pitch_feedback_sentiment", [
  "positive",
  "neutral",
  "mixed",
  "negative",
]);

export const pitchFeedbackSupportLevel = pgEnum(
  "pitch_feedback_support_level",
  ["champion", "supportive", "curious", "skeptical", "disengaged"],
);

export const pitchFeedbackDeliveryStatus = pgEnum(
  "pitch_feedback_delivery_status",
  ["pending", "sent", "failed", "copied", "manual"],
);

export type PitchFeedbackPromptSnapshot = {
  key: string;
  label: string;
  type: "reaction" | "score" | "text" | "intro" | "objection" | "final";
  required?: boolean;
};

export type PitchFeedbackSectionSnapshot = Array<{
  key: string;
  eyebrow?: string;
  title: string;
  body: string;
  proof?: string;
  prompts: PitchFeedbackPromptSnapshot[];
}>;

/* ─── Email module enums ───────────────────────────────────────────────── */

export const emailProviderKind = pgEnum("email_provider_kind", [
  "sandbox",
  "microsoft_365",
  "zoho_mail",
]);

export const emailConnectionStatus = pgEnum("email_connection_status", [
  "connected",
  "degraded",
  "disconnected",
]);

export const emailMailboxType = pgEnum("email_mailbox_type", [
  "personal",
  "shared",
  "system",
]);

export const emailMailboxStatus = pgEnum("email_mailbox_status", [
  "active",
  "paused",
  "error",
  "deactivated",
]);

export const emailProvisioningKind = pgEnum("email_provisioning_kind", [
  "import_existing",
  "shared_mailbox",
  "team_member",
]);

export const emailProvisioningStatus = pgEnum("email_provisioning_status", [
  "requested",
  "provider_pending",
  "provider_ready",
  "completed",
  "failed",
  "cancelled",
]);

export const emailThreadStatus = pgEnum("email_thread_status", [
  "open",
  "waiting",
  "done",
  "snoozed",
]);

export const emailMessageDirection = pgEnum("email_message_direction", [
  "inbound",
  "outbound",
]);

export const emailDraftStatus = pgEnum("email_draft_status", [
  "draft",
  "queued",
  "sent",
  "discarded",
]);

export const emailSendJobStatus = pgEnum("email_send_job_status", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

export const emailCrmLinkType = pgEnum("email_crm_link_type", [
  "contact",
  "project",
  "initiative",
  "action_item",
  "milestone",
]);

// ─────────────────────────────────────────────────────────────────────────────
// USERS (mirrors auth.users) — `whatsapp_phone` enables inbound bot routing.
// ─────────────────────────────────────────────────────────────────────────────

// Users table — public mirror of auth.users (Supabase) plus workspace + agent
// metadata. `whatsapp_persona` is freeform text injected into the WhatsApp
// agent's system prompt so the AI greets each member with the right vibe.
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  // E.164 without leading + (e.g. "15551234567"). Used by the WhatsApp webhook
  // to identify the sender. NULL = user can't text the bot yet.
  whatsappPhone: text("whatsapp_phone").unique(),
  // Freeform string injected into the WhatsApp agent's system prompt — used
  // to teach the agent how to address this user (nicknames, vibe). NULL =
  // agent falls back to display_name.
  whatsappPersona: text("whatsapp_persona"),
  // Default workspace shown after sign-in. Null only briefly after sign-up,
  // before the first workspace is auto-created.
  currentWorkspaceId: uuid("current_workspace_id"),
  // FR-PRESENCE: last time the user was active (heartbeat). Null = never seen.
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // FR-PMO: Home dashboard layout — [{ id, hidden, width }]. Null = defaults.
  dashboardLayout: jsonb("dashboard_layout"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACES — the unit of sharing. A workspace is a team of users that all
// see the same contacts / projects / milestones / touches / meetings.
// ─────────────────────────────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  // Home countdown: one workspace-wide "big milestone" the Home clock counts down to.
  countdownTitle: text("countdown_title"),
  countdownDate: date("countdown_date"),
  countdownSubpoints: jsonb("countdown_subpoints").$type<string[]>().notNull().default([]),
  // FR-CALL-RET-1: how long captured call audio is kept before the purge cron
  // deletes it (transcripts are permanent). Per-workspace, founder-configurable.
  callAudioRetentionDays: integer("call_audio_retention_days").notNull().default(30),
  // FR-CALL-RET: when false, captured call audio is transcribed but never stored
  // in the bucket (transcript-only) — eliminates recurring audio storage cost.
  // Pair with the Helper's "keep audio locally" option to retain a usable copy.
  storeCallAudio: boolean("store_call_audio").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
  }),
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull().default("member"),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id),
    token: text("token").notNull().unique(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqWorkspaceEmail: uniqueIndex("workspace_invites_workspace_email_uniq").on(
      t.workspaceId,
      t.email,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS — every owned row carries workspace_id (gates access) + created_by
// (audit / "who added this").
// ─────────────────────────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: contactType("type").notNull().default("person"),
  organization: text("organization"),
  logoUrl: text("logo_url"), // client/company brand logo for co-branded rooms (URL or proxy path)
  logoStoragePath: text("logo_storage_path"), // set when the logo was uploaded (served via proxy)
  // Structured link from a person to their organization (an org-type contact).
  // Self-reference; set null if the org contact is deleted so the person survives.
  primaryOrgId: uuid("primary_org_id").references(
    (): AnyPgColumn => contacts.id,
    { onDelete: "set null" },
  ),
  relationshipType: relationshipType("relationship_type")
    .notNull()
    .default("prospect"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  introChainFromContactId: uuid("intro_chain_from_contact_id"),
  introChainFromText: text("intro_chain_from_text"),
  notesPath: text("notes_path"),
  lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contactChannels = pgTable("contact_channels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  kind: channelKind("kind").notNull(),
  value: text("value").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
});

// ─────────────────────────────────────────────────────────────────────────────
// TAGS — global dictionary, NOT workspace-scoped. Custom tags created by any
// workspace member become available to everyone in the workspace.
// ─────────────────────────────────────────────────────────────────────────────

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  kind: tagKind("kind").notNull().default("venture"),
  color: text("color"),
  // Optional grouping for the tag picker (e.g. "Sector", "Status"). Free-form.
  category: text("category"),
});

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.tagId] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINE TEMPLATES + STAGES — read-only seed dictionary.
// ─────────────────────────────────────────────────────────────────────────────

export const pipelineTemplates = pgTable("pipeline_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const pipelineStages = pgTable("pipeline_stages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: text("template_id")
    .notNull()
    .references(() => pipelineTemplates.id),
  order: integer("order").notNull(),
  name: text("name").notNull(),
  slaDays: integer("sla_days"),
  defaultOwner: defaultOwner("default_owner").notNull().default("either"),
  doneCriterion: text("done_criterion"),
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────────────────────────────────────

// Discriminates the portfolio: the 2 standing BUSINESSES (CaneyCloud, VAV —
// modules inherit the parent's kind) vs every other venture, a PROJECT with
// identical functionality that can link to 0..n businesses.
export const lobKind = pgEnum("lob_kind", ["business", "project"]);

// A Line of Business (LoB) is the top-level venture record: portfolio display,
// pipeline, shared links/docs/contacts, and module self-nesting. Formerly the
// `projects` table; the lighter execution-unit `projects` table now rolls up to it.
export const linesOfBusiness = pgTable("lines_of_business", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  kind: lobKind("kind").notNull().default("project"),
  // Manual ordering in the roadmap bulk-edit (drag to reorder LoBs).
  sortOrder: integer("sort_order").notNull().default(0),
  status: projectStatus("status").notNull().default("active"),
  templateId: text("template_id").references(() => pipelineTemplates.id),
  currentStageId: uuid("current_stage_id").references(() => pipelineStages.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  dueDate: date("due_date"),
  healthColor: healthColor("health_color").notNull().default("green"),
  waitingOn: text("waiting_on"),
  expectedUnblockDate: date("expected_unblock_date"),
  notesPath: text("notes_path"),
  // ─── Portfolio display extensions ────────────────────────────────
  tagline: text("tagline"), // one-line positioning
  summary: text("summary"), // markdown-ish description
  coverEmoji: text("cover_emoji"), // single emoji for the cover
  coverColor: text("cover_color"), // hex; left/border accent
  primaryUrl: text("primary_url"), // production / canonical link
  repoUrl: text("repo_url"),
  statusText: text("status_text"), // short human status string
  featured: boolean("featured").notNull().default(false), // pin to top of gallery
  logoUrl: text("logo_url"), // /logos/x.svg or external URL
  logoUrlDark: text("logo_url_dark"), // dark-mode variant (optional)
  objectives: jsonb("objectives").$type<string[]>().default([]), // 3-5 high-level bullets
  // Self-reference for module/sub-LoB nesting (e.g. CaneyCloud → Stays/Restaurants/WA Concierge)
  parentLobId: uuid("parent_lob_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A Project is the lighter execution unit that rolls up to exactly one LoB.
// Milestones, finance allocations, and meetings attach here (not on the LoB).
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id")
    .notNull()
    .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: projectStatus("status").notNull().default("active"),
  dueDate: date("due_date"),
  healthColor: healthColor("health_color").notNull().default("green"),
  waitingOn: text("waiting_on"),
  expectedUnblockDate: date("expected_unblock_date"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A kind='project' LoB can roll up to 0..n kind='business' LoBs
// (e.g. Ucaima Transformation → CaneyCloud + VAV). Kind correctness is
// enforced in setBusinessLinks, not by the database.
export const lobBusinessLinks = pgTable(
  "lob_business_links",
  {
    projectLobId: uuid("project_lob_id")
      .notNull()
      .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
    businessLobId: uuid("business_lob_id")
      .notNull()
      .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectLobId, t.businessLobId] }),
  }),
);

// project_link.kind discriminates the row variant:
//   'note' — legacy freeform entry with no URL (existing 134 seeded rows)
//   'link' — external URL (Google Docs, Figma, etc.) — Step 1
//   'file' — uploaded file in Supabase Storage — Step 2
export const projectLinkKind = pgEnum("project_link_kind", [
  "note",
  "link",
  "file",
  "doc",
]);

export const projectLinks = pgTable("project_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id")
    .notNull()
    .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
  // FR-DOC-13 discriminator. Defaults to 'link' for new inserts via the
  // create-link server action; the 134 existing url=null rows are backfilled
  // to 'note'.
  kind: projectLinkKind("kind").notNull().default("link"),
  category: linkCategory("category").notNull().default("other"),
  label: text("label").notNull(),
  url: text("url"), // set when kind='link'
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  // FR-DOC-13: file-mode columns. Null unless kind='file'.
  storagePath: text("storage_path"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  originalFilename: text("original_filename"),
  // FR-DOC-1/4: ownership + audit. createdBy is nullable to accommodate the
  // 134 pre-existing note rows; new inserts via server actions always set it.
  createdBy: uuid("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// FR-DOC-11 audit log: every create/update/delete writes one row in the same
// transaction as the data mutation. link_id is NOT a foreign key so the row
// survives the link's deletion (forensic trail).
export const projectLinkAudits = pgTable("project_link_audits", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  linkId: uuid("link_id").notNull(), // intentionally NOT a FK
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(), // 'create' | 'update' | 'delete' | 'file_missing' | 'storage_orphan'
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// FR-DOC-COLLAB: editable content for kind='doc' rows. 1:1 with project_links.
export const projectDocContents = pgTable("project_doc_contents", {
  linkId: uuid("link_id")
    .primaryKey()
    .references(() => projectLinks.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Yjs CRDT state (Y.encodeStateAsUpdate), base64. Null until first save.
  ydoc: text("ydoc"),
  // Markdown mirror of the latest content for list previews + search.
  text: text("text").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => users.id),
});

// FR-DOC-COMMENTS: threaded discussion + @mentions on any project_links row
// (a file OR a collaborative doc). Mentioning a teammate fans out an in-app
// notification (entityType='doc_comment', entityId=link_id) and a WhatsApp DM,
// mirroring the Town Hall pipeline. Soft-deleted (deletedAt) so threads keep
// their shape.
export const docComments = pgTable("doc_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  linkId: uuid("link_id")
    .notNull()
    .references(() => projectLinks.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Who was @mentioned in a comment (also powers a "people tagged on this doc"
// view). One row per (comment, user).
export const docCommentMentions = pgTable("doc_comment_mentions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: uuid("comment_id")
    .notNull()
    .references(() => docComments.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER ACCESS — curated partner rooms + share ledger. Rooms are the future
// external surface; shares are useful immediately as an internal audit trail.
// ─────────────────────────────────────────────────────────────────────────────

export const partnerRooms = pgTable("partner_rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  primaryContactId: uuid("primary_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  partnerKind: partnerKind("partner_kind").notNull().default("strategic"),
  status: partnerRoomStatus("status").notNull().default("draft"),
  // Guest-facing language for the room (es | en). Drives the i18n dictionary.
  locale: roomLocale("locale").notNull().default("es"),
  summary: text("summary"),
  welcomeMessage: text("welcome_message"),
  publicAccessTokenHash: text("public_access_token_hash").unique(),
  publicAccessTokenCreatedAt: timestamp("public_access_token_created_at", {
    withTimezone: true,
  }),
  publicAccessLastViewedAt: timestamp("public_access_last_viewed_at", {
    withTimezone: true,
  }),
  passcodeHash: text("passcode_hash"),
  passcodeFailedCount: integer("passcode_failed_count").notNull().default(0),
  passcodeLockedUntil: timestamp("passcode_locked_until", { withTimezone: true }),
  // Max distinct guests who may claim a seat (enter email at the gate). Null = unlimited.
  seatLimit: integer("seat_limit"),
  // null = auto-derive brand logos from shared docs; array of LoB ids = explicit pick.
  brandLobIds: jsonb("brand_lob_ids").$type<string[]>(),
  // Preset background video for the room hero (lib/partner-room-videos). Null = none.
  heroVideoKey: text("hero_video_key"),
  // Optional featured product demo. Rendered as a "Demo access" card inside the
  // room. Cleared (not cascaded) if the demo link is deleted. Defined lazily so
  // the forward reference to demoLinks (declared later in this file) resolves.
  demoLinkId: uuid("demo_link_id").references((): AnyPgColumn => demoLinks.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerRoomMembers = pgTable(
  "partner_room_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => partnerRooms.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    // Nullable: an owner can pre-add an expected guest by name; the guest
    // "claims" the seat by entering their email on first sign-in.
    email: text("email"),
    displayName: text("display_name"),
    roleLabel: text("role_label"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqRoomEmail: uniqueIndex("partner_room_members_room_email_uniq").on(
      t.roomId,
      t.email,
    ),
  }),
);

export const partnerShares = pgTable("partner_shares", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => partnerRooms.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  projectLinkId: uuid("project_link_id").references(() => projectLinks.id, {
    onDelete: "set null",
  }),
  meetingId: uuid("meeting_id").references(() => meetings.id, {
    onDelete: "set null",
  }),
  labelSnapshot: text("label_snapshot").notNull(),
  kindSnapshot: text("kind_snapshot").notNull(),
  categorySnapshot: text("category_snapshot"),
  // Repository section in the partner room (REPO_SECTION_OPTIONS). Null = default.
  roomSection: text("room_section"),
  urlSnapshot: text("url_snapshot"),
  permissions: jsonb("permissions")
    .$type<Array<"view" | "download" | "comment" | "upload">>()
    .notNull()
    .default(["view"]),
  channel: partnerShareChannel("channel").notNull().default("manual"),
  message: text("message"),
  sharedBy: uuid("shared_by")
    .notNull()
    .references(() => users.id),
  sharedAt: timestamp("shared_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerAccessEvents = pgTable("partner_access_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => partnerRooms.id, {
    onDelete: "set null",
  }),
  shareId: uuid("share_id").references(() => partnerShares.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  eventType: partnerAccessEventType("event_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerUploads = pgTable("partner_uploads", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  label: text("label"),
  note: text("note"),
  downloadedAt: timestamp("downloaded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerRoomMessages = pgTable("partner_room_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  authorKind: text("author_kind").notNull().default("owner"),
  authorUserId: uuid("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorMemberId: uuid("author_member_id").references(() => partnerRoomMembers.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partnerRoomTeam = pgTable(
  "partner_room_team",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => partnerRooms.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRoomUser: uniqueIndex("partner_room_team_room_user_uniq").on(t.roomId, t.userId),
  }),
);

export const partnerRoomItems = pgTable("partner_room_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("link"),
  title: text("title").notNull(),
  description: text("description"),
  // Repository section in the partner room (REPO_SECTION_OPTIONS). Null = default.
  category: text("category"),
  url: text("url"),
  storagePath: text("storage_path"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  sortOrder: integer("sort_order").notNull().default(0),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerItemComments = pgTable("partner_item_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  targetKind: text("target_kind").notNull(),
  targetId: uuid("target_id").notNull(),
  authorKind: text("author_kind").notNull().default("owner"),
  authorUserId: uuid("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorMemberId: uuid("author_member_id").references(
    () => partnerRoomMembers.id,
    { onDelete: "set null" },
  ),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerNextSteps = pgTable("partner_next_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  assignedTo: text("assigned_to").notNull().default("partner"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: text("completed_by"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdByUser: uuid("created_by_user").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// E-signatures on partner-room repository entries. The request is the owner's
// ask; the signature row is the audit record (server timestamp, signer
// identity, document hash, IP/UA, stamped PDF copy for PDF targets).
export const partnerSignatureRequests = pgTable(
  "partner_signature_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => partnerRooms.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(), // 'share' | 'item'
    targetId: uuid("target_id").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    message: text("message"),
    status: text("status").notNull().default("pending"), // pending | signed | voided
    requestedBy: uuid("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTarget: uniqueIndex("partner_signature_requests_room_id_target_kind_target_id_key").on(
      t.roomId,
      t.targetKind,
      t.targetId,
    ),
  }),
);

export const partnerSignatures = pgTable("partner_signatures", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  roomId: uuid("room_id")
    .notNull()
    .references(() => partnerRooms.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => partnerSignatureRequests.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").references(() => partnerRoomMembers.id, {
    onDelete: "set null",
  }),
  signerName: text("signer_name").notNull(),
  signerEmail: text("signer_email"),
  signatureImagePath: text("signature_image_path"),
  documentSha256: text("document_sha256"),
  signedPdfPath: text("signed_pdf_path"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// PITCH FEEDBACK — contact-linked private pitch walkthroughs and feedback.
// Public tokens are hashed; campaign snapshots preserve what a recipient saw.
// ─────────────────────────────────────────────────────────────────────────────

export const pitchFeedbackCampaigns = pgTable("pitch_feedback_campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  description: text("description"),
  audience: pitchFeedbackAudience("audience")
    .notNull()
    .default("friends_family"),
  status: pitchFeedbackCampaignStatus("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  sections: jsonb("sections")
    .$type<PitchFeedbackSectionSnapshot>()
    .notNull()
    .default([]),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pitchFeedbackInvites = pgTable(
  "pitch_feedback_invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => pitchFeedbackCampaigns.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash"),
    status: pitchFeedbackInviteStatus("status").notNull().default("draft"),
    channel: pitchFeedbackChannel("channel").notNull().default("manual"),
    personalization: jsonb("personalization")
      .$type<{
        welcomeNote?: string;
        sendMessage?: string;
        focusQuestions?: string[];
      }>()
      .notNull()
      .default({}),
    campaignVersion: integer("campaign_version").notNull().default(1),
    sectionsSnapshot: jsonb("sections_snapshot")
      .$type<PitchFeedbackSectionSnapshot>()
      .notNull()
      .default([]),
    sentMessage: text("sent_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    completionPercent: integer("completion_percent").notNull().default(0),
    currentSectionKey: text("current_section_key"),
    viewCount: integer("view_count").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqTokenHash: uniqueIndex("pitch_feedback_invites_token_hash_uniq").on(
      t.tokenHash,
    ),
  }),
);

export const pitchFeedbackSessions = pgTable("pitch_feedback_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  inviteId: uuid("invite_id")
    .notNull()
    .references(() => pitchFeedbackInvites.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  userAgentHash: text("user_agent_hash"),
  ipHash: text("ip_hash"),
  referrer: text("referrer"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
});

export const pitchFeedbackEvents = pgTable("pitch_feedback_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  inviteId: uuid("invite_id")
    .notNull()
    .references(() => pitchFeedbackInvites.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => pitchFeedbackSessions.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  eventType: pitchFeedbackEventType("event_type").notNull(),
  sectionKey: text("section_key"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pitchFeedbackResponses = pgTable(
  "pitch_feedback_responses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => pitchFeedbackInvites.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => pitchFeedbackSessions.id, {
      onDelete: "set null",
    }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull(),
    promptKey: text("prompt_key").notNull(),
    responseType: pitchFeedbackResponseType("response_type").notNull(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
    redactedAt: timestamp("redacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqInviteSectionPrompt: uniqueIndex(
      "pitch_feedback_responses_invite_section_prompt_uniq",
    ).on(t.inviteId, t.sectionKey, t.promptKey),
  }),
);

export const pitchFeedbackAiInsights = pgTable("pitch_feedback_ai_insights", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => pitchFeedbackCampaigns.id, {
    onDelete: "cascade",
  }),
  inviteId: uuid("invite_id").references(() => pitchFeedbackInvites.id, {
    onDelete: "cascade",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "cascade",
  }),
  scope: pitchFeedbackInsightScope("scope").notNull().default("invite"),
  model: text("model").notNull().default("heuristic"),
  summary: text("summary").notNull(),
  sentiment: pitchFeedbackSentiment("sentiment").notNull().default("neutral"),
  confidenceScore: integer("confidence_score").notNull().default(50),
  supportLevel: pitchFeedbackSupportLevel("support_level")
    .notNull()
    .default("curious"),
  objections: jsonb("objections").$type<string[]>().notNull().default([]),
  confusionPoints: jsonb("confusion_points").$type<string[]>().notNull().default([]),
  positiveSignals: jsonb("positive_signals").$type<string[]>().notNull().default([]),
  recommendedFollowup: text("recommended_followup"),
  suggestedPitchEdits: jsonb("suggested_pitch_edits")
    .$type<Array<{ sectionKey?: string; suggestion: string }>>()
    .notNull()
    .default([]),
  sourceResponseIds: jsonb("source_response_ids").$type<string[]>().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pitchFeedbackDeliveryAttempts = pgTable(
  "pitch_feedback_delivery_attempts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => pitchFeedbackInvites.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channel: pitchFeedbackChannel("channel").notNull().default("manual"),
    status: pitchFeedbackDeliveryStatus("status").notNull().default("pending"),
    messageSnapshot: text("message_snapshot").notNull().default(""),
    providerResult: jsonb("provider_result").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqInviteChannelMessage: uniqueIndex(
      "pitch_feedback_delivery_invite_channel_msg_uniq",
    ).on(t.inviteId, t.channel, t.messageSnapshot),
  }),
);

// ── Story presentations: native, dynamic decks with click-to-comment feedback ──
// A presentation is an ordered list of slides (JSON). Shareable to external
// clients via a hashed token (same pattern as pitch feedback / partner access).
export const presentations = pgTable("presentations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  // Slide[] — see lib/presentations/types.ts for the shape.
  slides: jsonb("slides").$type<unknown[]>().notNull().default([]),
  // Optional link back to a line of business / project for context.
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  shareToken: text("share_token").unique(),
  shareEnabled: boolean("share_enabled").notNull().default(false),
  allowComments: boolean("allow_comments").notNull().default(true),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A comment pinned to a position on a slide (PPT/Figma-style). Author is a
// workspace user (internal) OR an external client identified by name (token).
export const presentationComments = pgTable("presentation_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  presentationId: uuid("presentation_id")
    .notNull()
    .references(() => presentations.id, { onDelete: "cascade" }),
  // The slide's stable id within the slides JSON.
  slideId: text("slide_id").notNull(),
  // Anchor as a fraction of the slide (0..1) so it survives any render size.
  xPct: doublePrecision("x_pct").notNull(),
  yPct: doublePrecision("y_pct").notNull(),
  body: text("body").notNull(),
  authorUserId: uuid("author_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  authorName: text("author_name"), // set for external (token) commenters
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// FR-PMO: per-user pinned projects for quick access on the Home dashboard.
export const projectPins = pgTable(
  "project_pins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lobId: uuid("lob_id")
      .notNull()
      .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.lobId] }) }),
);

// FR-PMO: recently-opened projects per user (Home "Recent").
export const projectVisits = pgTable(
  "project_visits",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lobId: uuid("lob_id")
      .notNull()
      .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.lobId] }) }),
);

// FR-PMO: attach docs/links directly to an action item, milestone, or meeting.
export const itemEntityType = pgEnum("item_entity_type", [
  "action_item",
  "milestone",
  "meeting",
]);

export const itemAttachments = pgTable("item_attachments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  entityType: itemEntityType("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  // Reference to an existing project doc/file/link, OR null for a standalone url.
  projectLinkId: uuid("project_link_id").references(() => projectLinks.id, {
    onDelete: "cascade",
  }),
  url: text("url"),
  label: text("label").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectContacts = pgTable(
  "project_contacts",
  {
    lobId: uuid("lob_id")
      .notNull()
      .references(() => linesOfBusiness.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("primary"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.lobId, t.contactId] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// MILESTONES
// ─────────────────────────────────────────────────────────────────────────────

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  dueDate: date("due_date"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  // Optional: a specific workspace member assigned to this milestone. Falls
  // back to "any member" when null.
  assignedTo: uuid("assigned_to").references(() => users.id),
  status: milestoneStatus("status").notNull().default("pending"),
  blockerText: text("blocker_text"),
  sourceMeetingId: uuid("source_meeting_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  order: integer("order").notNull().default(0),
  // Roadmap product-line tag: 'caney' | 'vav' | 'all' (applies to both) | null.
  // Distinct from projectId (the internal project grouping).
  project: text("project"),
  // ─── Work-mgmt extensions (R1) ────────────────────────────────────
  initiativeId: uuid("initiative_id"),
  sprintId: uuid("sprint_id"),
  priority: workPriority("priority"),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  parentMilestoneId: uuid("parent_milestone_id"),
  estimatePoints: integer("estimate_points"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TOUCHES
// ─────────────────────────────────────────────────────────────────────────────

export const touches = pgTable("touches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  meetingId: uuid("meeting_id"),
  channel: touchChannel("channel").notNull(),
  body: text("body").notNull(),
  transcript: text("transcript"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// MEETINGS
// ─────────────────────────────────────────────────────────────────────────────

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  location: text("location"),
  type: meetingType("type").notNull().default("one_on_one"),
  agenda: text("agenda"),
  minutes: text("minutes"),
  linkedProjectId: uuid("linked_project_id").references(() => projects.id),
  source: meetingSource("source").notNull().default("manual"),
  metAtTag: text("met_at_tag"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const meetingAttendees = pgTable(
  "meeting_attendees",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.meetingId, t.contactId] }),
  }),
);

// Curated materials shown in a meeting (the "meeting hub" + present mode). The
// material's content lives in project_links (single source of truth); this join
// only decides WHICH materials appear in THIS meeting and IN WHAT ORDER. A deck
// can live under any LoB and still be attached here.
export const meetingMaterials = pgTable(
  "meeting_materials",
  {
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    projectLinkId: uuid("project_link_id")
      .notNull()
      .references(() => projectLinks.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.meetingId, t.projectLinkId] }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  createdContacts: many(contacts),
  createdLinesOfBusiness: many(linesOfBusiness),
  createdProjects: many(projects),
  createdMilestones: many(milestones),
  createdTouches: many(touches),
  createdMeetings: many(meetings),
  createdPitchFeedbackCampaigns: many(pitchFeedbackCampaigns),
  createdPitchFeedbackInvites: many(pitchFeedbackInvites),
  createdPitchFeedbackInsights: many(pitchFeedbackAiInsights),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  contacts: many(contacts),
  linesOfBusiness: many(linesOfBusiness),
  projects: many(projects),
  pitchFeedbackCampaigns: many(pitchFeedbackCampaigns),
  pitchFeedbackInvites: many(pitchFeedbackInvites),
}));

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
  }),
);

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contacts.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [contacts.createdBy],
    references: [users.id],
  }),
  introducer: one(contacts, {
    fields: [contacts.introChainFromContactId],
    references: [contacts.id],
    relationName: "introducer",
  }),
  channels: many(contactChannels),
  tags: many(contactTags),
  touches: many(touches),
  projectLinks: many(projectContacts),
  meetingAppearances: many(meetingAttendees),
  pitchFeedbackInvites: many(pitchFeedbackInvites),
  pitchFeedbackSessions: many(pitchFeedbackSessions),
  pitchFeedbackEvents: many(pitchFeedbackEvents),
  pitchFeedbackResponses: many(pitchFeedbackResponses),
  pitchFeedbackInsights: many(pitchFeedbackAiInsights),
}));

export const linesOfBusinessRelations = relations(
  linesOfBusiness,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [linesOfBusiness.workspaceId],
      references: [workspaces.id],
    }),
    creator: one(users, {
      fields: [linesOfBusiness.createdBy],
      references: [users.id],
    }),
    template: one(pipelineTemplates, {
      fields: [linesOfBusiness.templateId],
      references: [pipelineTemplates.id],
    }),
    currentStage: one(pipelineStages, {
      fields: [linesOfBusiness.currentStageId],
      references: [pipelineStages.id],
    }),
    parent: one(linesOfBusiness, {
      fields: [linesOfBusiness.parentLobId],
      references: [linesOfBusiness.id],
      relationName: "lobModules",
    }),
    modules: many(linesOfBusiness, { relationName: "lobModules" }),
    projects: many(projects),
    links: many(projectLinks),
    touches: many(touches),
    contactLinks: many(projectContacts),
    pitchFeedbackCampaigns: many(pitchFeedbackCampaigns),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  lob: one(linesOfBusiness, {
    fields: [projects.lobId],
    references: [linesOfBusiness.id],
  }),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  milestones: many(milestones),
  meetings: many(meetings),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [meetings.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [meetings.createdBy],
    references: [users.id],
  }),
  linkedProject: one(projects, {
    fields: [meetings.linkedProjectId],
    references: [projects.id],
  }),
  attendees: many(meetingAttendees),
  touches: many(touches),
  materials: many(meetingMaterials),
  callRecordings: many(callRecordings),
}));

export const meetingMaterialsRelations = relations(
  meetingMaterials,
  ({ one }) => ({
    meeting: one(meetings, {
      fields: [meetingMaterials.meetingId],
      references: [meetings.id],
    }),
    projectLink: one(projectLinks, {
      fields: [meetingMaterials.projectLinkId],
      references: [projectLinks.id],
    }),
  }),
);

export const pipelineTemplatesRelations = relations(
  pipelineTemplates,
  ({ many }) => ({
    stages: many(pipelineStages),
    linesOfBusiness: many(linesOfBusiness),
  }),
);

export const pipelineStagesRelations = relations(pipelineStages, ({ one }) => ({
  template: one(pipelineTemplates, {
    fields: [pipelineStages.templateId],
    references: [pipelineTemplates.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// WHATSAPP AGENT — conversation state, reminders, activity log, nudges
// ─────────────────────────────────────────────────────────────────────────────

export const waConversations = pgTable("wa_conversations", {
  // Keyed by raw WhatsApp sender phone (E.164 without leading +).
  senderPhone: text("sender_phone").primaryKey(),
  // Which workspace this conversation is operating against. Set on first
  // message based on the user's current_workspace_id; can be updated if the
  // user switches workspaces mid-conversation.
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // The user who texted (resolved from sender_phone). Tools attribute writes
  // to this user via created_by.
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
  pendingIntent: jsonb("pending_intent").$type<unknown | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // The user the reminder is FOR (and who will receive the WhatsApp ping).
  // Each member of a workspace gets their own reminders.
  forUserId: uuid("for_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  subject: text("subject").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  recur: reminderRecur("recur").notNull().default("once"),
  recurDay: integer("recur_day"),
  recurTime: time("recur_time"),
  firedAt: timestamp("fired_at", { withTimezone: true }),
  sourceContactId: uuid("source_contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  sourceLobId: uuid("source_lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const waActivity = pgTable("wa_activity", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "set null",
  }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  senderPhone: text("sender_phone").notNull(),
  direction: waDirection("direction").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costMillicents: integer("cost_millicents"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nudges = pgTable("nudges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Who receives the nudge.
  forUserId: uuid("for_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  signature: text("signature").notNull(),
  firedAt: timestamp("fired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

// ─────────────────────────────────────────────────────────────────────────────
// TREASURY — accounts, transactions, vendors, categories, subscriptions, FX
// ─────────────────────────────────────────────────────────────────────────────

export const finCategories = pgTable("fin_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  color: text("color"), // hex like #185FA5
  kind: categoryKind("kind").notNull().default("expense"),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finAccounts = pgTable("fin_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: accountType("type").notNull(),
  currency: text("currency").notNull().default("USD"), // ISO 4217
  // Balances in minor units (cents). Use bigint as text to avoid JS precision.
  balanceCents: integer("balance_cents").notNull().default(0),
  openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
  // Color/logo hints for UI
  color: text("color"),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  // Future: provider/external_id for Plaid/Belvo sync
  provider: text("provider").notNull().default("manual"),
  externalId: text("external_id"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finVendors = pgTable("fin_vendors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Optional link to an existing CRM contact (org or person)
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  defaultCategoryId: uuid("default_category_id").references(
    () => finCategories.id,
    { onDelete: "set null" },
  ),
  website: text("website"),
  logoUrl: text("logo_url"),
  notes: text("notes"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finTransactions = pgTable("fin_transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => finAccounts.id, { onDelete: "cascade" }),
  postedDate: date("posted_date").notNull(),
  // Signed cents in the account's native currency. Negative = outflow.
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  // USD equivalent computed at posted_date (for cross-currency aggregation).
  usdAmountCents: integer("usd_amount_cents"),
  description: text("description").notNull(),
  vendorId: uuid("vendor_id").references(() => finVendors.id, {
    onDelete: "set null",
  }),
  categoryId: uuid("category_id").references(() => finCategories.id, {
    onDelete: "set null",
  }),
  // Allocation tags — tie spend to a project (= venture) and optionally a
  // contact (e.g., spend on behalf of a client).
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  source: txnSource("source").notNull().default("manual"),
  // For email-parsed receipts: original message ID for de-dup
  externalRefId: text("external_ref_id"),
  // For transfers between accounts: pairs two transactions
  transferGroupId: uuid("transfer_group_id"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finSubscriptions = pgTable("fin_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => finVendors.id, { onDelete: "cascade" }),
  planName: text("plan_name"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  cycle: subscriptionCycle("cycle").notNull().default("monthly"),
  nextRenewalDate: date("next_renewal_date"),
  startedOn: date("started_on"),
  cancelledOn: date("cancelled_on"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  // Tie subscription to a venture for cost allocation
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  status: subscriptionStatus("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finBudgets = pgTable("fin_budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Month in YYYY-MM-01 form
  periodMonth: date("period_month").notNull(),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => finCategories.id, { onDelete: "cascade" }),
  plannedCents: integer("planned_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const finFxRates = pgTable(
  "fin_fx_rates",
  {
    // Daily mid-market rate. `rate` = how many USD = 1 unit of `currency`.
    // e.g., row for VES on 2026-05-27 might be 0.0000001 (1 VES = $0.0000001).
    currency: text("currency").notNull(),
    rateDate: date("rate_date").notNull(),
    rateUsd: integer("rate_usd_per_million").notNull(), // store as integer micro-USD per unit (×1_000_000)
    source: text("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.currency, t.rateDate] }),
  }),
);

export const finUsageSnapshots = pgTable("fin_usage_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => finVendors.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  metricName: text("metric_name").notNull(), // tokens, requests, gb, bandwidth, etc.
  quantity: integer("quantity").notNull(),
  costCents: integer("cost_cents"),
  currency: text("currency").default("USD"),
  notes: text("notes"),
});

/* ─── Treasury relations ───────────────────────────────────────────────── */

export const finAccountsRelations = relations(finAccounts, ({ many }) => ({
  transactions: many(finTransactions),
}));

export const finTransactionsRelations = relations(
  finTransactions,
  ({ one }) => ({
    account: one(finAccounts, {
      fields: [finTransactions.accountId],
      references: [finAccounts.id],
    }),
    vendor: one(finVendors, {
      fields: [finTransactions.vendorId],
      references: [finVendors.id],
    }),
    category: one(finCategories, {
      fields: [finTransactions.categoryId],
      references: [finCategories.id],
    }),
    project: one(projects, {
      fields: [finTransactions.projectId],
      references: [projects.id],
    }),
  }),
);

export const finVendorsRelations = relations(finVendors, ({ one, many }) => ({
  contact: one(contacts, {
    fields: [finVendors.contactId],
    references: [contacts.id],
  }),
  defaultCategory: one(finCategories, {
    fields: [finVendors.defaultCategoryId],
    references: [finCategories.id],
  }),
  subscriptions: many(finSubscriptions),
  transactions: many(finTransactions),
}));

export const finSubscriptionsRelations = relations(
  finSubscriptions,
  ({ one }) => ({
    vendor: one(finVendors, {
      fields: [finSubscriptions.vendorId],
      references: [finVendors.id],
    }),
    project: one(projects, {
      fields: [finSubscriptions.projectId],
      references: [projects.id],
    }),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// WORK MANAGEMENT — themes, initiatives, sprints (extends milestones)
// ─────────────────────────────────────────────────────────────────────────────

export const themes = pgTable("themes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"), // hex
  icon: text("icon"), // lucide icon name
  description: text("description"),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Functions (FR-E6): the HORIZONTAL categorization that cuts across LoBs
// (Product, Engineering, Growth, Operations, Finance …). LoBs are the verticals;
// functions are the horizontals. Workspace-scoped + user-editable, so a table
// (not an enum). A reserved `uncategorized` slug is the no-orphan fix-me bucket.
export const functions = pgTable(
  "functions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    color: text("color"), // hex accent for the matrix row
    icon: text("icon"), // lucide name
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bySlug: uniqueIndex("functions_workspace_slug_uniq").on(t.workspaceId, t.slug),
  }),
);

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Optional venture (LoB) — initiatives can be cross-venture
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  // FR-E6: horizontal function (cross-LoB). Nullable at the DB level (deploy-safe)
  // but the UX always resolves it to a real or the reserved Uncategorized bucket.
  functionId: uuid("function_id").references(() => functions.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  summary: text("summary"),
  goal: text("goal"), // the why
  status: initiativeStatus("status").notNull().default("planning"),
  priority: workPriority("priority").notNull().default("next"),
  // Manual ordering within a LoB in the roadmap bulk-edit (drag to reorder).
  sortOrder: integer("sort_order").notNull().default(0),
  healthColor: healthColor("health_color").notNull().default("green"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startDate: date("start_date"),
  targetEndDate: date("target_end_date"),
  actualEndDate: date("actual_end_date"),
  notes: text("notes"),
  // FR-PRG-2 — shown on the initiative card, round-trips through Roadmap-MD.
  successCriteria: text("success_criteria"),
  // FR-PLN-4 — outcome recorded at completion: met / partial / missed.
  successOutcome: text("success_outcome"),
  successOutcomeNote: text("success_outcome_note"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// People @-tagged on an initiative in the roadmap. Distinct from the single
// formal owner (initiatives.owner_user_id): an item can carry many tagged
// collaborators. Rows are a derived index — re-synced from the @tokens in the
// initiative title on each title save (mirrors Town Hall's post_mentions),
// and power the "filter roadmap by person" bubble click.
export const initiativePeople = pgTable(
  "initiative_people",
  {
    initiativeId: uuid("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.initiativeId, t.userId] }),
    byUser: index("initiative_people_user_idx").on(t.userId),
  }),
);

// ─── Plan versions (Roadmap Module, FR-PLV-1..3) ─────────────────────────
// One row per export / applied import / plan commit. The md snapshot IS the
// artifact users saw and serves as the 3-way merge base for re-imports.
export const planVersionSource = pgEnum("plan_version_source", [
  "export",
  "import",
  "commit",
]);

export const planVersions = pgTable("plan_versions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  source: planVersionSource("source").notNull(),
  snapshotMd: text("snapshot_md").notNull(),
  note: text("note"),
  summary: jsonb("summary"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sprints = pgTable("sprints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Optional initiative — sprints can be initiative-scoped or workspace-wide
  initiativeId: uuid("initiative_id").references(() => initiatives.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  goal: text("goal"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: sprintStatus("status").notNull().default("planned"),
  retroNotes: text("retro_notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const initiativeThemes = pgTable(
  "initiative_themes",
  {
    initiativeId: uuid("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.initiativeId, t.themeId] }),
  }),
);

// Dependencies between initiatives (roadmap). A row means `to` depends on
// `from` (predecessor → successor); default finish-to-start. Cycles are
// prevented in the action layer.
export const initiativeDependencies = pgTable(
  "initiative_dependencies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fromInitiativeId: uuid("from_initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    toInitiativeId: uuid("to_initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("finish_to_start"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqEdge: uniqueIndex("initiative_dependencies_edge_uniq").on(
      t.fromInitiativeId,
      t.toInitiativeId,
    ),
  }),
);

// many-to-many themes on milestones (existing table)
export const milestoneThemes = pgTable(
  "milestone_themes",
  {
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    themeId: uuid("theme_id")
      .notNull()
      .references(() => themes.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.milestoneId, t.themeId] }),
  }),
);

// A task (milestone) can fall under 1+ initiatives. (milestones.initiativeId stays
// as the convenience "primary"; this join is the source of truth for "all initiatives".)
export const milestoneInitiatives = pgTable(
  "milestone_initiatives",
  {
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    initiativeId: uuid("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.milestoneId, t.initiativeId] }),
  }),
);

// An action item can fall under 1+ initiatives.
export const actionItemInitiatives = pgTable(
  "action_item_initiatives",
  {
    actionItemId: uuid("action_item_id")
      .notNull()
      .references(() => actionItems.id, { onDelete: "cascade" }),
    initiativeId: uuid("initiative_id")
      .notNull()
      .references(() => initiatives.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.actionItemId, t.initiativeId] }),
  }),
);

// DAG of milestone dependencies (blocker → blocked)
export const milestoneDeps = pgTable(
  "milestone_deps",
  {
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
  }),
);

/* ─── Initiative relations ─────────────────────────────────────────────── */

export const themesRelations = relations(themes, ({ many }) => ({
  initiatives: many(initiativeThemes),
  milestones: many(milestoneThemes),
}));

export const initiativesRelations = relations(
  initiatives,
  ({ one, many }) => ({
    lob: one(linesOfBusiness, {
      fields: [initiatives.lobId],
      references: [linesOfBusiness.id],
    }),
    owner: one(users, {
      fields: [initiatives.ownerUserId],
      references: [users.id],
    }),
    themes: many(initiativeThemes),
    sprints: many(sprints),
    people: many(initiativePeople),
  }),
);

export const initiativePeopleRelations = relations(initiativePeople, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [initiativePeople.initiativeId],
    references: [initiatives.id],
  }),
  user: one(users, {
    fields: [initiativePeople.userId],
    references: [users.id],
  }),
}));

export const sprintsRelations = relations(sprints, ({ one }) => ({
  initiative: one(initiatives, {
    fields: [sprints.initiativeId],
    references: [initiatives.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// OVERLORD MIRROR — read-only cache of TOURISM repo's section-*/TASKS.md files
// ─────────────────────────────────────────────────────────────────────────────

export const overlordSections = pgTable("overlord_sections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sectionKey: text("section_key").notNull(), // e.g. "orchestration"
  name: text("name").notNull(), // e.g. "Orchestration"
  filePath: text("file_path").notNull(),
  description: text("description"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const overlordTasks = pgTable("overlord_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => overlordSections.id, { onDelete: "cascade" }),
  taskKey: text("task_key").notNull().unique(), // e.g. TASK-ORCH-119
  title: text("title").notNull(),
  status: overlordStatus("status").notNull().default("todo"),
  priority: overlordPriority("priority"),
  taskType: text("task_type"), // BUGFIX / FEATURE / etc.
  claimedByAgent: text("claimed_by_agent"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  completedByAgent: text("completed_by_agent"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  recommendedModel: text("recommended_model"),
  estTokens: text("est_tokens"),
  complexity: text("complexity"),
  risk: text("risk"),
  parallelSafe: boolean("parallel_safe"),
  dependsOn: text("depends_on"),
  scopePaths: jsonb("scope_paths").$type<string[]>().default([]),
  branch: text("branch"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }),
  createdDate: date("created_date"),
  lastModifiedDate: date("last_modified_date"),
  description: text("description"),
  acceptanceCriteria: jsonb("acceptance_criteria")
    .$type<Array<{ text: string; done: boolean }>>()
    .default([]),
  activityLog: jsonb("activity_log")
    .$type<Array<{ ts: string; agent: string; note: string }>>()
    .default([]),
  rawMarkdown: text("raw_markdown"), // original entry text for fidelity
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const overlordTasksRelations = relations(overlordTasks, ({ one }) => ({
  section: one(overlordSections, {
    fields: [overlordTasks.sectionId],
    references: [overlordSections.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// RESEARCH NOTES — index of Obsidian-style markdown brains on disk
// ─────────────────────────────────────────────────────────────────────────────

export const noteKind = pgEnum("note_kind", ["research", "product", "note"]);

export const researchNotes = pgTable("research_notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  lobId: uuid("lob_id").references(() => linesOfBusiness.id, {
    onDelete: "set null",
  }),
  sourceRoot: text("source_root").notNull(),
  relPath: text("rel_path").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  folder: text("folder"),
  kind: noteKind("kind").notNull().default("note"),
  wordCount: integer("word_count").notNull().default(0),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  lastModified: timestamp("last_modified", { withTimezone: true }),
  contentHash: text("content_hash"),
  indexedAt: timestamp("indexed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// VOICE NOTES + ACTION ITEMS
// Capture: a WhatsApp voice note is transcribed (Whisper) into a voice_notes
// row; the agent extracts action_items from the transcript. View: open items
// surface on the Home dashboard.
// ─────────────────────────────────────────────────────────────────────────────

export const actionItemStatus = pgEnum("action_item_status", ["open", "done"]);

export const voiceNotes = pgTable("voice_notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  transcript: text("transcript").notNull(),
  // WhatsApp number the note came from (raw, as received).
  sourcePhone: text("source_phone"),
  durationSecs: integer("duration_secs"),
  language: text("language"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Durable record of every call recorded via /record. The transcript is saved
// here UNCONDITIONALLY (the prior design only persisted it as a side-effect of a
// unique contact match, so unmatched calls were silently lost). Attaching to a
// contact is secondary — contactId is set when a unique match is found.
export const callRecordings = pgTable("call_recordings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Call"),
  transcript: text("transcript").notNull(),
  // Markdown brief produced by the model; null until extraction completes.
  brief: text("brief"),
  language: text("language"),
  durationSecs: integer("duration_secs"),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  // Back-link to the meeting created for this call (type='call', source='voice').
  // Set by the filing pipeline; null for legacy recordings filed before the link
  // existed. ON DELETE SET NULL — the transcript outlives its meeting.
  meetingId: uuid("meeting_id").references(() => meetings.id, {
    onDelete: "set null",
  }),
  actionItemCount: integer("action_item_count").notNull().default(0),
  // ── Call Capture module (CALL-CAPTURE-MODULE-V1) ──────────────────────────
  // Storage path of the assembled dual-channel WAV; null = no audio (legacy
  // live-transcript recordings, or audio already purged).
  audioPath: text("audio_path"),
  audioBytes: integer("audio_bytes"),
  // FR-CALL-RET-1/2: when audio becomes purgeable / when it was actually purged.
  audioPurgeAt: timestamp("audio_purge_at", { withTimezone: true }),
  audioPurgedAt: timestamp("audio_purged_at", { withTimezone: true }),
  // 1 = legacy mic-only; 2 = dual-channel capture (L=founder, R=participants).
  channels: integer("channels").notNull().default(1),
  sourceApp: text("source_app"),
  // FR-CALL-ATT-1/2: speaker-attributed utterances [{speaker,channel,start,end,text}].
  utterances: jsonb("utterances").$type<
    { speaker: string; channel: number; start: number; end: number; text: string }[]
  >(),
  // FR-CALL-OPS-4: e.g. ["founder_channel_silent","participant_channel_silent"].
  suspectFlags: jsonb("suspect_flags").$type<string[]>(),
  // FR-CALL-RET-5: consent posture note ("participant informed verbally", …).
  consentNote: text("consent_note"),
  // FR-CALL-DST-4: a name was given but matched >1 contact, so none was
  // attached — surfaced so the founder can resolve it rather than guess.
  contactAmbiguous: boolean("contact_ambiguous").notNull().default(false),
  // FR-CALL-OPS-5: true when salvaged from a crashed/incomplete session.
  partial: boolean("partial").notNull().default(false),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const callRecordingsRelations = relations(callRecordings, ({ one }) => ({
  contact: one(contacts, {
    fields: [callRecordings.contactId],
    references: [contacts.id],
  }),
  meeting: one(meetings, {
    fields: [callRecordings.meetingId],
    references: [meetings.id],
  }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// CALL CAPTURE (CALL-CAPTURE-MODULE-V1) — macOS Helper sessions + tokens
// ─────────────────────────────────────────────────────────────────────────────

export const captureSessionStatus = pgEnum("capture_session_status", [
  "recording", // chunks arriving (or expected)
  "finalizing", // assembly/transcription/filing in flight
  "filed", // recording row created, pipeline complete
  "failed", // finalize errored after retries (chunks retained for retry)
  "abandoned", // declined/off-the-record — all artifacts deleted (FR-CALL-TRG-7)
]);

// One row per Helper capture session. Doubles as the NFR-CALL-OBS-1 lifecycle
// record: detected→affirmed is helper-side; everything from session creation on
// is queryable here (status transitions + error + timestamps).
export const captureSessions = pgTable(
  "capture_sessions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    status: captureSessionStatus("status").notNull().default("recording"),
    sourceApp: text("source_app"),
    sampleRate: integer("sample_rate").notNull().default(16000),
    channels: integer("channels").notNull().default(2),
    helperVersion: text("helper_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSecs: integer("duration_secs"),
    // Heartbeat for the crash-salvage sweep (FR-CALL-OPS-5): a session still
    // "recording" whose last chunk is >30 min old gets finalized as partial.
    lastChunkSeq: integer("last_chunk_seq"),
    lastChunkAt: timestamp("last_chunk_at", { withTimezone: true }),
    // Lease timestamp for the `finalizing` claim. Set when finalize is claimed
    // so a crashed finalize (which leaves status stuck at `finalizing`) becomes
    // reclaimable once the lease expires (FINALIZE_LEASE_MINUTES). Without it a
    // session whose finalize OOM'd is wedged forever and the helper loops on
    // 409 "already in progress" indefinitely.
    finalizeStartedAt: timestamp("finalize_started_at", { withTimezone: true }),
    totalChunks: integer("total_chunks"),
    partial: boolean("partial").notNull().default(false),
    recordingId: uuid("recording_id").references(() => callRecordings.id, {
      onDelete: "set null",
    }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    workspaceIdx: index("capture_sessions_workspace_idx").on(
      t.workspaceId,
      t.createdAt,
    ),
    sweepIdx: index("capture_sessions_sweep_idx").on(t.status, t.lastChunkAt),
    // Finds `finalizing` sessions whose lease has expired (crash-wedged).
    finalizeSweepIdx: index("capture_sessions_finalize_sweep_idx").on(
      t.status,
      t.finalizeStartedAt,
    ),
  }),
);

// Revocable bearer credentials for the macOS Helper (NFR-CALL-SEC-2). Only the
// SHA-256 of the token is stored; the plaintext is shown once at mint time.
export const captureTokens = pgTable("capture_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Mac Helper"),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const actionItems = pgTable("action_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  status: actionItemStatus("status").notNull().default("open"),
  dueDate: date("due_date"),
  priority: workPriority("priority"),
  // Provenance: which voice note this was extracted from (null for manual).
  voiceNoteId: uuid("voice_note_id").references(() => voiceNotes.id, {
    onDelete: "set null",
  }),
  // Provenance: which recorded call this was extracted from (null otherwise).
  callRecordingId: uuid("call_recording_id").references(() => callRecordings.id, {
    onDelete: "set null",
  }),
  // Optional links — standalone in v1, attachable later.
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
  // FR-AIT-2/3 (Roadmap Module): optional link to a task — covers both
  // "relates to" and post-promote provenance. Null = unlinked capture.
  milestoneId: uuid("milestone_id").references(() => milestones.id, {
    onDelete: "set null",
  }),
  // FR-PLN-2: stamped when triaged (dismissed) in a planning session.
  planReviewedAt: timestamp("plan_reviewed_at", { withTimezone: true }),
  // FR-PMO: who's responsible (a workspace user). Distinct from contactId.
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// TOWN HALL — workspace feed: posts with @mentions + #references, and
// per-recipient notifications. (FR-TOWNHALL)
// ─────────────────────────────────────────────────────────────────────────────

export const postKind = pgEnum("post_kind", ["message", "note"]);
export const postRefType = pgEnum("post_ref_type", [
  "action_item",
  "milestone",
  "meeting",
  "project",
  "doc",
]);

export const posts = pgTable("posts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  kind: postKind("kind").notNull().default("message"),
  // FR-TOWNHALL: light threading — a reply points at its parent post.
  parentPostId: uuid("parent_post_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const postReactions = pgTable("post_reactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postMentions = pgTable("post_mentions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const postRefs = pgTable("post_refs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: uuid("post_id")
    .notNull()
    .references(() => posts.id, { onDelete: "cascade" }),
  refType: postRefType("ref_type").notNull(),
  refId: uuid("ref_id").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Recipient.
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
  // Who triggered it + what it's about (action_item / milestone / meeting /
  // post). Null entity = legacy post-only notification (use postId).
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  title: text("title"),
  kind: text("kind").notNull().default("mention"),
  readAt: timestamp("read_at", { withTimezone: true }),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL MODULE — first-class company mailboxes, shared inbox workflow, CRM links.
// Microsoft 365 is the production mailbox authority; sandbox rows support local
// deterministic development and E2E tests without real provider credentials.
// ─────────────────────────────────────────────────────────────────────────────

export const emailProviderConnections = pgTable(
  "email_provider_connections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: emailProviderKind("provider").notNull().default("sandbox"),
    domain: text("domain").notNull(),
    status: emailConnectionStatus("status").notNull().default("connected"),
    tenantId: text("tenant_id"),
    providerTenantName: text("provider_tenant_name"),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    webhookClientStateHash: text("webhook_client_state_hash"),
    healthStatus: text("health_status").notNull().default("healthy"),
    healthDetail: text("health_detail"),
    lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
    connectedBy: uuid("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqWorkspaceProviderDomain: uniqueIndex(
      "email_provider_connections_workspace_provider_domain_uniq",
    ).on(t.workspaceId, t.provider, t.domain),
  }),
);

export const emailMailboxes = pgTable(
  "email_mailboxes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerConnectionId: uuid("provider_connection_id")
      .notNull()
      .references(() => emailProviderConnections.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    displayName: text("display_name").notNull(),
    type: emailMailboxType("type").notNull().default("personal"),
    status: emailMailboxStatus("status").notNull().default("active"),
    providerMailboxId: text("provider_mailbox_id").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    sendEnabled: boolean("send_enabled").notNull().default(true),
    aiEnabled: boolean("ai_enabled").notNull().default(false),
    signature: text("signature"),
    providerMetadata: jsonb("provider_metadata")
      .$type<{
        sendAsDeniedUserIds?: string[];
        folders?: string[];
        lastDeltaToken?: string;
        zohoAccountId?: string;
        zohoInboxFolderId?: string;
      }>()
      .notNull()
      .default({}),
    unreadCount: integer("unread_count").notNull().default(0),
    threadCount: integer("thread_count").notNull().default(0),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqWorkspaceAddress: uniqueIndex("email_mailboxes_workspace_address_uniq").on(
      t.workspaceId,
      t.address,
    ),
    uniqWorkspaceProviderMailbox: uniqueIndex(
      "email_mailboxes_workspace_provider_mailbox_uniq",
    ).on(t.workspaceId, t.providerMailboxId),
  }),
);

export const emailMailboxAccess = pgTable(
  "email_mailbox_access",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => emailMailboxes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canView: boolean("can_view").notNull().default(true),
    canReply: boolean("can_reply").notNull().default(false),
    canSendAs: boolean("can_send_as").notNull().default(false),
    canAssign: boolean("can_assign").notNull().default(false),
    canManageAccess: boolean("can_manage_access").notNull().default(false),
    canManageSettings: boolean("can_manage_settings").notNull().default(false),
    grantedBy: uuid("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => ({
    uniqMailboxUser: uniqueIndex("email_mailbox_access_mailbox_user_uniq").on(
      t.mailboxId,
      t.userId,
    ),
  }),
);

export const emailProvisioningRequests = pgTable(
  "email_provisioning_requests",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    providerConnectionId: uuid("provider_connection_id").references(
      () => emailProviderConnections.id,
      { onDelete: "set null" },
    ),
    kind: emailProvisioningKind("kind").notNull(),
    status: emailProvisioningStatus("status").notNull().default("requested"),
    targetEmail: text("target_email").notNull(),
    displayName: text("display_name").notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetMailboxId: uuid("target_mailbox_id").references(() => emailMailboxes.id, {
      onDelete: "set null",
    }),
    requestedBy: uuid("requested_by").references(() => users.id, {
      onDelete: "set null",
    }),
    completedBy: uuid("completed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    desiredAccess: jsonb("desired_access")
      .$type<
        Array<{
          userId: string;
          userEmail?: string;
          fullAccess: boolean;
          sendAs: boolean;
          rights: {
            canView: boolean;
            canReply: boolean;
            canSendAs: boolean;
            canAssign: boolean;
            canManageAccess: boolean;
            canManageSettings: boolean;
          };
        }>
      >()
      .notNull()
      .default([]),
    providerPlan: jsonb("provider_plan")
      .$type<{
        provider?: "sandbox" | "microsoft_365" | "zoho_mail";
        mode?: "automatic" | "manual" | "hybrid";
        manualSteps?: string[];
        notes?: string[];
      }>()
      .notNull()
      .default({}),
    providerResult: jsonb("provider_result")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    providerError: text("provider_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    workspaceStatusIdx: index("email_provisioning_requests_workspace_status_idx").on(
      t.workspaceId,
      t.status,
      t.createdAt,
    ),
    workspaceTargetIdx: index("email_provisioning_requests_workspace_target_idx").on(
      t.workspaceId,
      t.targetEmail,
    ),
  }),
);

export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => emailMailboxes.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject").notNull(),
    status: emailThreadStatus("status").notNull().default("open"),
    assignedToId: uuid("assigned_to_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    isUnread: boolean("is_unread").notNull().default(true),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqMailboxProviderThread: uniqueIndex(
      "email_threads_mailbox_provider_thread_uniq",
    ).on(t.mailboxId, t.providerThreadId),
  }),
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => emailMailboxes.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    internetMessageId: text("internet_message_id"),
    direction: emailMessageDirection("direction").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toRecipients: jsonb("to_recipients").$type<string[]>().notNull().default([]),
    ccRecipients: jsonb("cc_recipients").$type<string[]>().notNull().default([]),
    bccRecipients: jsonb("bcc_recipients").$type<string[]>().notNull().default([]),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    isRead: boolean("is_read").notNull().default(false),
    providerFolder: text("provider_folder").notNull().default("inbox"),
    inReplyTo: text("in_reply_to"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqMailboxProviderMessage: uniqueIndex(
      "email_messages_mailbox_provider_message_uniq",
    ).on(t.mailboxId, t.providerMessageId),
  }),
);

export const emailAttachments = pgTable(
  "email_attachments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    providerAttachmentId: text("provider_attachment_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    storagePath: text("storage_path"),
    isInline: boolean("is_inline").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqMessageProviderAttachment: uniqueIndex(
      "email_attachments_message_provider_attachment_uniq",
    ).on(t.messageId, t.providerAttachmentId),
  }),
);

export const emailDrafts = pgTable("email_drafts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  threadId: uuid("thread_id").references(() => emailThreads.id, {
    onDelete: "cascade",
  }),
  mailboxId: uuid("mailbox_id")
    .notNull()
    .references(() => emailMailboxes.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: emailDraftStatus("status").notNull().default("draft"),
  toRecipients: jsonb("to_recipients").$type<string[]>().notNull().default([]),
  ccRecipients: jsonb("cc_recipients").$type<string[]>().notNull().default([]),
  bccRecipients: jsonb("bcc_recipients").$type<string[]>().notNull().default([]),
  subject: text("subject").notNull(),
  bodyText: text("body_text").notNull(),
  attachmentMetadata: jsonb("attachment_metadata")
    .$type<
      Array<{
        filename: string;
        sizeBytes: number;
        mimeType: string;
        contentBase64?: string;
      }>
    >()
    .notNull()
    .default([]),
  aiGenerated: boolean("ai_generated").notNull().default(false),
  aiMetadata: jsonb("ai_metadata")
    .$type<{
      sourceThreadId?: string;
      citations?: Array<{ messageId: string; sentAt: string | null; label: string }>;
      policy?: string;
    }>()
    .notNull()
    .default({}),
  clientMutationId: text("client_mutation_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailSendJobs = pgTable(
  "email_send_jobs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => emailDrafts.id, {
      onDelete: "set null",
    }),
    mailboxId: uuid("mailbox_id")
      .notNull()
      .references(() => emailMailboxes.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: text("idempotency_key").notNull(),
    status: emailSendJobStatus("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqIdempotencyKey: uniqueIndex("email_send_jobs_idempotency_key_uniq").on(
      t.idempotencyKey,
    ),
  }),
);

export const emailInternalNotes = pgTable("email_internal_notes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => emailThreads.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailThreadCrmLinks = pgTable(
  "email_thread_crm_links",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => emailThreads.id, { onDelete: "cascade" }),
    linkType: emailCrmLinkType("link_type").notNull(),
    refId: uuid("ref_id").notNull(),
    label: text("label").notNull(),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqThreadLink: uniqueIndex("email_thread_crm_links_thread_ref_uniq").on(
      t.threadId,
      t.linkType,
      t.refId,
    ),
  }),
);

export const emailAuditEvents = pgTable("email_audit_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  mailboxId: uuid("mailbox_id").references(() => emailMailboxes.id, {
    onDelete: "set null",
  }),
  threadId: uuid("thread_id").references(() => emailThreads.id, {
    onDelete: "set null",
  }),
  messageId: uuid("message_id").references(() => emailMessages.id, {
    onDelete: "set null",
  }),
  action: text("action").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ─── Priorities / OKRs ──────────────────────────────────────────────────── */
// Quarterly objectives ("Rocks"), each with one owner + measurable key results.
// Key results double as the weekly scorecard (owned numbers, target, red/green).

export const objectiveStatus = pgEnum("objective_status", [
  "on_track",
  "at_risk",
  "off_track",
  "done",
]);

export const objectives = pgTable("objectives", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  // When true the objective is owned by the whole team ("Everyone") and ownerId is null.
  ownerAll: boolean("owner_all").notNull().default(false),
  quarter: text("quarter").notNull(), // e.g. "2026-Q2"
  status: objectiveStatus("status").notNull().default("on_track"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const krDirection = pgEnum("kr_direction", ["higher", "lower"]);

export const keyResults = pgTable("key_results", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  startValue: doublePrecision("start_value").notNull().default(0),
  target: doublePrecision("target").notNull().default(100),
  current: doublePrecision("current").notNull().default(0),
  unit: text("unit"), // "$", "%", "users", null
  direction: krDirection("direction").notNull().default("higher"),
  onScorecard: boolean("on_scorecard").notNull().default(true),
  // Curated headline KPI shown above Town Hall on Home.
  isKpi: boolean("is_kpi").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Weekly review (Level-10): saved notes + a JSON snapshot of the agenda.
export const weeklyReviews = pgTable("weekly_reviews", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  weekOf: date("week_of").notNull(),
  facilitatorId: uuid("facilitator_id").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// WINS board — one row per (workspace, ISO week-Monday) holding the scored
// W-events + daily aggregates for the weekly-review Reel. Written by
// scripts/wins-ingest.ts (Claude CLI usage + AGB-CRM git activity), read by
// /review. Volume-based; no PII beyond commit subjects.
export const winsWeeks = pgTable(
  "wins_weeks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weekOf: date("week_of").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    totals: jsonb("totals").$type<{ w: number; W: number; DUB: number; all: number }>().notNull(),
    days: jsonb("days")
      .$type<{ day: string; commits: number; sessions: number; activeMin: number; tokens: number }[]>()
      .notNull(),
    events: jsonb("events")
      .$type<{ ts: string; day: string; tier: "w" | "W" | "DUB"; source: string; label: string; value: number }[]>()
      .notNull(),
  },
  (t) => ({
    workspaceWeekUniq: uniqueIndex("wins_weeks_workspace_week_uniq").on(t.workspaceId, t.weekOf),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// MCP — Model Context Protocol server. Lets a user connect their Claude Code to
// this CRM over an OAuth 2.1 flow and use a curated set of tools (read context +
// upload info) scoped to their own user + workspace. Tokens are opaque random
// strings stored only as SHA-256 hashes (same pattern as Partner Access), so
// they're revocable and never recoverable from the DB.
// ─────────────────────────────────────────────────────────────────────────────

// Dynamically-registered OAuth clients (RFC 7591). Claude Code registers itself
// the first time a user connects; `id` is the public client_id we hand back.
export const mcpOauthClients = pgTable("mcp_oauth_clients", {
  id: text("id").primaryKey(),
  clientName: text("client_name"),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull().default([]),
  grantTypes: jsonb("grant_types")
    .$type<string[]>()
    .notNull()
    .default(["authorization_code", "refresh_token"]),
  tokenEndpointAuthMethod: text("token_endpoint_auth_method").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Short-lived (~10 min) single-use authorization codes. PKCE S256 challenge is
// bound here at /authorize and verified at /token.
export const mcpAuthCodes = pgTable("mcp_auth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => mcpOauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope").notNull().default("crm.read crm.write"),
  resource: text("resource"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Issued access + refresh tokens (both hashed). One row = one live connection;
// revoking sets `revoked_at` and the MCP route rejects it on the next call.
export const mcpAccessTokens = pgTable("mcp_access_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  accessTokenHash: text("access_token_hash").notNull().unique(),
  refreshTokenHash: text("refresh_token_hash").unique(),
  clientId: text("client_id")
    .notNull()
    .references(() => mcpOauthClients.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  scope: text("scope").notNull().default("crm.read crm.write"),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED REMINDERS — a workspace-wide bulletin board. Distinct from the
// per-user WhatsApp `reminders` table above: every member of the workspace sees
// the same board. Each item can carry tags (global dictionary) and connections
// to contacts ("people"). Author is `created_by`; `done_at` checks it off.
// ─────────────────────────────────────────────────────────────────────────────

export const sharedReminders = pgTable("shared_reminders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  pinned: boolean("pinned").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sharedReminderTags = pgTable(
  "shared_reminder_tags",
  {
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => sharedReminders.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.reminderId, t.tagId] }) }),
);

export const sharedReminderContacts = pgTable(
  "shared_reminder_contacts",
  {
    reminderId: uuid("reminder_id")
      .notNull()
      .references(() => sharedReminders.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.reminderId, t.contactId] }) }),
);

// ── Demo links (Platform Management) ────────────────────────────────────────
// Shareable product demos per platform: a direct deep link (e.g. CaneyCloud's
// `?guia=demo-rapido` guided tours), the demo-account credentials needed to
// reach it, or both. Demo credentials are intentionally plaintext — they are
// made to be handed to prospects; real secrets belong in the vault.
export const demoLinks = pgTable("demo_links", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  /** Matches lib/platforms/config PLATFORMS ids ("caneycloud", "vav") or free text. */
  platformId: text("platform_id").notNull().default("other"),
  label: text("label").notNull(),
  description: text("description"),
  /** The demo deep link. Null = credentials-only entry. */
  url: text("url"),
  /** Demo-account credentials (plaintext by design — see header note). */
  username: text("username"),
  password: text("password"),
  /** How to get in / what the viewer should know ("login first", TTL, etc.). */
  accessNotes: text("access_notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Public sharing: a raw, unguessable token that makes this demo reachable at
  // /demo/<token> as a branded access page. Stored raw (not hashed) so the link
  // can be re-copied anytime — the page only exposes demo creds already plaintext
  // here. Null = not shared. See migration 20260710120000 for the rationale.
  publicAccessToken: text("public_access_token"),
  publicAccessTokenCreatedAt: timestamp("public_access_token_created_at", {
    withTimezone: true,
  }),
  publicAccessLastViewedAt: timestamp("public_access_last_viewed_at", {
    withTimezone: true,
  }),
  publicViewCount: integer("public_view_count").notNull().default(0),
  // Preset background video for the public demo page hero (lib/partner-room-videos).
  heroVideoKey: text("hero_video_key"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ─── Tech Board: product enhancements ──────────────────────────────────────
// A lightweight enhancement/feature item per product (CaneyCloud/VAV/CCA/CRM).
// Can be captured from anywhere via #CCfunc/#VAVfunc/#CCAfunc/#CRMfunc and
// linked to a roadmap initiative/deliverable. See lib/products.ts.
export const enhancements = pgTable("enhancements", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  product: text("product").notNull(), // caney | vav | cca | crm
  title: text("title").notNull(),
  detail: text("detail"),
  status: text("status").notNull().default("idea"), // idea | planned | building | shipped | declined
  priority: text("priority").notNull().default("next"), // now | next | later
  sortOrder: integer("sort_order").notNull().default(0),
  // capture provenance (where a #func tag came from)
  source: text("source").notNull().default("manual"), // manual | townhall | doc | mcp | action_item | roadmap
  sourceRefId: text("source_ref_id"),
  sourceLabel: text("source_label"),
  sourceUrl: text("source_url"),
  // roadmap linkage
  linkedInitiativeId: uuid("linked_initiative_id").references(() => initiatives.id, {
    onDelete: "set null",
  }),
  linkedMilestoneId: uuid("linked_milestone_id").references(() => milestones.id, {
    onDelete: "set null",
  }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
