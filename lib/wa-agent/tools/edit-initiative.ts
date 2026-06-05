/**
 * edit_initiative — update an existing initiative row.
 *
 * Target resolution mirrors the CRM edit pattern: pass initiative_id when known,
 * otherwise pass title_query for fuzzy lookup.
 */

import { and, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { initiatives, projects, workspaceMembers } = schema;

const PRIORITIES = ["now", "next", "later", "backlog"] as const;
type Priority = (typeof PRIORITIES)[number];
const STATUSES = ["planning", "active", "paused", "done", "cancelled"] as const;
type InitiativeStatus = (typeof STATUSES)[number];

function cleanDate(raw: unknown): string | null | undefined {
  const v = safeStr(raw, 10);
  if (!v) return null;
  if (v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

async function findInitiatives(workspaceId: string, query: string) {
  return db
    .select({
      id: initiatives.id,
      title: initiatives.title,
      projectId: initiatives.projectId,
      projectTitle: projects.title,
      status: initiatives.status,
      priority: initiatives.priority,
    })
    .from(initiatives)
    .leftJoin(projects, eq(projects.id, initiatives.projectId))
    .where(
      and(
        eq(initiatives.workspaceId, workspaceId),
        or(
          eq(initiatives.id, query),
          ilike(initiatives.title, `%${query}%`),
        ),
      ),
    )
    .limit(6);
}

async function resolveMemberInWorkspace(workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const editInitiative: ToolEntry = {
  definition: {
    name: "edit_initiative",
    description:
      "Update an existing initiative. Identify by initiative_id or title_query. " +
      "Use fields sparingly; do not send unchanged values.",
    input_schema: {
      type: "object",
      properties: {
        initiative_id: {
          type: "string",
          description: "Initiative UUID. Prefer this when you already have it.",
        },
        title_query: {
          type: "string",
          description:
            "Fuzzy title fragment to locate initiative when id is unknown. " +
            "If multiple matches are found, the tool returns candidates.",
        },
        title: { type: "string", description: "New title. Max 200 chars." },
        summary: { type: "string", description: "Short rationale / context." },
        goal: { type: "string", description: "New objective statement." },
        status: { type: "string", enum: [...STATUSES] },
        priority: { type: "string", enum: [...PRIORITIES] },
        project_id: {
          type: "string",
          description: "Move to this project; empty string detaches from any project.",
        },
        owner_user_id: {
          type: "string",
          description: "Set initiative owner (workspace member id) or clear with empty string.",
        },
        start_date: { type: "string", description: "YYYY-MM-DD (or empty string to clear)" },
        target_end_date: {
          type: "string",
          description: "YYYY-MM-DD (or empty string to clear)",
        },
      },
      required: ["initiative_id"],
    },
  },

  async execute(input, ctx) {
    const explicitId = safeStr(input.initiative_id);
    const query = safeStr(input.title_query, 180);

    let targetId = explicitId;
    if (!targetId) {
      if (!query) {
        return {
          ok: false,
          error: "Provide initiative_id or title_query.",
        };
      }

      const matches = await findInitiatives(ctx.workspaceId, query);
      if (matches.length === 0) {
        return { ok: false, error: `No initiatives match "${query}".` };
      }
      if (matches.length > 1) {
        return {
          ok: true,
          data: { ambiguous: true, candidates: matches },
          speak:
            `Several initiatives match "${query}": ` +
            matches.map((m) => `${m.title}`).join(", ") +
            ". Which one?",
        };
      }
      targetId = matches[0].id;
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const changed: string[] = [];

    if (typeof input.title === "string") {
      const t = safeStr(input.title, 200);
      if (t) {
        patch.title = t;
        changed.push("title");
      }
    }

    if (typeof input.summary === "string") {
      patch.summary = safeStr(input.summary, 3000) || null;
      changed.push("summary");
    }

    if (typeof input.goal === "string") {
      patch.goal = safeStr(input.goal, 3000) || null;
      changed.push("goal");
    }

    if (typeof input.status === "string") {
      const s = safeStr(input.status, 20) as InitiativeStatus;
      if (STATUSES.includes(s)) {
        patch.status = s;
        changed.push(`status ${s}`);
      }
    }

    if (typeof input.priority === "string") {
      const p = safeStr(input.priority, 16) as Priority;
      if (PRIORITIES.includes(p)) {
        patch.priority = p;
        changed.push(`priority ${p}`);
      }
    }

    if (typeof input.project_id === "string") {
      const pid = safeStr(input.project_id);
      if (pid === "") {
        patch.projectId = null;
        changed.push("detached project");
      } else if (pid) {
        // Keep the current behavior: invalid ids are ignored so the original value stays.
        patch.projectId = pid;
        changed.push("project");
      }
    }

    if (typeof input.owner_user_id === "string") {
      const ownerRaw = safeStr(input.owner_user_id);
      if (ownerRaw === "") {
        patch.ownerUserId = null;
        changed.push("owner cleared");
      } else if (ownerRaw && (await resolveMemberInWorkspace(ctx.workspaceId, ownerRaw))) {
        patch.ownerUserId = ownerRaw;
        changed.push("owner");
      }
    }

    if (typeof input.start_date === "string") {
      const start = cleanDate(input.start_date);
      if (start === undefined) {
        return { ok: false, error: "start_date must be YYYY-MM-DD or empty." };
      }
      patch.startDate = start;
      changed.push("start date");
    }

    if (typeof input.target_end_date === "string") {
      const end = cleanDate(input.target_end_date);
      if (end === undefined) {
        return { ok: false, error: "target_end_date must be YYYY-MM-DD or empty." };
      }
      patch.targetEndDate = end;
      changed.push("target end");
    }

    if (changed.length === 0) {
      return { ok: false, error: "No valid fields to update were provided." };
    }

    const [row] = await db
      .update(initiatives)
      .set(patch)
      .where(and(eq(initiatives.id, targetId), eq(initiatives.workspaceId, ctx.workspaceId)))
      .returning({ id: initiatives.id, title: initiatives.title });

    if (!row) return { ok: false, error: "Initiative not found." };

    return {
      ok: true,
      data: { id: row.id, title: row.title, changed },
      speak: `Updated initiative "${row.title}" (${changed.join(", ")}).`,
    };
  },
};
