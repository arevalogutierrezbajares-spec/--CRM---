/**
 * assign_contact — assign a contact to a specific team member.
 *
 * Creates a reminder for the assignee and logs a touch on the contact.
 * Resolves assignee by display name or "me" → the calling user.
 */

import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches, reminders, users, workspaceMembers } = schema;

export const assignContact: ToolEntry = {
  definition: {
    name: "assign_contact",
    description:
      "Assign a contact to a team member for follow-up. " +
      "Creates a reminder for the assignee and logs a touch on the contact. " +
      "Use 'me' to assign to yourself, or a name like 'Joe' or 'Tomas'.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        assignee: {
          type: "string",
          description: "Who to assign to: 'me', 'joe', 'tomas', or a partial display name.",
        },
        note: {
          type: "string",
          description: "Optional context for the assignment, e.g. 'she runs a hotel connector network'.",
        },
        due_in: {
          type: "string",
          description: "When the follow-up should happen, e.g. '3 days', 'next week'. Default: tomorrow.",
        },
      },
      required: ["contact_id", "assignee"],
    },
  },

  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const assigneeRaw = safeStr(input.assignee, 100).toLowerCase().trim();
    const note = safeStr(input.note, 500);
    const dueInExpr = safeStr(input.due_in) || "tomorrow";

    if (!contactId) return { ok: false, error: "contact_id is required" };
    if (!assigneeRaw) return { ok: false, error: "assignee is required" };

    // Resolve contact
    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)))
      .limit(1);

    if (!contact) return { ok: false, error: "Contact not found" };

    // Resolve assignee user
    let assigneeUserId: string;
    let assigneeName: string;

    if (assigneeRaw === "me") {
      assigneeUserId = ctx.userId;
      const [me] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      assigneeName = me?.displayName ?? "you";
    } else {
      // Find workspace member by partial name match
      const members = await db
        .select({ userId: workspaceMembers.userId, displayName: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            ilike(users.displayName, `%${assigneeRaw}%`),
          ),
        )
        .limit(3);

      if (members.length === 0) {
        return { ok: false, error: `No workspace member matched "${assigneeRaw}". Try "me", "joe", or "tomas".` };
      }
      if (members.length > 1) {
        const names = members.map((m) => m.displayName).join(", ");
        return { ok: false, error: `Ambiguous assignee: ${names}. Be more specific.` };
      }
      assigneeUserId = members[0].userId;
      assigneeName = members[0].displayName;
    }

    // Compute due date
    const dueAt = parseFollowUp(dueInExpr, ctx.now);
    if (!dueAt) return { ok: false, error: `Couldn't parse follow-up time: "${dueInExpr}"` };

    // Create reminder for assignee
    const reminderSubject = note
      ? `Reach out to ${contact.name} — ${note.slice(0, 80)}`
      : `Reach out to ${contact.name}`;

    const [rem] = await db
      .insert(reminders)
      .values({
        workspaceId: ctx.workspaceId,
        forUserId: assigneeUserId,
        createdBy: ctx.userId,
        subject: reminderSubject,
        dueAt,
        recur: "once",
        sourceContactId: contactId,
      })
      .returning({ id: reminders.id });

    // Log touch on the contact
    const touchBody = assigneeUserId === ctx.userId
      ? `[Assigned to self] ${note || "Follow-up scheduled."}`
      : `[Assigned to ${assigneeName}] ${note || "Follow-up scheduled."}`;

    await db.insert(touches).values({
      contactId,
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
      channel: "manual",
      body: touchBody,
    });

    await db
      .update(contacts)
      .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
      .where(eq(contacts.id, contactId));

    return {
      ok: true,
      data: { reminderId: rem.id, assigneeUserId, assigneeName, dueAt },
      speak: `${contact.name} assigned to ${assigneeName} — reminder set for ${dueAt.toDateString()}.`,
    };
  },
};

function parseFollowUp(expr: string, now: Date): Date | null {
  const lower = expr.toLowerCase().trim();
  const d = new Date(now);

  const nDays = lower.match(/^(\d+)\s*day/);
  if (nDays) { d.setDate(d.getDate() + parseInt(nDays[1])); d.setHours(9, 0, 0, 0); return d; }

  const nWeeks = lower.match(/^(\d+)\s*week/);
  if (nWeeks) { d.setDate(d.getDate() + parseInt(nWeeks[1]) * 7); d.setHours(9, 0, 0, 0); return d; }

  const nMonths = lower.match(/^(\d+)\s*month/);
  if (nMonths) { d.setMonth(d.getMonth() + parseInt(nMonths[1])); d.setHours(9, 0, 0, 0); return d; }

  if (lower.includes("tomorrow")) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }
  if (lower.includes("next week")) { d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return d; }

  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const dayMatch = dayNames.findIndex((day) => lower.includes(day));
  if (dayMatch >= 0) {
    const todayDay = d.getDay();
    let diff = dayMatch - todayDay;
    if (diff <= 0) diff += 7;
    d.setDate(d.getDate() + diff);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  return null;
}
