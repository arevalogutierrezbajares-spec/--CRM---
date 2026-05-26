/** RFC 4180-ish CSV serializer. Handles quotes, commas, newlines. */
export function toCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [headers.map(quote).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => quote(format(row[h]))).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function format(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function quote(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
