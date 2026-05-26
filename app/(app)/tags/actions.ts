"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const { tags } = schema;

const tagCreateSchema = z.object({
  name: z
    .string()
    .min(1, "Name required")
    .max(40)
    .regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes only"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a #RRGGBB color")
    .optional()
    .nullable(),
});

export async function createTag(formData: FormData) {
  await requireUser();
  const parsed = tagCreateSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    color: formData.get("color") ? String(formData.get("color")) : null,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  try {
    await db.insert(tags).values({
      name: parsed.data.name,
      kind: "custom",
      color: parsed.data.color ?? null,
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Insert failed",
    };
  }
  revalidatePath("/tags");
  return { ok: true as const };
}

export async function deleteTag(id: string) {
  await requireUser();
  // Don't allow deleting venture tags — they're seeded and load-bearing.
  const [row] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!row) return { ok: false as const, error: "Tag not found" };
  if (row.kind === "venture") {
    return { ok: false as const, error: "Venture tags can't be deleted" };
  }
  await db.delete(tags).where(eq(tags.id, id));
  revalidatePath("/tags");
  return { ok: true as const };
}
