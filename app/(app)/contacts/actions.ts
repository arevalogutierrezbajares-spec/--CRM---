"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { updateContactLogo } from "@/db/queries/partner-access";
import { removeObjects } from "@/lib/project-files/storage";
import {
  parseContactFormData,
  type ContactFormInput,
} from "@/lib/validation/contact";

const { contacts, contactChannels, contactTags } = schema;

/**
 * Link-assist: resolve a person's free-text `organization` into a structured
 * org-type contact and set primaryOrgId — matching an existing org by name
 * (case-insensitive) or creating one. Backs the "Link as org" button shown on a
 * contact whose organization is still free text. The bulk equivalent runs as
 * the 20260613160000_backfill_contacts_org_links migration.
 */
export async function resolveContactOrg(
  contactId: string,
): Promise<{ ok: true; orgId: string } | { ok: false; error: string }> {
  const user = await requireUser();

  const [person] = await db
    .select({
      id: contacts.id,
      organization: contacts.organization,
      primaryOrgId: contacts.primaryOrgId,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.workspaceId, user.workspaceId)))
    .limit(1);
  if (!person) return { ok: false, error: "Contact not found" };
  if (person.primaryOrgId) return { ok: true, orgId: person.primaryOrgId };

  const orgName = person.organization?.trim();
  if (!orgName) return { ok: false, error: "No organization to link" };

  const [existing] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, user.workspaceId),
        eq(contacts.type, "org"),
        sql`lower(${contacts.name}) = lower(${orgName})`,
      ),
    )
    .limit(1);

  let orgId = existing?.id;
  if (!orgId) {
    const [created] = await db
      .insert(contacts)
      .values({
        workspaceId: user.workspaceId,
        name: orgName,
        type: "org",
        relationshipType: "partner",
        createdBy: user.id,
      })
      .returning({ id: contacts.id });
    orgId = created.id;
  }

  await db
    .update(contacts)
    .set({ primaryOrgId: orgId, updatedAt: new Date() })
    .where(eq(contacts.id, contactId));

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, orgId };
}

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
      workspaceId: user.workspaceId,
      createdBy: user.id,
      introChainFromText: parsed.introChainFromText ?? null,
      notesPath: parsed.notesPath ?? null,
      primaryOrgId: parsed.primaryOrgId ?? null,
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
      // A contact can't be its own organization.
      primaryOrgId: parsed.primaryOrgId === id ? null : parsed.primaryOrgId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, user.workspaceId)))
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
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, user.workspaceId)))
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
    .where(and(eq(contacts.id, id), eq(contacts.workspaceId, user.workspaceId)))
    .returning({ id: contacts.id });
  if (!row) return { ok: false, error: "Contact not found" };
  revalidatePath("/contacts");
  return { ok: true, id: row.id };
}

/**
 * Set a contact's logo to an external URL, or clear it (null). Upload-based
 * logos go through POST /api/contact-logo/[contactId]; this covers the
 * paste-a-URL and remove cases. Clears the stored object on replace/remove.
 * The logo lives on the contact row, so it stays in sync with partner rooms.
 */
export async function setContactLogo(
  contactId: string,
  logoUrl: string | null,
): Promise<ActionResult> {
  const user = await requireUser();
  const res = await updateContactLogo({
    workspaceId: user.workspaceId,
    contactId,
    logoUrl: logoUrl?.trim() || null,
    logoStoragePath: null,
  });
  if (!res) return { ok: false, error: "Contact not found" };
  if (res.previousPath) await removeObjects([res.previousPath]).catch(() => {});
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, id: contactId };
}

export type BulkResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function bulkArchiveContacts(
  ids: string[],
  archived: boolean,
): Promise<BulkResult> {
  if (ids.length === 0) return { ok: true, count: 0 };
  const user = await requireUser();
  const rows = await db
    .update(contacts)
    .set({ archived, updatedAt: new Date() })
    .where(
      and(
        inArray(contacts.id, ids),
        eq(contacts.workspaceId, user.workspaceId),
      ),
    )
    .returning({ id: contacts.id });
  revalidatePath("/contacts");
  return { ok: true, count: rows.length };
}

/**
 * Adds a tag to many contacts. Uses ON CONFLICT DO NOTHING semantics: we
 * filter out pairs that already exist before inserting, so re-tagging is a
 * no-op rather than an error.
 */
export async function bulkAddTagToContacts(
  contactIds: string[],
  tagId: string,
): Promise<BulkResult> {
  if (contactIds.length === 0) return { ok: true, count: 0 };
  const user = await requireUser();
  // Scope to user's workspace: only operate on contacts the user can see.
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, contactIds),
        eq(contacts.workspaceId, user.workspaceId),
      ),
    );
  const ownedIds = owned.map((r) => r.id);
  if (ownedIds.length === 0) return { ok: true, count: 0 };

  const existing = await db
    .select({ contactId: contactTags.contactId })
    .from(contactTags)
    .where(
      and(
        eq(contactTags.tagId, tagId),
        inArray(contactTags.contactId, ownedIds),
      ),
    );
  const existingSet = new Set(existing.map((r) => r.contactId));
  const toInsert = ownedIds
    .filter((id) => !existingSet.has(id))
    .map((contactId) => ({ contactId, tagId }));

  if (toInsert.length > 0) {
    await db.insert(contactTags).values(toInsert);
  }
  revalidatePath("/contacts");
  return { ok: true, count: ownedIds.length };
}

export async function bulkRemoveTagFromContacts(
  contactIds: string[],
  tagId: string,
): Promise<BulkResult> {
  if (contactIds.length === 0) return { ok: true, count: 0 };
  const user = await requireUser();
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        inArray(contacts.id, contactIds),
        eq(contacts.workspaceId, user.workspaceId),
      ),
    );
  const ownedIds = owned.map((r) => r.id);
  if (ownedIds.length === 0) return { ok: true, count: 0 };

  await db
    .delete(contactTags)
    .where(
      and(
        eq(contactTags.tagId, tagId),
        inArray(contactTags.contactId, ownedIds),
      ),
    );
  revalidatePath("/contacts");
  return { ok: true, count: ownedIds.length };
}
