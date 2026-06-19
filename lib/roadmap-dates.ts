/** Roadmap date helpers — loose parsing for fast keyboard entry. */

const pad = (n: number) => String(n).padStart(2, "0");
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** M/D, M/D/YY, M/D/YYYY with / - . separators. No year → this year, or next
 *  year if the date already passed. Returns ISO (YYYY-MM-DD) or null. */
export function parseFlexDate(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const mo = parseInt(m[1], 10);
  const da = parseInt(m[2], 10);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  let yr: number;
  if (m[3]) {
    yr = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
  } else {
    const now = new Date();
    yr = now.getFullYear();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (new Date(yr, mo - 1, da) < today) yr += 1;
  }
  const d = new Date(yr, mo - 1, da);
  if (d.getFullYear() !== yr || d.getMonth() !== mo - 1 || d.getDate() !== da) return null;
  return toIso(d);
}

/** Flexible single-value parse for a date field: accepts a loose date, an
 *  optional eta:/end:/due: prefix, "today"/"tomorrow", and "+2w"/"3d"/"1m". */
export function parseSmartDate(input: string): string | null {
  let s = input.trim().toLowerCase().replace(/^(eta|end|due|start)\s*[:\s]\s*/, "");
  if (!s) return null;
  if (/^(today|tod|now)$/.test(s)) return toIso(new Date());
  if (/^(tomorrow|tom|tmrw)$/.test(s)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toIso(d);
  }
  const rel = s.match(/^\+?\s*(\d+)\s*(d|w|m|day|days|week|weeks|month|months)$/);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const u = rel[2][0];
    const d = new Date();
    if (u === "d") d.setDate(d.getDate() + n);
    else if (u === "w") d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return toIso(d);
  }
  return parseFlexDate(s);
}

/** N business days (Mon–Fri) from `from` (today by default) → ISO. */
export function addBusinessDays(n: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++; // skip Sat/Sun
  }
  return toIso(d);
}

/**
 * Pull date tokens out of a title. Supports two styles:
 *   • `#9/21`  → due date Sept 21 (M/D[/Y])
 *   • `#10`    → due date ten *business* days from today
 *   • legacy `/START 5/4`, `/END 5/4`, `due: 5/4`, `ETA: 5/4`
 */
export function parseDateTokens(raw: string): { title: string; start?: string; end?: string } {
  let start: string | undefined;
  let end: string | undefined;
  const title = raw
    // legacy keyword form
    .replace(
      /(?:\/)?(start|end|eta|due)\s*[:\s]\s*(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/gi,
      (_full, kw: string, dateStr: string) => {
        const iso = parseFlexDate(dateStr);
        if (iso) {
          if (/start/i.test(kw)) start = iso;
          else end = iso;
        }
        return "";
      },
    )
    // #M/D[/Y] → due date
    .replace(/#(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)/g, (full, dateStr: string) => {
      const iso = parseFlexDate(dateStr);
      if (iso) {
        end = iso;
        return "";
      }
      return full;
    })
    // #N → N business days from today (no separator → a plain count)
    .replace(/#(\d{1,3})(?![\d\/\-.])/g, (_full, nStr: string) => {
      end = addBusinessDays(parseInt(nStr, 10));
      return "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  return { title, start, end };
}

export const fmtChip = (iso: string | null | undefined): string | null =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

export const fmtFull = (iso: string | null | undefined): string | null =>
  iso
    ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
