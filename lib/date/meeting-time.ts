/**
 * Meeting times are a "floating" wall-clock the operator types in US Eastern.
 * The create form's datetime-local string has no zone, so we store its
 * components pinned to UTC (see wallClockToDate). To show the operator exactly
 * the time they typed — regardless of where the viewer's browser is — we read
 * those UTC components back and label them ET.
 *
 * This keeps all existing rows correct (no migration) and is independent of the
 * server's timezone (Vercel runs UTC, local dev may not).
 */

const ET_TZ = "America/New_York";

/**
 * Times are a floating wall-clock relabeled as Eastern — no real zone
 * conversion happens — so the label stays the neutral "ET" (not EST/EDT).
 */
export const MEETING_TZ_LABEL = "ET";

/**
 * Parse a datetime-local string ("YYYY-MM-DDTHH:MM") as a floating wall-clock,
 * pinned to UTC components so the stored instant never shifts with the server's
 * timezone. Returns null for empty/invalid input.
 */
export function wallClockToDate(local: string | null | undefined): Date | null {
  if (!local) return null;
  const trimmed = local.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return null;
  // Strip any trailing zone, normalize to seconds, force UTC with a Z.
  const bare = trimmed.replace(/(Z|[+-]\d{2}:?\d{2})$/, "");
  const withSecs = bare.length === 16 ? `${bare}:00` : bare;
  const d = new Date(`${withSecs}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Tue, Jun 8" + "9:30 AM" for a stored meeting time, in ET wall-clock terms. */
export function formatMeetingTime(value: Date | string): {
  date: string;
  time: string;
} {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
  return { date, time };
}

/** "Tue, Jun 8 · 9:30 AM ET" one-liner. */
export function formatMeetingDateTime(value: Date | string): string {
  const { date, time } = formatMeetingTime(value);
  return time ? `${date} · ${time} ${MEETING_TZ_LABEL}` : date;
}

/** Just the ET time, e.g. "9:30 AM". */
export function formatMeetingTimeOnly(value: Date | string): string {
  return formatMeetingTime(value).time;
}

/**
 * Convert a real instant (ms) into the "ET wall-clock encoded as UTC" ms — the
 * same encoding meeting times are stored in — so it can be compared/subtracted
 * against scheduledAt directly ("minutes until next meeting", "is it live").
 * Pure given the input ms (no clock read), so it's safe in client render when
 * fed a server-snapshot nowMs.
 */
export function toEtWallMs(realMs: number): number {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: ET_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(realMs));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    let hh = get("hour");
    if (hh === "24") hh = "00"; // some engines emit 24 at midnight
    const ms = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${hh}:${get("minute")}:${get("second")}Z`,
    );
    return Number.isNaN(ms) ? realMs : ms;
  } catch {
    return realMs;
  }
}

/**
 * [from, to) UTC instants spanning a given ET calendar day "YYYY-MM-DD". Meeting
 * times are wall-clock-pinned to UTC, so the right "meetings on day X" window is
 * X's UTC-midnight to the next — NOT the server's local day. Use with
 * gte(from) / lt(to).
 */
export function etDayBoundsUtc(etKey: string): { from: Date; to: Date } {
  const from = new Date(`${etKey}T00:00:00.000Z`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

/** Wall-clock calendar day key "YYYY-MM-DD" for grouping/comparison. */
export function meetingDayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Current ET calendar date "YYYY-MM-DD". MUST be called on the server (it reads
 * the clock) and passed to client components as a prop — the client purity rule
 * forbids new Date() in render.
 */
export function todayEtKey(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: ET_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
