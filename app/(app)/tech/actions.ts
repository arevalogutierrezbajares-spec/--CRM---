"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { isProductId } from "@/lib/products";
import { captureProductEnhancementsFor } from "@/db/queries/enhancements";

const { enhancements } = schema;

const STATUSES = ["idea", "planned", "building", "shipped", "declined"] as const;
const PRIORITIES = ["now", "next", "later"] as const;

export async function createEnhancement(input: {
  product: string;
  title: string;
  detail?: string | null;
  priority?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireUser();
  if (!isProductId(input.product)) return { ok: false, error: "Unknown product" };
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false, error: "Title required" };
  const priority = (PRIORITIES as readonly string[]).includes(input.priority ?? "")
    ? (input.priority as (typeof PRIORITIES)[number])
    : "next";
  const [row] = await db
    .insert(enhancements)
    .values({
      workspaceId: user.workspaceId,
      product: input.product,
      title: title.slice(0, 280),
      detail: input.detail?.trim() || null,
      status: "idea",
      priority,
      source: "manual",
      createdBy: user.id,
    })
    .returning({ id: enhancements.id });
  revalidatePath("/tech");
  return { ok: true, id: row.id };
}

const patchSchema = z
  .object({
    title: z.string().min(1).max(280).optional(),
    detail: z.string().nullable().optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    linkedInitiativeId: z.string().uuid().nullable().optional(),
    linkedMilestoneId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function updateEnhancement(
  id: string,
  patch: z.infer<typeof patchSchema>,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) throw new Error("Invalid enhancement patch");
  await db
    .update(enhancements)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(enhancements.id, id), eq(enhancements.workspaceId, user.workspaceId)));
  revalidatePath("/tech");
  return { ok: true };
}

export async function deleteEnhancement(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await db
    .delete(enhancements)
    .where(and(eq(enhancements.id, id), eq(enhancements.workspaceId, user.workspaceId)));
  revalidatePath("/tech");
  return { ok: true };
}

/** Server-action wrapper around the #func capture core (for client callers). */
export async function captureEnhancementsAction(input: {
  text: string;
  source: "townhall" | "doc" | "mcp" | "action_item" | "manual";
  sourceRefId?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
}): Promise<{ created: string[] }> {
  const user = await requireUser();
  const r = await captureProductEnhancementsFor({
    workspaceId: user.workspaceId,
    userId: user.id,
    ...input,
  });
  if (r.created.length) revalidatePath("/tech");
  return { created: r.created };
}
