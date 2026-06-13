"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import {
  createTag,
  updateTag,
  deleteTag,
  mergeTags,
} from "@/db/queries/tags";

const { contacts, contactTags, tags } = schema;

/** Venture tags are seeded and load-bearing (pill bar) — block structural edits. */
async function isVentureTag(id: string): Promise<boolean> {
  const [row] = await db
    .select({ kind: tags.kind })
    .from(tags)
    .where(eq(tags.id, id))
    .limit(1);
  return row?.kind === "venture";
}

export type TagActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isPgUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "23505"
  );
}

export async function createTagAction(input: {
  name: string;
  color?: string | null;
  category?: string | null;
}): Promise<TagActionResult> {
  await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Tag name is required" };
  try {
    await createTag({ name, kind: "custom", color: input.color, category: input.category });
  } catch (e) {
    if (isPgUniqueViolation(e)) return { ok: false, error: "A tag with that name already exists" };
    return { ok: false, error: "Could not create tag" };
  }
  revalidatePath("/contacts");
  revalidatePath("/tags");
  return { ok: true };
}

export async function updateTagAction(input: {
  id: string;
  name?: string;
  color?: string | null;
  category?: string | null;
}): Promise<TagActionResult> {
  await requireUser();
  if (input.name !== undefined && !input.name.trim()) {
    return { ok: false, error: "Tag name is required" };
  }
  // Venture tag names are load-bearing (pill bar) — color/category only.
  const patch =
    input.name !== undefined && (await isVentureTag(input.id))
      ? { ...input, name: undefined }
      : input;
  try {
    const row = await updateTag(patch);
    if (!row) return { ok: false, error: "Tag not found" };
  } catch (e) {
    if (isPgUniqueViolation(e)) return { ok: false, error: "A tag with that name already exists" };
    return { ok: false, error: "Could not update tag" };
  }
  revalidatePath("/contacts");
  revalidatePath("/tags");
  return { ok: true };
}

export async function deleteTagAction(id: string): Promise<TagActionResult> {
  await requireUser();
  if (await isVentureTag(id)) {
    return { ok: false, error: "Venture tags can't be deleted" };
  }
  await deleteTag(id);
  revalidatePath("/contacts");
  revalidatePath("/tags");
  return { ok: true };
}

export async function mergeTagsAction(input: {
  fromId: string;
  toId: string;
}): Promise<TagActionResult> {
  await requireUser();
  if (input.fromId === input.toId) return { ok: false, error: "Pick two different tags" };
  if (await isVentureTag(input.fromId)) {
    return { ok: false, error: "Venture tags can't be merged away" };
  }
  await mergeTags(input);
  revalidatePath("/contacts");
  revalidatePath("/tags");
  return { ok: true };
}

/**
 * Add or remove a single tag on a single contact (grid quick-tag). Scoped to
 * the user's workspace.
 */
export async function toggleContactTag(input: {
  contactId: string;
  tagId: string;
}): Promise<TagActionResult> {
  const user = await requireUser();
  const [owned] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);
  if (!owned) return { ok: false, error: "Contact not found" };

  const [existing] = await db
    .select({ contactId: contactTags.contactId })
    .from(contactTags)
    .where(
      and(
        eq(contactTags.contactId, input.contactId),
        eq(contactTags.tagId, input.tagId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .delete(contactTags)
      .where(
        and(
          eq(contactTags.contactId, input.contactId),
          eq(contactTags.tagId, input.tagId),
        ),
      );
  } else {
    await db.insert(contactTags).values({ contactId: input.contactId, tagId: input.tagId });
  }
  revalidatePath("/contacts");
  return { ok: true };
}
