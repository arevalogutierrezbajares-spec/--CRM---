import { and, desc, eq, gte, or, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const {
  contacts,
  contactChannels,
  touches,
  reminders,
  linesOfBusiness,
  projectContacts,
} = schema;

export const meetingBrief: ToolEntry = {
  definition: {
    name: "meeting_brief",
    description:
      "Generate a pre-meeting brief for one or more contacts. Returns recent interaction " +
      "history, open reminders, linked projects, and contact channels. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "1–5 contact IDs to brief on",
        },
        context: {
          type: "string",
          description: "Meeting context or agenda to focus the brief (optional)",
        },
      },
      required: ["contact_ids"],
    },
  },
  async execute(input, ctx) {
    const ids = Array.isArray(input.contact_ids)
      ? (input.contact_ids as string[]).map((id) => safeStr(id)).filter(Boolean).slice(0, 5)
      : [];
    if (!ids.length)
      return { ok: false, error: "At least one contact_id is required" };

    const context = safeStr(input.context, 300);
    const sections: string[] = [];

    for (const contactId of ids) {
      const [contact] = await db
        .select({
          id: contacts.id,
          name: contacts.name,
          org: contacts.organization,
          rel: contacts.relationshipType,
          lastTouchAt: contacts.lastTouchAt,
        })
        .from(contacts)
        .where(
          and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)),
        )
        .limit(1);
      if (!contact) continue;

      const lines: string[] = [`## ${contact.name}${contact.org ? ` (${contact.org})` : ""}`];
      lines.push(`Relationship: ${contact.rel}`);
      if (contact.lastTouchAt) {
        const days = Math.floor(
          (ctx.now.getTime() - contact.lastTouchAt.getTime()) / 86400000,
        );
        lines.push(`Last touched: ${days === 0 ? "today" : `${days}d ago`}`);
      }

      // Channels
      const channels = await db
        .select({ kind: contactChannels.kind, value: contactChannels.value })
        .from(contactChannels)
        .where(eq(contactChannels.contactId, contactId));
      if (channels.length)
        lines.push(`Channels: ${channels.map((c) => `${c.kind}:${c.value}`).join(", ")}`);

      // Last 5 touches
      const recentTouches = await db
        .select({ body: touches.body, channel: touches.channel, createdAt: touches.createdAt })
        .from(touches)
        .where(
          and(eq(touches.contactId, contactId), eq(touches.workspaceId, ctx.workspaceId)),
        )
        .orderBy(desc(touches.createdAt))
        .limit(5);
      if (recentTouches.length) {
        lines.push("Recent interactions:");
        recentTouches.forEach((t) => {
          const d = t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          lines.push(`  [${d} ${t.channel}] ${t.body.slice(0, 160)}`);
        });
      }

      // Open reminders for this contact
      const openReminders = await db
        .select({ subject: reminders.subject, dueAt: reminders.dueAt })
        .from(reminders)
        .where(
          and(
            eq(reminders.workspaceId, ctx.workspaceId),
            eq(reminders.forUserId, ctx.userId),
            eq(reminders.sourceContactId, contactId),
            gte(reminders.dueAt, ctx.now),
          ),
        )
        .limit(5);

      // Also name-match reminders
      const nameReminders = await db
        .select({ subject: reminders.subject, dueAt: reminders.dueAt })
        .from(reminders)
        .where(
          and(
            eq(reminders.workspaceId, ctx.workspaceId),
            eq(reminders.forUserId, ctx.userId),
            ilike(reminders.subject, `%${contact.name.split(" ")[0]}%`),
            gte(reminders.dueAt, ctx.now),
          ),
        )
        .limit(3);

      const allRem = [...openReminders, ...nameReminders].slice(0, 5);
      if (allRem.length) {
        lines.push("Open reminders:");
        allRem.forEach((r) => {
          const d = r.dueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          lines.push(`  [${d}] ${r.subject}`);
        });
      }

      // Linked projects
      const linkedProjects = await db
        .select({ title: linesOfBusiness.title, status: linesOfBusiness.status })
        .from(linesOfBusiness)
        .innerJoin(projectContacts, eq(projectContacts.lobId, linesOfBusiness.id))
        .where(
          and(
            eq(projectContacts.contactId, contactId),
            eq(linesOfBusiness.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(3);
      if (linkedProjects.length) {
        lines.push("Linked projects:");
        linkedProjects.forEach((p) => lines.push(`  ${p.title} [${p.status}]`));
      }

      sections.push(lines.join("\n"));
    }

    if (!sections.length)
      return { ok: false, error: "No contacts found in this workspace" };

    const contactNames = ids.length === 1
      ? sections[0].split("\n")[0].replace("## ", "")
      : `${ids.length} contacts`;

    return {
      ok: true,
      data: { brief: sections.join("\n\n"), context },
      speak: `Brief ready for ${contactNames}${context ? ` — context: ${context}` : ""}.`,
    };
  },
};
