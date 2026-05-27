/**
 * meeting_brief — structured pre-meeting briefing for 1–5 contacts.
 *
 * Pulls recent touches, open reminders, linked projects, and relationship
 * context for each contact so the user walks in fully prepared.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches, reminders, projects, projectContacts, contactChannels } = schema;

export const meetingBrief: ToolEntry = {
  definition: {
    name: "meeting_brief",
    description:
      "Generate a pre-meeting brief for one or more contacts. " +
      "Returns recent interaction history, open reminders, linked projects, " +
      "contact channels, and relationship context. Read-only — no confirmation needed.",
    input_schema: {
      type: "object",
      properties: {
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "Contact UUIDs to brief (1–5).",
        },
        context: {
          type: "string",
          description: "Meeting topic or goal, e.g. 'partnership proposal'.",
        },
      },
      required: ["contact_ids"],
    },
  },

  async execute(input, ctx) {
    const rawIds = Array.isArray(input.contact_ids) ? input.contact_ids : [];
    const contactIds = rawIds.map((id: unknown) => safeStr(id)).filter(Boolean).slice(0, 5);
    const context = safeStr(input.context, 300);

    if (contactIds.length === 0) return { ok: false, error: "contact_ids is required" };

    const briefs: Array<{
      id: string;
      name: string;
      organization: string | null;
      relationshipType: string;
      recentTouches: Array<{ channel: string; when: Date; excerpt: string }>;
      openReminders: Array<{ subject: string; dueAt: Date }>;
      linkedProjects: Array<{ id: string; title: string; status: string }>;
      channels: Array<{ kind: string; value: string; isPrimary: boolean }>;
      introContext: string | null;
    }> = [];

    for (const contactId of contactIds) {
      const [contact] = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          organization: contacts.organization,
          relationshipType: contacts.relationshipType,
          introChainFromText: contacts.introChainFromText,
        })
        .from(contacts)
        .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)))
        .limit(1);

      if (!contact) continue;

      // Last 5 touches
      const recentTouches = await db
        .select({ body: touches.body, channel: touches.channel, createdAt: touches.createdAt })
        .from(touches)
        .where(and(eq(touches.contactId, contactId), eq(touches.workspaceId, ctx.workspaceId)))
        .orderBy(desc(touches.createdAt))
        .limit(5);

      // Open reminders linked to this contact
      const openReminders = await db
        .select({ subject: reminders.subject, dueAt: reminders.dueAt })
        .from(reminders)
        .where(
          and(
            eq(reminders.workspaceId, ctx.workspaceId),
            eq(reminders.sourceContactId, contactId),
            sql`${reminders.firedAt} IS NULL`,
          ),
        )
        .limit(5);

      // Also personal reminders for this user that mention this contact
      const personalReminders = await db
        .select({ subject: reminders.subject, dueAt: reminders.dueAt })
        .from(reminders)
        .where(
          and(
            eq(reminders.forUserId, ctx.userId),
            sql`${reminders.firedAt} IS NULL`,
            sql`lower(${reminders.subject}) LIKE lower('%' || ${contact.name.split(" ")[0]} || '%')`,
          ),
        )
        .limit(3);

      const allReminders = [
        ...openReminders,
        ...personalReminders.filter((p) => !openReminders.some((o) => o.subject === p.subject)),
      ];

      // Linked projects
      const linkedProjects = await db
        .select({ id: projects.id, title: projects.title, status: projects.status })
        .from(projectContacts)
        .innerJoin(projects, eq(projects.id, projectContacts.projectId))
        .where(
          and(
            eq(projectContacts.contactId, contactId),
            eq(projects.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(5);

      // Contact channels
      const channels = await db
        .select({ kind: contactChannels.kind, value: contactChannels.value, isPrimary: contactChannels.isPrimary })
        .from(contactChannels)
        .where(eq(contactChannels.contactId, contactId));

      briefs.push({
        id: contact.id,
        name: contact.name,
        organization: contact.organization,
        relationshipType: contact.relationshipType,
        recentTouches: recentTouches.map((t) => ({
          channel: t.channel,
          when: t.createdAt,
          excerpt: t.body.slice(0, 150),
        })),
        openReminders: allReminders,
        linkedProjects,
        channels,
        introContext: contact.introChainFromText,
      });
    }

    if (briefs.length === 0) return { ok: false, error: "No contacts found" };

    const names = briefs.map((b) => b.name).join(", ");
    const speak = `Brief ready for ${names}${context ? ` — context: ${context}` : ""}.`;

    return { ok: true, data: { briefs, context }, speak };
  },
};
