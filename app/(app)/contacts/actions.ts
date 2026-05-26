"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  parseContactFormData,
  type ContactFormInput,
} from "@/lib/validation/contact";

const { contacts, contactChannels, contactTags } = schema;

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

async function syncChannels(contactId: string, input: ContactFormInput["channels"]) {
  await db.delete(contactChannels).where(eq(contactChannels.contactId, contactId));
  if (!input || input.length === 0) return;

  // Compute is_primary per kind: first occurrence of each kind wins.
  const seenKind = new Set<string>();
  const rows = input.map((c) => {
    const isPrimary = !seenKind.has(c.kind);
    seenKind.add(c.kind);
    return {
      contactId,
      kind: c.kind,
      value: c.value.trim(),
      isPrimary,
    };
  });
  await db.insert(contactChannels).values(rows);
}

async function syncTags(contactId: string, tagIds: string[]) {
  await db.delete(contactTags).where(eq(contactTags.contactId, contactId));
  if (tagIds.length === 0) return;
  await db
    .insert(contactTags)
    .values(tagIds.map((tagId) => ({ contactId, tagId })));
}

export async function createContact(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: ContactFormInput;
  try {
    parsed = parseContactFormData(formData);
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    return { ok: false, error: "Invalid input" };
  }

  const [inserted] = await db
    .insert(contacts)
    .values({
      name: parsed.name,
      type: parsed.type,
      organization: parsed.organization ?? null,
      relationshipType: parsed.relationshipType,
      ownerId: user.id,
      introChainFromText: parsed.introChainFromText ?? null,
      notesPath: parsed.notesPath ?? null,
    })
    .returning({ id: contacts.id });

  await Promise.all([
    syncChannels(inserted.id, parsed.channels),
    syncTags(inserted.id, parsed.tagIds),
  ]);

  revalidatePath("/contacts");
  redirect(`/contacts/${inserted.id}`);
}

export async function updateContact(
  id: string,
  _: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser();
  let parsed: ContactFormInput;
  try {
    parsed = parseContactFormData(formData);
  } catch (e) {
    if (e instanceof Error) return { ok: false, error: e.message };
    return { ok: false, error: "Invalid input" };
  }

  const [updated] = await db
    .update(contacts)
    .set({
      name: parsed.name,
      type: parsed.type,
      organization: parsed.organization ?? null,
      relationshipType: parsed.relationshipType,
      introChainFromText: parsed.introChainFromText ?? null,
      notesPath: parsed.notesPath ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, user.id)))
    .returning({ id: contacts.id });

  if (!updated) return { ok: false, error: "Contact not found" };

  await Promise.all([
    syncChannels(updated.id, parsed.channels),
    syncTags(updated.id, parsed.tagIds),
  ]);

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  return { ok: true, id: updated.id };
}

export async function archiveContact(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const [row] = await db
    .update(contacts)
    .set({ archived: true, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, user.id)))
    .returning({ id: contacts.id });
  if (!row) return { ok: false, error: "Contact not found" };
  revalidatePath("/contacts");
  return { ok: true, id: row.id };
}

export async function unarchiveContact(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const [row] = await db
    .update(contacts)
    .set({ archived: false, updatedAt: new Date() })
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, user.id)))
    .returning({ id: contacts.id });
  if (!row) return { ok: false, error: "Contact not found" };
  revalidatePath("/contacts");
  return { ok: true, id: row.id };
}
