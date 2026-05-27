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

// ─────────────────────────────────────────────────────────────────────────────
// USERS (mirrors auth.users)
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────────────────────────

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: contactType("type").notNull().default("person"),
  organization: text("organization"),
  primaryOrgId: uuid("primary_org_id"),
  relationshipType: relationshipType("relationship_type")
    .notNull()
    .default("prospect"),
  ownerId: uuid("owner_id")
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
// TAGS
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
// PIPELINE TEMPLATES + STAGES
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
  title: text("title").notNull(),
  status: projectStatus("status").notNull().default("active"),
  templateId: text("template_id").references(() => pipelineTemplates.id),
  currentStageId: uuid("current_stage_id").references(() => pipelineStages.id),
  ownerId: uuid("owner_id")
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
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  dueDate: date("due_date"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
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
// MEETINGS (MTG capability area)
// ─────────────────────────────────────────────────────────────────────────────

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
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
  ownedContacts: many(contacts),
  ownedProjects: many(projects),
  ownedMilestones: many(milestones),
  createdTouches: many(touches),
  createdMeetings: many(meetings),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  owner: one(users, {
    fields: [contacts.ownerId],
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
  owner: one(users, {
    fields: [projects.ownerId],
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
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  // Last ~10 turns. Shape: [{role:'user'|'assistant'|'tool', content:any, ts:string}, ...]
  messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
  // Partial intent mid-flow. Cleared on completion or after 30 min idle.
  pendingIntent: jsonb("pending_intent").$type<unknown | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reminders = pgTable("reminders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  subject: text("subject").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  recur: reminderRecur("recur").notNull().default("once"),
  // For weekly: 0=Sun..6=Sat. For monthly: 1..31.
  recurDay: integer("recur_day"),
  // Time of day in owner's timezone (used to compute next due_at).
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
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  senderPhone: text("sender_phone").notNull(),
  direction: waDirection("direction").notNull(),
  // Inbound text, tool call+result, outbound text, etc. JSON for flexibility.
  payload: jsonb("payload").$type<unknown>().notNull(),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  // Cost in tenths of a cent (so 12 = $0.0012). Avoids float drift.
  costMillicents: integer("cost_millicents"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const nudges = pgTable("nudges", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  // Stable identifier per nudge subject — e.g. 'overdue:milestone:<uuid>'.
  // The (owner, signature, day) tuple is used for dedup.
  signature: text("signature").notNull(),
  firedAt: timestamp("fired_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});
