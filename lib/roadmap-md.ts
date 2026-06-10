/**
 * Roadmap-MD v1 — parser / generator / 3-way differ.
 *
 * Implements the Capability Contract in docs/requirements/ROADMAP-MODULE-V1.md §9.
 * Pure functions only (no DB, no Next) so the whole round-trip is unit-testable:
 *   generateRoadmapMd(snapshot)  → markdown            (FR-RMD-1/2)
 *   parseRoadmapMd(text)         → parsed doc + report (FR-RMD-3/11)
 *   diffRoadmap(parsed, current, base) → change set    (FR-RMD-4..10, 12)
 *
 * Invariants honored here: round-trip identity (NFR-R6), parser never throws
 * (NFR-R7), tokens are short opaque prefixes — never full DB UUIDs (NFR-R3),
 * archive proposals default unaccepted (INV-9), CRM-wins conflicts (FR-RMD-8).
 */

export const ROADMAP_MD_FORMAT_VERSION = 1;

/* ─── Shared node shapes ──────────────────────────────────────────────── */

export type RoadmapTaskNode = {
  /** Full DB id (snapshot) or null (parsed new item). */
  id: string | null;
  /** Short token as found in the md (without the agb:ms_ prefix), if any. */
  token: string | null;
  title: string;
  done: boolean;
  ownerHandle: string | null;
  dueDate: string | null; // YYYY-MM-DD
  children: RoadmapTaskNode[];
};

export type RoadmapInitiativeNode = {
  id: string | null;
  token: string | null;
  title: string;
  ownerHandle: string | null;
  status: string | null; // planning | active | paused | done | cancelled
  health: string | null; // green | amber | red
  startDate: string | null;
  targetEndDate: string | null;
  successCriteria: string | null;
  goal: string | null;
  tasks: RoadmapTaskNode[];
};

export type RoadmapSnapshot = {
  initiatives: RoadmapInitiativeNode[];
};

export type ParseIssue = { line: number; message: string };

export type ParsedRoadmap = {
  formatVersion: number | null;
  basePlanVersion: number | null;
  initiatives: RoadmapInitiativeNode[];
  issues: ParseIssue[];
};

/* ─── Tokens ──────────────────────────────────────────────────────────── */

const TOKEN_LEN = 12;

/** Opaque short token derived from a DB id — never the raw UUID (NFR-R3). */
export function tokenFor(id: string): string {
  return id.replace(/-/g, "").slice(0, TOKEN_LEN);
}

function matchesToken(id: string, token: string): boolean {
  return id.replace(/-/g, "").startsWith(token);
}

/** A stored snapshot md carries tokens, not full ids. Resolve them against a
 *  live snapshot's ids so snapshot-vs-snapshot comparisons work on ids. */
export function resolveSnapshotTokens(
  parsedInits: RoadmapInitiativeNode[],
  current: RoadmapSnapshot,
): RoadmapSnapshot {
  const allCurrentIds: string[] = [];
  const walkIds = (ts: RoadmapTaskNode[]) => {
    for (const t of ts) {
      if (t.id) allCurrentIds.push(t.id);
      walkIds(t.children);
    }
  };
  for (const ci of current.initiatives) {
    if (ci.id) allCurrentIds.push(ci.id);
    walkIds(ci.tasks);
  }
  const byPrefix = (token: string | null) =>
    token
      ? (allCurrentIds.find((id) => id.replace(/-/g, "").startsWith(token)) ?? null)
      : null;

  const mapTask = (t: RoadmapTaskNode): RoadmapTaskNode => ({
    ...t,
    id: t.id ?? byPrefix(t.token),
    children: t.children.map(mapTask),
  });
  return {
    initiatives: parsedInits.map((bi) => ({
      ...bi,
      id: bi.id ?? byPrefix(bi.token),
      tasks: bi.tasks.map(mapTask),
    })),
  };
}

/* ─── Generator (FR-RMD-1) ────────────────────────────────────────────── */

export type GenerateOptions = {
  planVersion: number;
  title?: string;
  /** Omit agb: ID comments (status-report flavor, FR-SHR-2). */
  includeIds?: boolean;
};

