import * as chrono from "chrono-node";

export type ParsedCapture = {
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  assigneeName: string | null; // bare @handle text
  projectName: string | null; // bare #ref text
  priority: "now" | "next" | "later" | "backlog" | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse a free-text capture like
 *   "call Ana tomorrow 3pm @ana #acme urgent"
 * into structured fields. @name → assignee, #ref → project, natural-language
 * dates via chrono, a few priority keywords. The leftover text is the title.
 */
export function parseCapture(raw: string): ParsedCapture {
  let text = ` ${raw.trim()} `;

  const at = text.match(/(?:^|\s)@([\p{L}\p{N}._-]+)/u);
  const assigneeName = at ? at[1] : null;
  const hash = text.match(/(?:^|\s)#([\p{L}\p{N}._-]+)/u);
  const projectName = hash ? hash[1] : null;

  let priority: ParsedCapture["priority"] = null;
  if (/\b(urgent|asap|now|today|critical)\b/i.test(text)) priority = "now";
  else if (/\bnext\b/i.test(text)) priority = "next";
  else if (/\b(later|someday)\b/i.test(text)) priority = "later";

  let dueDate: string | null = null;
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  if (results.length > 0) {
    const d = results[0].start.date();
    dueDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    text = text.replace(results[0].text, " ");
  }

  // Strip @/# tokens + the priority keyword from the title.
  const title = text
    .replace(/(?:^|\s)[@#][\p{L}\p{N}._-]+/gu, " ")
    .replace(/\b(urgent|asap|critical)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title: title || raw.trim(), dueDate, assigneeName, projectName, priority };
}
