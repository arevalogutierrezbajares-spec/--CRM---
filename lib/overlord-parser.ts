/**
 * Parser for Operation Overlord's `section-XYZ/TASKS.md` files.
 *
 * Task entry shape (per /Users/tomas/--TOURISM--/005- WIKI/operation-overlord/TASK-TEMPLATE.md):
 *
 *   ### TASK-<SECTION>-<NNN>: <title>
 *
 *   - **Status:** <todo|in_progress|in_review|blocked|completed|cancelled>
 *   - **Priority:** <NOW|NEXT|LATER|BACKLOG>
 *   - **Created:** YYYY-MM-DD
 *   - **Last modified:** YYYY-MM-DD
 *   - **Scope paths:** path1, path2
 *   - **Branch:** feature/...
 *   + optional fields (Task type, Claimed by, Completed by, etc.)
 *
 *   **Description:** ...
 *
 *   **Acceptance criteria:**
 *   - [ ] item
 *   - [x] item done
 *
 *   **Activity log:**
 *   - YYYY-MM-DD HH:MM UTC | AGENT-ID | note text
 *
 *   ---  (entries separated by horizontal rule)
 */

export type ParsedAcceptanceCriterion = { text: string; done: boolean };
export type ParsedActivityEntry = {
  ts: string;
  agent: string;
  note: string;
};

export type ParsedOverlordTask = {
  taskKey: string;
  title: string;
  status: string;
  priority: string | null;
  taskType: string | null;
  claimedByAgent: string | null;
  claimedAt: string | null;
  completedByAgent: string | null;
  completedAt: string | null;
  recommendedModel: string | null;
  estTokens: string | null;
  complexity: string | null;
  risk: string | null;
  parallelSafe: boolean | null;
  dependsOn: string | null;
  scopePaths: string[];
  branch: string | null;
  lastHeartbeat: string | null;
  createdDate: string | null;
  lastModifiedDate: string | null;
  description: string | null;
  acceptanceCriteria: ParsedAcceptanceCriterion[];
  activityLog: ParsedActivityEntry[];
  rawMarkdown: string;
};

const TASK_HEADER_RE = /^###\s+(TASK-[A-Z0-9]+-\d+):\s*(.+)$/;
const META_FIELD_RE = /^[-*]\s+\*\*([^:]+):\*\*\s*(.*)$/;
const CLAIMED_RE = /^([A-Za-z0-9_\-]+)(?:\s*@\s*(.+))?$/;
const AC_ITEM_RE = /^[-*]\s+\[(\s|x|X)\]\s*(.+)$/;
const LOG_ENTRY_RE = /^[-*]\s+(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z|\s+\d{2}:\d{2}\s+UTC)?)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/;

/** Split a TASKS.md file into individual task entries by header + `---` separator. */
function splitTaskEntries(md: string): string[] {
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  let current: string[] = [];
  let inEntry = false;

  for (const line of lines) {
    if (TASK_HEADER_RE.test(line)) {
      if (inEntry && current.length > 0) out.push(current.join("\n").trim());
      current = [line];
      inEntry = true;
    } else if (inEntry) {
      // A standalone `---` separator ends an entry
      if (/^---\s*$/.test(line)) {
        out.push(current.join("\n").trim());
        current = [];
        inEntry = false;
      } else {
        current.push(line);
      }
    }
  }
  if (inEntry && current.length > 0) out.push(current.join("\n").trim());
  return out;
}

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (
    [
      "todo",
      "in_progress",
      "in_review",
      "blocked",
      "completed",
      "cancelled",
    ].includes(s)
  ) {
    return s;
  }
  // Common variants
  if (s === "done") return "completed";
  if (s === "in-progress" || s === "in progress") return "in_progress";
  if (s === "in-review" || s === "review" || s === "in review") return "in_review";
  if (s === "canceled") return "cancelled";
  return "todo";
}

function normalizePriority(raw: string): string | null {
  const s = raw.toUpperCase().trim();
  if (["NOW", "NEXT", "LATER", "BACKLOG"].includes(s)) return s;
  return null;
}

function parseScopePaths(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^`|`$/g, ""))
    .filter(Boolean);
}

function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function parseTimestamp(raw: string): string | null {
  // Accepts: 2026-05-17T14:05:00Z   OR   2026-05-17 14:05 UTC   OR   2026-05-17
  const trimmed = raw.trim();
  // ISO 8601
  const iso = trimmed.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  if (iso) return iso[1];
  // Date + space + time UTC
  const dt = trimmed.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::\d{2})?\s+UTC/i,
  );
  if (dt) return `${dt[1]}T${dt[2]}:00Z`;
  // Date only
  const dateOnly = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) return `${dateOnly[1]}T00:00:00Z`;
  return null;
}

