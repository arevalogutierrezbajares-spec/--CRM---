import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";
import { parseFollowUp } from "./log-touch";

const { contacts, touches, reminders, workspaceMembers, users } = schema;

export const assignContact: ToolEntry = {
  definition: {
    name: "assign_contact",
    description:
      "Assign a contact to a team member for follow-up. Creates a reminder for the assignee " +
      "and logs a touch on the contact. Use 'me' to assign to yourself.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        assignee: {
          type: "string",
          description: "Display name of the team member, or 'me' for yourself",
        },
        note: {
          type: "string",
          description: "Context note for the assignee",
        },
        due_in: {
          type: "string",
          description: "When the follow-up is due, e.g. 'tomorrow', '3 days', 'next Monday'",
        },
      },
      required: ["contact_id", "assignee"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const assigneeRaw = safeStr(input.assignee, 120);
    const note = safeStr(input.note, 500);
    const dueInExpr = safeStr(input.due_in, 60);

    if (!contactId || !assigneeRaw)
      return { ok: false, error: "contact_id and assignee are required" };

    const [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(eq(contacts.id, contactId), eq(contacts.workspaceId, ctx.workspaceId)),
      )
      .limit(1);
    if (!contact) return { ok: false, error: "Contact not found" };

    // Resolve assignee ID
    let assigneeId: string;
    let assigneeName: string;

    if (/^me$/i.test(assigneeRaw.trim())) {
      assigneeId = ctx.userId;
      const [me] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      assigneeName = me?.displayName ?? "you";
    } else {
      // Look up by display name among workspace members
      const [member] = await db
        .select({ userId: workspaceMembers.userId, displayName: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, ctx.workspaceId),
            ilike(users.displayName, `%${assigneeRaw}%`),
          ),
        )
        .limit(1);
      if (!member)
        return { ok: false, error: `No workspace member matching "${assigneeRaw}"` };
      assigneeId = member.userId;
      assigneeName = member.displayName;
    }

    // Resolve due date
    const dueAt = dueInExpr
      ? (parseFollowUp(dueInExpr, ctx.now) ?? new Date(ctx.now.getTime() + 86400000))
      : new Date(ctx.now.getTime() + 86400000); // default: tomorrow

    // Create reminder for assignee
    const subject = note
      ? `Follow up on ${contact.name}: ${note.slice(0, 120)}`
      : `Follow up on ${contact.name}`;

    const [rem] = await db
      .insert(reminders)
      .values({
        workspaceId: ctx.workspaceId,
        forUserId: assigneeId,
        createdBy: ctx.userId,
        subject,
        dueAt,
        recur: "once",
        sourceContactId: contactId,
      })
      .returning({ id: reminders.id });

    // Log touch on contact
    await db.insert(touches).values({
      contactId,
      body: `Assigned to ${assigneeName}${note ? `: ${note}` : ""}`,
      channel: "manual",
      workspaceId: ctx.workspaceId,
      createdBy: ctx.userId,
    });

    await db
      .update(contacts)
      .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
      .where(eq(contacts.id, contactId));

    const dueFriendly = dueAt.toDateString();
    return {
      ok: true,
      data: { reminderId: rem.id, assigneeId, assigneeName },
      speak: `${contact.name} assigned to ${assigneeName} — reminder set for ${dueFriendly}.`,
    };
  },
};
