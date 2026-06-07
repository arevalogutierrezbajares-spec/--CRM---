/**
 * upsert_note — create or update a note on one or more contacts.
 *
 * Notes are stored as touches (channel=manual) so no schema migration is
 * needed. Upsert semantics: if a touch by this author with the same title
 * exists on a given contact within the last 24 hours, replace its body;
 * otherwise insert a fresh touch.
 *
 * The agent should call find_contact first to resolve any mentioned names
 * to IDs. Multiple contact_ids are accepted so one "meeting note" can be
 * attached to everyone who was in the room.
 */

import { and, desc, eq, gt, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts, touches } = schema;

export const upsertNote: ToolEntry = {
  definition: {
    name: "upsert_note",
    description:
      "Create or update a note on one or more contacts. " +
      "If a note with the same title was written to a given contact in the last 24 hours by this user, its body is replaced (upsert). " +
      "Otherwise a new note is appended. " +
      "Accepts up to 10 contact_ids so a single note can span multiple attendees. " +
      "Returns a summary of what was created/updated.",
    input_schema: {
      type: "object",
      properties: {
        contact_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of contact UUIDs to attach this note to (1–10 contacts).",
        },
        title: {
          type: "string",
          description: "Short note title (used for upsert matching). Max 200 chars.",
        },
        body: {
          type: "string",
          description: "Full note content. Max 4000 chars.",
        },
        project_id: {
          type: "string",
          description: "Optional project UUID to link this note to.",
        },
      },
      required: ["contact_ids", "body"],
    },
  },

  async execute(input, ctx) {
    const rawIds = Array.isArray(input.contact_ids) ? input.contact_ids : [];
    const contactIds = rawIds.map((id) => safeStr(id)).filter(Boolean).slice(0, 10);
    const title = safeStr(input.title, 200);
    const body = safeStr(input.body, 4000);
    const projectId = safeStr(input.project_id) || null;

    if (contactIds.length === 0) return { ok: false, error: "contact_ids is required" };
    if (!body) return { ok: false, error: "body is required" };

    // Verify all contacts belong to this workspace
    const owned = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(eq(contacts.workspaceId, ctx.workspaceId));

    const ownedMap = new Map(owned.map((c) => [c.id, c.name]));
    const validIds = contactIds.filter((id) => ownedMap.has(id));
    if (validIds.length === 0) return { ok: false, error: "No valid contacts found in this workspace" };

    const cutoff = new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000);
    const results: Array<{ contactName: string; action: "created" | "updated" }> = [];

    for (const contactId of validIds) {
      const contactName = ownedMap.get(contactId) ?? contactId;

      // Look for an existing touch to upsert (same author, same title prefix, last 24h)
      let existingId: string | null = null;
      if (title) {
        const [existing] = await db
          .select({ id: touches.id })
          .from(touches)
          .where(
            and(
              eq(touches.contactId, contactId),
              eq(touches.workspaceId, ctx.workspaceId),
              eq(touches.createdBy, ctx.userId),
              eq(touches.channel, "manual"),
              ilike(touches.body, `[Note: ${title.slice(0, 50)}%`),
              gt(touches.createdAt, cutoff),
            ),
          )
          .orderBy(desc(touches.createdAt))
          .limit(1);
        existingId = existing?.id ?? null;
      }

      const noteBody = title ? `[Note: ${title}]\n${body}` : body;

      if (existingId) {
        await db
          .update(touches)
          .set({ body: noteBody })
          .where(eq(touches.id, existingId));
        results.push({ contactName, action: "updated" });
      } else {
        await db.insert(touches).values({
          contactId,
          workspaceId: ctx.workspaceId,
          createdBy: ctx.userId,
          channel: "manual",
          body: noteBody,
          lobId: projectId as string | null,
        });

        // Bump contact's last_touch_at
        await db
          .update(contacts)
          .set({ lastTouchAt: ctx.now, updatedAt: ctx.now })
          .where(eq(contacts.id, contactId));

        results.push({ contactName, action: "created" });
      }
    }

    const created = results.filter((r) => r.action === "created").map((r) => r.contactName);
    const updated = results.filter((r) => r.action === "updated").map((r) => r.contactName);
    const parts: string[] = [];
    if (created.length) parts.push(`created on ${created.join(", ")}`);
    if (updated.length) parts.push(`updated on ${updated.join(", ")}`);
    const speak = `Note ${parts.join("; ")}.`;

    return { ok: true, data: { results }, speak };
  },
};