function taskLine(t: RoadmapTaskNode, depth: number, includeIds: boolean): string[] {
  const indent = "  ".repeat(depth);
  const box = t.done ? "[x]" : "[ ]";
  let line = `${indent}- ${box} ${t.title}`;
  if (t.ownerHandle) line += ` @${t.ownerHandle}`;
  if (t.dueDate) line += ` due:${t.dueDate}`;
  if (includeIds && t.id) line += ` <!-- agb:ms_${tokenFor(t.id)} -->`;
  const lines = [line];
  for (const c of t.children) lines.push(...taskLine(c, depth + 1, includeIds));
  return lines;
}

export function generateRoadmapMd(
  snapshot: RoadmapSnapshot,
  opts: GenerateOptions,
): string {
  const includeIds = opts.includeIds !== false;
  const out: string[] = [];
  out.push(
    `<!-- AGB-ROADMAP-MD v${ROADMAP_MD_FORMAT_VERSION} · plan:v${opts.planVersion} -->`,
  );
  if (includeIds) {
    out.push(
      `<!-- AI INSTRUCTIONS: Edit freely. PRESERVE every "agb:" comment exactly where it`,
      `     appears — it identifies the item. New items: just write them without a comment.`,
      `     Do not invent agb: IDs. Only titles are required; all other lines optional. -->`,
    );
  }
  out.push("");
  out.push(`# ${opts.title ?? "Roadmap"}`);

  for (const init of snapshot.initiatives) {
    out.push("");
    let heading = `## ${init.title}`;
    if (includeIds && init.id) heading += ` <!-- agb:in_${tokenFor(init.id)} -->`;
    out.push(heading);

    if (init.ownerHandle) out.push(`- Owner: @${init.ownerHandle}`);
    if (init.status) out.push(`- Status: ${init.status}`);
    if (init.health) out.push(`- Health: ${init.health}`);
    if (init.startDate || init.targetEndDate) {
      out.push(`- Dates: ${init.startDate ?? "?"} → ${init.targetEndDate ?? "?"}`);
    }
    if (init.successCriteria) out.push(`- Success: ${init.successCriteria}`);
    if (init.goal) out.push(`- Goal: ${init.goal}`);

    if (init.tasks.length > 0) out.push("");
    for (const t of init.tasks) out.push(...taskLine(t, 0, includeIds));
  }
  out.push("");
  return out.join("\n");
}

/* ─── Copy-for-AI payload (FR-RMD-2) ──────────────────────────────────── */

export const ROADMAP_MD_SPEC = `Roadmap-MD v1 format (one page):
- First line: <!-- AGB-ROADMAP-MD v1 · plan:vN --> — keep it; it declares the base plan version.
- "# Title" once at the top.
- Each initiative is a "## Heading". Optional metadata lines directly under it:
  - Owner: @handle
  - Status: planning | active | paused | done | cancelled
  - Health: green | amber | red
  - Dates: YYYY-MM-DD → YYYY-MM-DD   (start → target; "?" allowed)
  - Success: free text success criteria
  - Goal: one-line why
- Tasks are checkbox list items under the initiative: "- [ ] Title" / "- [x] Title".
  Optional inline: @handle and due:YYYY-MM-DD. Nest children with 2-space indent
  (max 2 levels below the initiative). A parent task with children is a deliverable.
- Comments like <!-- agb:in_xxx --> / <!-- agb:ms_xxx --> identify existing items.
  PRESERVE them exactly. New items: write them WITHOUT a comment. Never invent IDs.
- Only titles are required. Everything else is optional.
- Items you delete from the file are proposed for archiving (never auto-deleted).`;

export function buildCopyForAiPayload(exportMd: string): string {
  return [
    "You are editing a company roadmap. Below is (1) the format spec and (2) the",
    "current roadmap. Apply the changes I describe, then return the COMPLETE",
    "updated markdown document — same format, all agb: comments preserved.",
    "",
    "----- FORMAT SPEC -----",
    ROADMAP_MD_SPEC,
    "",
    "----- CURRENT ROADMAP -----",
    exportMd,
  ].join("\n");
}

