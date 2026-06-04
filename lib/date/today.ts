/**
 * Calendar-date helpers for the user's timezone. `dueDate` columns are Postgres
 * `date` (no zone), so "overdue"/"today" must compare against the user's local
 * calendar date — not the server's UTC date — or a Venezuela user (UTC-4) sees
 * items due *today* flagged overdue all evening.
 */

/** UTC calendar date "YYYY-MM-DD" — the legacy default when no tz is supplied. */
export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Today's calendar date "YYYY-MM-DD" in the given IANA timezone. */
export function todayInTz(tz: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return utcToday();
  }
}

/** Add `days` to a "YYYY-MM-DD" string using pure calendar math (zone-safe). */
export function addDaysToISODate(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
