export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
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
      error: "DATABASE_URL not set — finish AGB-000A to load real data.",
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
