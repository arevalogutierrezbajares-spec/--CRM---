"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

const { users } = schema;

const profileSchema = z.object({
  displayName: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60),
});

export async function updateProfile(formData: FormData) {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    displayName: String(formData.get("displayName") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  // Mirror display name into Supabase user_metadata so the nav reflects it.
  const supabase = await createClient();
  await supabase.auth.updateUser({
    data: { display_name: parsed.data.displayName },
  });

  // Upsert into the public.users mirror table.
  await db
    .insert(users)
    .values({
      id: user.id,
      email: user.email,
      displayName: parsed.data.displayName,
      timezone: parsed.data.timezone,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        displayName: parsed.data.displayName,
        timezone: parsed.data.timezone,
      },
    });

  revalidatePath("/profile");
  return { ok: true as const };
}

export async function getProfile() {
  const user = await requireUser();
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return row ?? null;
}
