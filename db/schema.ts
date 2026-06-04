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
  primaryOrgId: uuid("primary_org_id"),
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

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
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
  // Self-reference for module/sub-project nesting (e.g. CaneyCloud → Stays/Restaurants/WA Concierge)
  parentProjectId: uuid("parent_project_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
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
  projectId: uuid("project_id").references(() => projects.id, {
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

// FR-PMO: per-user pinned projects for quick access on the Home dashboard.
export const projectPins = pgTable(
  "project_pins",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.projectId] }) }),
);

// FR-PMO: recently-opened projects per user (Home "Recent").
export const projectVisits = pgTable(
  "project_visits",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.projectId] }) }),
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
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("primary"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.contactId] }),
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
  projectId: uuid("project_id").references(() => projects.id, {
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

// ─────────────────────────────────────────────────────────────────────────────
// RELATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(workspaceMembers),
  createdContacts: many(contacts),
  createdProjects: many(projects),
  createdMilestones: many(milestones),
  createdTouches: many(touches),
  createdMeetings: many(meetings),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  contacts: many(contacts),
  projects: many(projects),
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
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  template: one(pipelineTemplates, {
    fields: [projects.templateId],
    references: [pipelineTemplates.id],
  }),
  currentStage: one(pipelineStages, {
    fields: [projects.currentStageId],
    references: [pipelineStages.id],
  }),
  milestones: many(milestones),
  touches: many(touches),
  contactLinks: many(projectContacts),
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
}));

export const pipelineTemplatesRelations = relations(
  pipelineTemplates,
  ({ many }) => ({
    stages: many(pipelineStages),
    projects: many(projects),
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
  sourceProjectId: uuid("source_project_id").references(() => projects.id, {
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

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  // Optional venture (project) — initiatives can be cross-venture
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  summary: text("summary"),
  goal: text("goal"), // the why
  status: initiativeStatus("status").notNull().default("planning"),
  priority: workPriority("priority").notNull().default("next"),
  healthColor: healthColor("health_color").notNull().default("green"),
  ownerUserId: uuid("owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  startDate: date("start_date"),
  targetEndDate: date("target_end_date"),
  actualEndDate: date("actual_end_date"),
  notes: text("notes"),
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
    project: one(projects, {
      fields: [initiatives.projectId],
      references: [projects.id],
    }),
    owner: one(users, {
      fields: [initiatives.ownerUserId],
      references: [users.id],
    }),
    themes: many(initiativeThemes),
    sprints: many(sprints),
  }),
);

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
  projectId: uuid("project_id").references(() => projects.id, {
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
  // Optional links — standalone in v1, attachable later.
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  contactId: uuid("contact_id").references(() => contacts.id, {
    onDelete: "set null",
  }),
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
  kind: text("kind").notNull().default("mention"),
  readAt: timestamp("read_at", { withTimezone: true }),
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
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
