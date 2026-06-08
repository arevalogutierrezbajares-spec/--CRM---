import { getDatabaseUrl } from "@/lib/database-url";

export function isDbConfigured(): boolean {
  try {
    return Boolean(getDatabaseUrl());
  } catch {
    return false;
  }
}

/**
 * Run a DB read and return either the rows or a sentinel telling the UI
 * the DB is unreachable (rather than throwing). Used in list pages so the
 * shell stays browsable before AGB-000A (Supabase wiring) lands.
 */
export async function safeRead<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<{ ok: true; data: T } | { ok: false; data: T; error: string }> {
  if (!isDbConfigured()) {
    return {
      ok: false,
      data: fallback,
      error:
        "DATABASE_URL is missing or does not match this Supabase project. Check .env.local and any global shell DATABASE_URL.",
    };
  }
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return {
      ok: false,
      data: fallback,
      error: e instanceof Error ? e.message : "Database error",
    };
  }
}