function parseClaimedField(raw: string): {
  agent: string | null;
  ts: string | null;
} {
  const m = raw.match(CLAIMED_RE);
  if (!m) return { agent: null, ts: null };
  return { agent: m[1] ?? null, ts: m[2] ? parseTimestamp(m[2]) : null };
}

export function parseOverlordTaskEntry(
  raw: string,
): ParsedOverlordTask | null {
  const lines = raw.split(/\r?\n/);
  const headerMatch = lines[0]?.match(TASK_HEADER_RE);
  if (!headerMatch) return null;

  const task: ParsedOverlordTask = {
    taskKey: headerMatch[1],
    title: headerMatch[2].trim(),
    status: "todo",
    priority: null,
    taskType: null,
    claimedByAgent: null,
    claimedAt: null,
    completedByAgent: null,
    completedAt: null,
    recommendedModel: null,
    estTokens: null,
    complexity: null,
    risk: null,
    parallelSafe: null,
    dependsOn: null,
    scopePaths: [],
    branch: null,
    lastHeartbeat: null,
    createdDate: null,
    lastModifiedDate: null,
    description: null,
    acceptanceCriteria: [],
    activityLog: [],
    rawMarkdown: raw,
  };

  // ─── Walk top metadata bullets until first **Section:** header ─────
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (
      /^\*\*Description:\*\*|^\*\*Acceptance criteria:\*\*|^\*\*Activity log:\*\*/i.test(
        line.trim(),
      )
    ) {
      break;
    }
    const meta = line.match(META_FIELD_RE);
    if (!meta) continue;
    const key = meta[1].trim().toLowerCase();
    const val = meta[2].trim();
    switch (key) {
      case "status":
        task.status = normalizeStatus(val);
        break;
      case "priority":
        task.priority = normalizePriority(val);
        break;
      case "task type":
        task.taskType = val || null;
        break;
      case "claimed by": {
        const p = parseClaimedField(val);
        task.claimedByAgent = p.agent;
        task.claimedAt = p.ts;
        break;
      }
      case "completed by": {
        const p = parseClaimedField(val);
        task.completedByAgent = p.agent;
        task.completedAt = p.ts;
        break;
      }
      case "recommended model":
        task.recommendedModel = val || null;
        break;
      case "est tokens":
        task.estTokens = val || null;
        break;
      case "complexity":
        task.complexity = val || null;
        break;
      case "risk":
        task.risk = val || null;
        break;
      case "parallel safe":
        task.parallelSafe = /^yes|true/i.test(val);
        break;
      case "depends on":
        task.dependsOn = val === "—" ? null : val || null;
        break;
      case "scope paths":
        task.scopePaths = parseScopePaths(val);
        break;
      case "branch":
        task.branch = val || null;
        break;
      case "last heartbeat":
        task.lastHeartbeat = parseTimestamp(val);
        break;
      case "created":
        task.createdDate = parseDate(val);
        break;
      case "last modified":
        task.lastModifiedDate = parseDate(val);
        break;
    }
  }

  // ─── Section blocks ─────────────────────────────────────────────────
  let section: "description" | "criteria" | "log" | null = null;
  const descBuf: string[] = [];

  for (; i < lines.length; i++) {
    const line = lines[i];
    const trim = line.trim();
    if (/^\*\*Description:\*\*/i.test(trim)) {
      section = "description";
      const inline = trim.replace(/^\*\*Description:\*\*\s*/i, "");
      if (inline) descBuf.push(inline);
      continue;
    }
    if (/^\*\*Acceptance criteria:\*\*/i.test(trim)) {
      section = "criteria";
      continue;
    }
    if (/^\*\*Activity log:\*\*/i.test(trim)) {
      section = "log";
      continue;
    }
    if (section === "description") {
      descBuf.push(line);
    } else if (section === "criteria") {
      const ac = line.match(AC_ITEM_RE);
      if (ac) {
        task.acceptanceCriteria.push({
          text: ac[2].trim(),
          done: /[xX]/.test(ac[1]),
        });
      }
    } else if (section === "log") {
      const entry = line.match(LOG_ENTRY_RE);
      if (entry) {
        task.activityLog.push({
          ts: parseTimestamp(entry[1]) ?? entry[1],
          agent: entry[2].trim(),
          note: entry[3].trim(),
        });
      } else if (line.startsWith("  ") && task.activityLog.length > 0) {
        // Continuation of previous log entry
        task.activityLog[task.activityLog.length - 1].note +=
          "\n" + line.trim();
      }
    }
  }
  task.description = descBuf.join("\n").trim() || null;

  return task;
}

export function parseOverlordTasksFile(md: string): ParsedOverlordTask[] {
  return splitTaskEntries(md)
    .map(parseOverlordTaskEntry)
    .filter((t): t is ParsedOverlordTask => t !== null);
}
