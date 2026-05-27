import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches } = schema;

export const contactSummary: ToolEntry = {
  definition: {
    name: "contact_summary",
    description:
      "Return a brief on a contact: last 5 touches, organization, relationship.",
    input_schema: {
      type: "object",
      properties: { contact_id: { type: "string" } },
      required: ["contact_id"],
    },
  },
  async execute(input, ctx) {
    const contactId = safeStr(input.contact_id);
    const [c] = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1);
    if (!c) return { ok: false, error: "Contact not found" };
    const recent = await db
      .select({
        channel: touches.channel,
        body: touches.body,
        createdAt: touches.createdAt,
      })
      .from(touches)
      .where(eq(touches.contactId, contactId))
      .orderBy(desc(touches.createdAt))
      .limit(5);
    return {
      ok: true,
      data: {
        name: c.name,
        relationship: c.relationshipType,
        organization: c.organization,
        lastTouchAt: c.lastTouchAt,
        touches: recent.map((t) => ({
          channel: t.channel,
          body: t.body.slice(0, 280),
          at: t.createdAt,
        })),
      },
    };
  },
};
