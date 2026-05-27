/**
 * Reminder helpers: compute the next occurrence for a recurring reminder.
 *
 * Stored shape:
 *   - recur: 'once' | 'daily' | 'weekly' | 'monthly'
 *   - recur_day: weekly 0..6 (Sun..Sat) · monthly 1..31
 *   - recur_time: HH:MM:SS in the owner's timezone
 *
 * `nextOccurrence(now, recur, day, hhmmss, tz)` returns a UTC Date for the
 * next fire after `now`. Reasoning is locale-aware (Intl) so DST + tz edges
 * are handled correctly.
 */

export type Recur = "once" | "daily" | "weekly" | "monthly";

function parseHHMMSS(s: string | null | undefined): {
  h: number;
  m: number;
  s: number;
} {
  if (!s) return { h: 9, m: 0, s: 0 };
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { h: 9, m: 0, s: 0 };
  return { h: +m[1], m: +m[2], s: m[3] ? +m[3] : 0 };
}

/**
 * Construct a Date that represents the given local wall-clock time in `tz`.
 * Uses Intl to extract the tz offset for that date, then constructs the
 * matching UTC Date. Handles DST correctly because we use the offset *at the
 * target instant*, not "now".
 */
function dateAtLocalTime(
  yearLocal: number,
  monthLocal: number, // 1..12
  dayLocal: number,
  h: number,
  m: number,
  s: number,
  tz: string,
): Date {
  // Build the "wall clock" timestamp as if it were UTC. This is wrong by the
  // tz offset, so we measure the offset at that wall-clock and correct.
  const naive = Date.UTC(yearLocal, monthLocal - 1, dayLocal, h, m, s);
  // Format the naive UTC date in the target tz to recover what wall-clock
  // it would map to, then compute the delta.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = wall - naive;
  return new Date(naive - offsetMs);
}

function localYMDInTz(d: Date, tz: string): { y: number; m: number; day: number; weekday: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

export function nextOccurrence(opts: {
  after: Date;
  recur: Recur;
  recurDay: number | null;
  recurTime: string | null; // HH:MM:SS in tz
  tz: string;
}): Date | null {
  if (opts.recur === "once") return null;
  const { h, m, s } = parseHHMMSS(opts.recurTime);
  const { y, m: month, day, weekday } = localYMDInTz(opts.after, opts.tz);

  if (opts.recur === "daily") {
    // Same hh:mm tomorrow (or today if it hasn't happened yet — but for
    // recurring we always want strictly AFTER `after`).
    let candidate = dateAtLocalTime(y, month, day, h, m, s, opts.tz);
    if (candidate <= opts.after) {
      const tomorrow = new Date(opts.after);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const t = localYMDInTz(tomorrow, opts.tz);
      candidate = dateAtLocalTime(t.y, t.m, t.day, h, m, s, opts.tz);
    }
    return candidate;
  }

  if (opts.recur === "weekly") {
    const target = opts.recurDay ?? weekday;
    let daysAhead = (target - weekday + 7) % 7;
    // If today is the target day, push to next week unless the time is still
    // in the future.
    if (daysAhead === 0) {
      const todayCandidate = dateAtLocalTime(y, month, day, h, m, s, opts.tz);
      if (todayCandidate > opts.after) return todayCandidate;
      daysAhead = 7;
    }
    const future = new Date(opts.after);
    future.setUTCDate(future.getUTCDate() + daysAhead);
    const t = localYMDInTz(future, opts.tz);
    return dateAtLocalTime(t.y, t.m, t.day, h, m, s, opts.tz);
  }

  if (opts.recur === "monthly") {
    const target = Math.max(1, Math.min(31, opts.recurDay ?? day));
    // Try this month first; if the target day already passed, advance.
    let candidateY = y;
    let candidateM = month;
    const candidateMaybe = dateAtLocalTime(
      candidateY,
      candidateM,
      target,
      h,
      m,
      s,
      opts.tz,
    );
    if (candidateMaybe > opts.after) return candidateMaybe;
    candidateM += 1;
    if (candidateM > 12) {
      candidateM = 1;
      candidateY += 1;
    }
    // Clamp target day to the last day of that month.
    const lastDay = new Date(Date.UTC(candidateY, candidateM, 0)).getUTCDate();
    return dateAtLocalTime(
      candidateY,
      candidateM,
      Math.min(target, lastDay),
      h,
      m,
      s,
      opts.tz,
    );
  }

  return null;
}
