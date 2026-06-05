// Pure, render-safe formatters for OKR/key-result values. Lives outside the
// "use client" priorities-board so SERVER components (e.g. the Home scorecard)
// can call them without tripping the client/server boundary.

/** Format a KR value with its unit ("$1.2k"-style number + unit suffix). */
export function fmtVal(v: number, unit: string | null): string {
  const n = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(v);
  if (unit === "$") return `$${n}`;
  if (unit === "%") return `${n}%`;
  return unit ? `${n} ${unit}` : n;
}

/** Health-color → human label (green=on track, amber=at risk, red=off track). */
export const HEALTH_LABEL: Record<string, string> = {
  green: "on track",
  amber: "at risk",
  red: "off track",
};
