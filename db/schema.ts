import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  date,
  integer,
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
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
