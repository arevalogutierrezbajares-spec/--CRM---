"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const {
  sharedReminders,
  sharedReminderTags,
  sharedReminderContacts,
  tags,
  contacts,
} = schema;

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  title: z.string().min(1, "Reminder text is required").max(280),
  body: z.string().max(2000).optional().nullable(),
  // datetime-local value ("YYYY-MM-DDTHH:mm") or empty — parsed leniently below.
  dueAt: z.string().max(40).optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  contactIds: z.array(z.string().uuid()).max(50).optional().default([]),
});

function issues(e: z.ZodError): string {
  return e.issues.map((i) => i.message).join("; ");
}

export async function createSharedReminder(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issues(parsed.error) };
  const { title, body, dueAt, tags: tagNames, contactIds } = parsed.data;

  let due: Date | null = null;
  if (dueAt) {
    const d = new Date(dueAt);
    if (!Number.isNaN(d.getTime())) due = d;
  }

  const cleanTags = Array.from(
    new Set(tagNames.map((t) => t.trim()).filter(Boolean)),
  );

  // Only attach contacts that actually belong to this workspace.
  let validContactIds: string[] = [];
  if (contactIds.length) {
    const rows = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, user.workspaceId),
          inArray(contacts.id, contactIds),
        ),
      );
    validContactIds = rows.map((r) => r.id);
  }

  const id = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sharedReminders)
      .values({
        workspaceId: user.workspaceId,
        title: title.trim(),
        body: body?.trim() || null,
        dueAt: due,
        createdBy: user.id,
      })
      .returning({ id: sharedReminders.id });

    if (cleanTags.length) {
      await tx
        .insert(tags)
        .values(cleanTags.map((name) => ({ name, kind: "custom" as const })))
        .onConflictDoNothing();
      const tagRows = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.name, cleanTags));
      if (tagRows.length) {
        await tx
          .insert(sharedReminderTags)
          .values(tagRows.map((t) => ({ reminderId: row.id, tagId: t.id })))
          .onConflictDoNothing();
      }
    }

    if (validContactIds.length) {
      await tx
        .insert(sharedReminderContacts)
        .values(validContactIds.map((cid) => ({ reminderId: row.id, contactId: cid })))
        .onConflictDoNothing();
    }

    return row.id;
  });

  revalidatePath("/reminders");
  return { ok: true, id };
}

export async function toggleReminderDone(input: {
  id: string;
  done: boolean;
}): Promise<SimpleResult> {
  const user = await requireUser();
  const id = String(input?.id ?? "");
  if (!id) return { ok: false, error: "Missing reminder id" };
  await db
    .update(sharedReminders)
    .set({ doneAt: input.done ? new Date() : null, updatedAt: new Date() })
    .where(
      and(
        eq(sharedReminders.id, id),
        eq(sharedReminders.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/reminders");
  return { ok: true };
}

export async function toggleReminderPin(input: {
  id: string;
  pinned: boolean;
}): Promise<SimpleResult> {
  const user = await requireUser();
  const id = String(input?.id ?? "");
  if (!id) return { ok: false, error: "Missing reminder id" };
  await db
    .update(sharedReminders)
    .set({ pinned: input.pinned, updatedAt: new Date() })
    .where(
      and(
        eq(sharedReminders.id, id),
        eq(sharedReminders.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/reminders");
  return { ok: true };
}

export async function deleteSharedReminder(input: {
  id: string;
}): Promise<SimpleResult> {
  const user = await requireUser();
  const id = String(input?.id ?? "");
  if (!id) return { ok: false, error: "Missing reminder id" };
  await db
    .delete(sharedReminders)
    .where(
      and(
        eq(sharedReminders.id, id),
        eq(sharedReminders.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/reminders");
  return { ok: true };
}
