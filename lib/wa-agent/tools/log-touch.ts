import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches } = schema;

export const logTouch: ToolEntry = {
  definition: {
    name: "log_touch",
    description:
      "Append a touch (interaction note) to a single contact. Bumps last_touch_at. " +
      "Channels: manual (default), email, whatsapp, call, meeting, voice_memo, obsidian. " +
      "Prefer upsert_note for note-taking on multiple contacts at once.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        body: { type: "string" },
        channel: {
          type: "string",
          enum: [
            "manual",
            "email",
            "whatsapp",
            "call",
            "meeting",
            "voice_memo",
            "obsidian",
          ],
        },
        project_id: { type: "string" },
      },
      required: ["contact_id", "body"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const body = safeStr(input.body, 2000);
    if (!contactId || !body)
      return { ok: false, error: "contact_id and body are required" };

    const [c] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);
    if (!c) return { ok: false, error: "Contact not found" };

    const [row] = await db
      .insert(touches)
      .values({
        contactId,
        body,
        channel:
          (input.channel as
            | "manual"
            | "email"
            | "whatsapp"
            | "call"
            | "meeting"
            | "voice_memo"
            | "obsidian") ?? "manual",
        projectId: (safeStr(input.project_id) || null) as string | null,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning({ id: touches.id });

    await db
      .update(contacts)
      .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
      .where(eq(contacts.id, contactId));

    return {
      ok: true,
      data: { id: row.id, contactName: c.name },
      speak: `Logged touch on ${c.name}.`,
    };
  },
};