/* ─── Parser (FR-RMD-3/5/11/12) ───────────────────────────────────────── */

const HEADER_RE = /<!--\s*AGB-ROADMAP-MD\s+v(\d+)(?:\s*·\s*plan:v(\d+))?/i;
const INIT_ID_RE = /<!--\s*agb:in_([a-f0-9]+)\s*-->/i;
const TASK_ID_RE = /<!--\s*agb:ms_([a-f0-9]+)\s*-->/i;
const CHECKBOX_RE = /^(\s*)- \[( |x|X)\]\s+(.*)$/;
const META_RE = /^-\s*([A-Za-z][A-Za-z ]{0,20}):\s*(.*)$/;
const DUE_RE = /\bdue:(\d{4}-\d{2}-\d{2})\b/;
const OWNER_RE = /(?:^|\s)@([\w.\-]+)/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const KNOWN_META = new Set(["owner", "status", "health", "dates", "success", "goal"]);
const VALID_STATUS = new Set(["planning", "active", "paused", "done", "cancelled"]);
const VALID_HEALTH = new Set(["green", "amber", "red"]);

function stripComments(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "").trim();
}

export function parseRoadmapMd(text: string): ParsedRoadmap {
  const issues: ParseIssue[] = [];
  const initiatives: RoadmapInitiativeNode[] = [];

  let formatVersion: number | null = null;
  let basePlanVersion: number | null = null;

  const header = text.match(HEADER_RE);
  if (header) {
    formatVersion = parseInt(header[1], 10);
    if (header[2]) basePlanVersion = parseInt(header[2], 10);
  }

  let current: RoadmapInitiativeNode | null = null;
  // Stack of (depth, node) for nesting; depth 0 = direct child of initiative.
  let stack: Array<{ depth: number; node: RoadmapTaskNode }> = [];
  let seenTaskInCurrent = false;

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^<!--/.test(line.trim()) && !line.includes("agb:")) continue; // header/AI comments
    if (/^#\s/.test(line.trim())) continue; // document title

    /* Initiative heading */
    if (/^##\s+/.test(line)) {
      const idMatch = line.match(INIT_ID_RE);
      const title = stripComments(line.replace(/^##\s+/, ""));
      if (!title) {
        issues.push({ line: lineNo, message: "Initiative heading with no title — skipped" });
        current = null;
        continue;
      }
      current = {
        id: null,
        token: idMatch ? idMatch[1] : null,
        title,
        ownerHandle: null,
        status: null,
        health: null,
        startDate: null,
        targetEndDate: null,
        successCriteria: null,
        goal: null,
        tasks: [],
      };
      initiatives.push(current);
      stack = [];
      seenTaskInCurrent = false;
      continue;
    }

    /* Task checkbox */
    const cb = line.match(CHECKBOX_RE);
    if (cb) {
      if (!current) {
        issues.push({ line: lineNo, message: "Task outside any initiative — skipped" });
        continue;
      }
      seenTaskInCurrent = true;
      const indent = cb[1].replace(/\t/g, "  ").length;
      let depth = Math.floor(indent / 2);
      if (depth > 2) {
        issues.push({
          line: lineNo,
          message: `Nesting deeper than 2 levels — attached at depth 2`,
        });
        depth = 2;
      }
      const idMatch = line.match(TASK_ID_RE);
      let body = stripComments(cb[3]);
      const due = body.match(DUE_RE);
      if (due) body = body.replace(DUE_RE, "").trim();
      const owner = body.match(OWNER_RE);
      if (owner) body = body.replace(OWNER_RE, " ").replace(/\s+/g, " ").trim();
      if (!body) {
        issues.push({ line: lineNo, message: "Task with empty title — skipped" });
        continue;
      }
      const node: RoadmapTaskNode = {
        id: null,
        token: idMatch ? idMatch[1] : null,
        title: body,
        done: cb[2].toLowerCase() === "x",
        ownerHandle: owner ? owner[1] : null,
        dueDate: due ? due[1] : null,
        children: [],
      };
      // Pop stack to the parent depth.
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      if (depth === 0 || stack.length === 0) {
        current.tasks.push(node);
        stack = [{ depth: 0, node }];
      } else {
        stack[stack.length - 1].node.children.push(node);
        stack.push({ depth, node });
      }
      continue;
    }

    /* Initiative metadata line (before the first task of the initiative) */
    const meta = line.trim().match(META_RE);
    if (meta && current && !seenTaskInCurrent) {
      const key = meta[1].trim().toLowerCase();
      const value = stripComments(meta[2]);
      if (!KNOWN_META.has(key)) {
        issues.push({ line: lineNo, message: `Unknown metadata "${meta[1].trim()}" — ignored` });
        continue;
      }
      if (!value) continue;
      switch (key) {
        case "owner": {
          const m = value.match(OWNER_RE) ?? value.match(/^([\w.\-]+)$/);
          if (m) current.ownerHandle = m[1];
          else issues.push({ line: lineNo, message: `Unparseable owner "${value}"` });
          break;
        }
        case "status": {
          const v = value.toLowerCase();
          if (VALID_STATUS.has(v)) current.status = v;
          else issues.push({ line: lineNo, message: `Unknown status "${value}" — ignored` });
          break;
        }
        case "health": {
          const v = value.toLowerCase();
          if (VALID_HEALTH.has(v)) current.health = v;
          else issues.push({ line: lineNo, message: `Unknown health "${value}" — ignored` });
          break;
        }
        case "dates": {
          const parts = value.split(/→|->/).map((p) => p.trim());
          const start = parts[0] && DATE_RE.test(parts[0]) ? parts[0] : null;
          const end = parts[1] && DATE_RE.test(parts[1]) ? parts[1] : null;
          if (!start && !end) {
            issues.push({ line: lineNo, message: `Unparseable dates "${value}"` });
          }
          current.startDate = start;
          current.targetEndDate = end;
          break;
        }
        case "success":
          current.successCriteria = value;
          break;
        case "goal":
          current.goal = value;
          break;
      }
      continue;
    }

    /* Anything else that LOOKS like an attempt at structure gets reported. */
    if (/^\s*-\s*\[/.test(line)) {
      issues.push({ line: lineNo, message: "Malformed checkbox — skipped" });
    } else if (current && /^\s*-\s/.test(line) && !seenTaskInCurrent) {
      issues.push({ line: lineNo, message: "Unrecognized metadata line — ignored" });
    }
    // Prose / blank-ish lines are silently allowed (forgiving parser).
  }

  return { formatVersion, basePlanVersion, initiatives, issues };
}

/* ─── Differ (FR-RMD-4..10) ───────────────────────────────────────────── */

export type FieldChange = {
  field: string;
  /** Current CRM value. */
  from: string | boolean | null;
  /** Incoming file value. */
  to: string | boolean | null;
  /** Set when the CRM also changed this field since the base (FR-RMD-7). */
  conflict?: { baseValue: string | boolean | null };
};

export type EntityChange = {
  kind: "initiative" | "task";
  changeType: "create" | "update" | "probable-update" | "archive";
  /** Existing entity id (update/probable-update/archive). */
  id?: string;
  title: string;
  /** For task changes: the existing initiative the task lives/lands under. */
  initiativeId?: string | null;
  /** For task creates under an existing parent task. */
  parentTaskId?: string | null;
  /** For creates: the full node (children included). */
  node?: RoadmapTaskNode | RoadmapInitiativeNode;
  fields?: FieldChange[];
  /** FR-RMD-4: creates/updates pre-accepted; archives + probables are not. */
  defaultAccepted: boolean;
};

export type RoadmapDiff = {
  changes: EntityChange[];
  issues: ParseIssue[];
  unknownOwners: string[];
  unmatchedTokens: string[];
  baseVersion: number | null;
};

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

type InitFields = Pick<
  RoadmapInitiativeNode,
  | "title"
  | "ownerHandle"
  | "status"
  | "health"
  | "startDate"
  | "targetEndDate"
  | "successCriteria"
  | "goal"
>;
const INIT_FIELDS: (keyof InitFields)[] = [
  "title",
  "ownerHandle",
  "status",
  "health",
  "startDate",
  "targetEndDate",
  "successCriteria",
  "goal",
];
type TaskFields = Pick<RoadmapTaskNode, "title" | "done" | "ownerHandle" | "dueDate">;
const TASK_FIELDS: (keyof TaskFields)[] = ["title", "done", "ownerHandle", "dueDate"];

function fieldChanges<T extends Record<string, unknown>>(
  fields: readonly (keyof T)[],
  parsed: T,
  current: T,
  base: T | null,
  opts: { skipNullIncoming?: Set<string> } = {},
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fields) {
    const to = (parsed[f] ?? null) as FieldChange["to"];
    const from = (current[f] ?? null) as FieldChange["from"];
    // A field absent from the file (null) only counts as a change when the
    // contract treats absence as meaningful; for optional metadata we treat
    // null-incoming as "not stated" and skip, EXCEPT title/done which are
    // always stated by the format.
    if (to === null && opts.skipNullIncoming?.has(f as string)) continue;
    if (to === from) continue;
    const change: FieldChange = { field: f as string, from, to };
    if (base) {
      const baseVal = (base[f] ?? null) as FieldChange["from"];
      if (baseVal !== from && baseVal !== to) {
        // CRM moved away from base AND file proposes something different
        // → genuine conflict (FR-RMD-7). CRM-wins default (FR-RMD-8) is
        // expressed by the UI preselecting `from`.
        change.conflict = { baseValue: baseVal };
      } else if (baseVal !== from && baseVal === to) {
        // File still says what base said; CRM changed since → not a file
        // change at all. Skip (stale file must not revert CRM edits).
        continue;
      }
    }
    out.push(change);
  }
  return out;
}

const OPTIONAL_INIT_FIELDS = new Set([
  "ownerHandle",
  "status",
  "health",
  "startDate",
  "targetEndDate",
  "successCriteria",
  "goal",
]);
const OPTIONAL_TASK_FIELDS = new Set(["ownerHandle", "dueDate"]);

function flattenTasks(
  tasks: RoadmapTaskNode[],
  parent: RoadmapTaskNode | null = null,
): Array<{ node: RoadmapTaskNode; parent: RoadmapTaskNode | null }> {
  const out: Array<{ node: RoadmapTaskNode; parent: RoadmapTaskNode | null }> = [];
  for (const t of tasks) {
    out.push({ node: t, parent });
    out.push(...flattenTasks(t.children, t));
  }
  return out;
}

export function diffRoadmap(
  parsed: ParsedRoadmap,
  current: RoadmapSnapshot,
  base: RoadmapSnapshot | null,
  knownOwnerHandles: Set<string>,
): RoadmapDiff {
  const changes: EntityChange[] = [];
  const unknownOwners = new Set<string>();
  const unmatchedTokens: string[] = [];

  const collectOwner = (h: string | null) => {
    if (h && !knownOwnerHandles.has(h.toLowerCase())) unknownOwners.add(h);
  };

  const baseInitById = new Map<string, RoadmapInitiativeNode>();
  for (const bi of base?.initiatives ?? []) if (bi.id) baseInitById.set(bi.id, bi);
  const baseTaskById = new Map<string, RoadmapTaskNode>();
  for (const bi of base?.initiatives ?? [])
    for (const { node } of flattenTasks(bi.tasks)) if (node.id) baseTaskById.set(node.id, node);

  const matchedInitIds = new Set<string>();
  const matchedTaskIds = new Set<string>();

  /* Pass 1 — match parsed initiatives to current. */
  for (const pi of parsed.initiatives) {
    collectOwner(pi.ownerHandle);
    for (const { node } of flattenTasks(pi.tasks)) collectOwner(node.ownerHandle);

    let target: RoadmapInitiativeNode | null = null;
    let probable = false;

    if (pi.token) {
      target =
        current.initiatives.find((ci) => ci.id && matchesToken(ci.id, pi.token!)) ?? null;
      if (!target) {
        unmatchedTokens.push(`in_${pi.token}`);
        continue; // FR-RMD-5: unknown ID is flagged, never silently created
      }
    } else {
      // FR-RMD-6: fuzzy fallback by normalized title.
      const n = normTitle(pi.title);
      target =
        current.initiatives.find(
          (ci) => ci.id && !matchedInitIds.has(ci.id) && normTitle(ci.title) === n,
        ) ?? null;
      probable = target !== null;
    }

    if (!target) {
      changes.push({
        kind: "initiative",
        changeType: "create",
        title: pi.title,
        node: pi,
        defaultAccepted: true,
      });
      continue;
    }

    matchedInitIds.add(target.id!);
    const baseInit = baseInitById.get(target.id!) ?? null;
    const fields = fieldChanges<InitFields>(INIT_FIELDS, pi, target, baseInit, {
      skipNullIncoming: OPTIONAL_INIT_FIELDS,
    });
    if (fields.length > 0) {
      changes.push({
        kind: "initiative",
        changeType: probable ? "probable-update" : "update",
        id: target.id!,
        title: target.title,
        fields,
        defaultAccepted: !probable,
      });
    } else if (probable) {
      // Title matches, nothing changed — treat as matched, no change row.
    }

    /* Pass 1b — tasks within this initiative. */
    const currentFlat = flattenTasks(target.tasks);
    for (const { node: pt, parent: pParent } of flattenTasks(pi.tasks)) {
      let tTarget: RoadmapTaskNode | null = null;
      let tProbable = false;
      if (pt.token) {
        tTarget =
          currentFlat.find((c) => c.node.id && matchesToken(c.node.id, pt.token!))?.node ??
          null;
        if (!tTarget) {
          unmatchedTokens.push(`ms_${pt.token}`);
          continue;
        }
      } else {
        const n = normTitle(pt.title);
        tTarget =
          currentFlat.find(
            (c) =>
              c.node.id && !matchedTaskIds.has(c.node.id) && normTitle(c.node.title) === n,
          )?.node ?? null;
        tProbable = tTarget !== null;
      }

      if (!tTarget) {
        // New task. If its parent is an existing task, attach there; children
        // of a NEW parent ride along inside the parent's node — skip them.
        if (pParent && !pParent.token) continue;
        const parentTaskId = pParent?.token
          ? (currentFlat.find((c) => c.node.id && matchesToken(c.node.id, pParent.token!))
              ?.node.id ?? null)
          : null;
        changes.push({
          kind: "task",
          changeType: "create",
          title: pt.title,
          initiativeId: target.id,
          parentTaskId,
          node: pt,
          defaultAccepted: true,
        });
        continue;
      }

      matchedTaskIds.add(tTarget.id!);
      const baseTask = baseTaskById.get(tTarget.id!) ?? null;
      const tFields = fieldChanges<TaskFields>(TASK_FIELDS, pt, tTarget, baseTask, {
        skipNullIncoming: OPTIONAL_TASK_FIELDS,
      });
      if (tFields.length > 0) {
        changes.push({
          kind: "task",
          changeType: tProbable ? "probable-update" : "update",
          id: tTarget.id!,
          title: tTarget.title,
          initiativeId: target.id,
          fields: tFields,
          defaultAccepted: !tProbable,
        });
      }
    }

    /* Pass 1c — archive proposals for tasks missing from the file (FR-RMD-10). */
    for (const { node: ct } of currentFlat) {
      if (ct.id && !matchedTaskIds.has(ct.id)) {
        changes.push({
          kind: "task",
          changeType: "archive",
          id: ct.id,
          title: ct.title,
          initiativeId: target.id,
          defaultAccepted: false,
        });
        matchedTaskIds.add(ct.id); // avoid double-proposing
      }
    }
  }

  /* Pass 2 — archive proposals for initiatives missing from the file. */
  for (const ci of current.initiatives) {
    if (ci.id && !matchedInitIds.has(ci.id)) {
      changes.push({
        kind: "initiative",
        changeType: "archive",
        id: ci.id,
        title: ci.title,
        defaultAccepted: false,
      });
    }
  }

  return {
    changes,
    issues: parsed.issues,
    unknownOwners: [...unknownOwners],
    unmatchedTokens,
    baseVersion: parsed.basePlanVersion,
  };
}
