"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const { touches, contacts } = schema;

const touchInputSchema = z.object({
  contactId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  channel: z.enum([
    "email",
    "whatsapp",
    "call",
    "meeting",
    "voice_memo",
    "manual",
    "obsidian",
  ]),
  body: z.string().min(1, "Body is required").max(2000),
});

export type TouchActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function createTouch(input: unknown): Promise<TouchActionResult> {
  const user = await requireUser();
  const parsed = touchInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  const { contactId, projectId, channel, body } = parsed.data;

  const [row] = await db
    .insert(touches)
    .values({
      contactId,
      lobId: projectId ?? null,
      channel,
      body,
      workspaceId: user.workspaceId,
      createdBy: user.id,
    })
    .returning({ id: touches.id });

  await db
    .update(contacts)
    .set({ lastTouchAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  revalidatePath(`/contacts/${contactId}`);
  if (projectId) revalidatePath(`/projects/${projectId}`);

  return { ok: true, id: row.id };
}
