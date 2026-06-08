"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

const { users, mcpAccessTokens, mcpOauthClients } = schema;

const profileSchema = z.object({
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60),
  whatsappPhone: z
    .string()
    .max(32)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : null)),
});

function normalizePhone(p: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: String(formData.get("displayName") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
    whatsappPhone: String(formData.get("whatsappPhone") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { display_name: parsed.data.displayName },
  });

  await db
    .update(users)
    .set({
      displayName: parsed.data.displayName,
      timezone: parsed.data.timezone,
      whatsappPhone: normalizePhone(parsed.data.whatsappPhone ?? null),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/profile");
  return { ok: true as const };
}

export async function getProfile() {
  const user = await requireUser();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return row ?? null;
}

/** Live Claude Code / MCP connections for the signed-in user. */
export async function listMcpConnections() {
  const user = await requireUser();
  return db
    .select({
      id: mcpAccessTokens.id,
      clientName: mcpOauthClients.clientName,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      createdAt: mcpAccessTokens.createdAt,
    })
    .from(mcpAccessTokens)
    .leftJoin(mcpOauthClients, eq(mcpAccessTokens.clientId, mcpOauthClients.id))
    .where(
      and(eq(mcpAccessTokens.userId, user.id), isNull(mcpAccessTokens.revokedAt)),
    )
    .orderBy(desc(mcpAccessTokens.createdAt));
}

/** Revoke a single MCP connection (the next tool call from it gets a 401). */
export async function revokeMcpConnection(id: string) {
  const user = await requireUser();
  await db
    .update(mcpAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpAccessTokens.id, id), eq(mcpAccessTokens.userId, user.id)));
  revalidatePath("/profile");
  return { ok: true as const };
}
