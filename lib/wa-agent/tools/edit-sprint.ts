/**
 * edit_sprint — update an existing sprint's metadata.
 */

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { sprints, initiatives } = schema;

const STATUSES = ["planned", "active", "completed"] as const;
type SprintStatus = (typeof STATUSES)[number];

function cleanDate(raw: unknown): string | null | undefined {
  const v = safeStr(raw, 10);
  if (!v) return null;
  if (v === "") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

async function findSprints(workspaceId: string, query: string) {
  return db
    .select({
      id: sprints.id,
      name: sprints.name,
      status: sprints.status,
      initiativeId: sprints.initiativeId,
    })
    .from(sprints)
    .leftJoin(initiatives, eq(initiatives.id, sprints.initiativeId))
    .where(
      and(
        eq(sprints.workspaceId, workspaceId),
        or(eq(sprints.id, query), ilike(sprints.name, `%${query}%`)),
      ),
    )
    .orderBy(desc(sprints.createdAt))
    .limit(6);
}

async function initiativeInWorkspace(workspaceId: string, initiativeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: initiatives.id })
    .from(initiatives)
    .where(and(eq(initiatives.workspaceId, workspaceId), eq(initiatives.id, initiativeId)))
    .limit(1);
  return Boolean(row);
}

export const editSprint: ToolEntry = {
  definition: {
    name: "edit_sprint",
    description:
      "Update an existing sprint. Identify by sprint_id or name_query. " +
      "Use this for name/goal/date/status/initiative/sprint notes updates.",
    input_schema: {
      type: "object",
      properties: {
        sprint_id: { type: "string", description: "Sprint UUID. Prefer this when known." },
        name_query: {
          type: "string",
          description:
            "A fragment of the sprint name. Use only if you don't have the UUID.",
        },
        name: { type: "string", description: "New sprint name." },
        goal: { type: "string", description: "New goal statement." },
        start_date: { type: "string", description: "YYYY-MM-DD." },
        end_date: { type: "string", description: "YYYY-MM-DD." },
        status: { type: "string", enum: [...STATUSES] },
        initiative_id: {
          type: "string",
          description: "Attach to this initiative; empty string detaches.",
        },
        retro_notes: {
          type: "string",
          description: "Sprint retro notes. Empty string clears.",
        },
      },
      required: [],
    },
  },

  async execute(input, ctx) {
    const explicitId = safeStr(input.sprint_id);
    const query = safeStr(input.name_query, 140);

    let targetId = explicitId;
    if (!targetId) {
      if (!query) {
        return { ok: false, error: "Provide sprint_id or name_query." };
      }
      const matches = await findSprints(ctx.workspaceId, query);
      if (matches.length === 0) {
        return { ok: false, error: `No sprints match "${query}".` };
      }
      if (matches.length > 1) {
        return {
          ok: true,
          data: { ambiguous: true, candidates: matches },
          speak:
            `Several sprints match "${query}": ` +
            matches.map((s) => s.name).join(", ") +
            ". Which one?",
        };
      }
      targetId = matches[0].id;
    }

    const patch: Record<string, unknown> = {};
    const changed: string[] = [];

    if (typeof input.name === "string") {
      const value = safeStr(input.name, 160);
      if (value) {
        patch.name = value;
        changed.push("name");
      }
    }

    if (typeof input.goal === "string") {
      patch.goal = safeStr(input.goal, 3000) || null;
      changed.push("goal");
    }

    if (typeof input.start_date === "string") {
      const value = cleanDate(input.start_date);
      if (value === undefined) {
        return { ok: false, error: "start_date must be YYYY-MM-DD or empty." };
      }
      patch.startDate = value;
      changed.push("start date");
    }

    if (typeof input.end_date === "string") {
      const value = cleanDate(input.end_date);
      if (value === undefined) {
        return { ok: false, error: "end_date must be YYYY-MM-DD or empty." };
      }
      patch.endDate = value;
      changed.push("end date");
    }

    if (patch.startDate && patch.endDate && patch.startDate > patch.endDate) {
      return { ok: false, error: "start_date must be on or before end_date." };
    }

    if (typeof input.status === "string") {
      const value = safeStr(input.status, 16) as SprintStatus;
      if (STATUSES.includes(value)) {
        patch.status = value;
        changed.push(`status ${value}`);
      }
    }

    if (typeof input.initiative_id === "string") {
      const value = safeStr(input.initiative_id);
      if (value === "") {
        patch.initiativeId = null;
        changed.push("initiative detached");
      } else if (value) {
        if (!(await initiativeInWorkspace(ctx.workspaceId, value))) {
          return { ok: false, error: "initiative_id not found in this workspace." };
        }
        patch.initiativeId = value;
        changed.push("initiative");
      }
    }

    if (typeof input.retro_notes === "string") {
      patch.retroNotes = safeStr(input.retro_notes, 4000) || null;
      changed.push("retro notes");
    }

    if (changed.length === 0) {
      return { ok: false, error: "No valid fields to update were provided." };
    }

    if (patch.status === "active") {
      await db
        .update(sprints)
        .set({ status: "planned" })
        .where(
          and(
            eq(sprints.workspaceId, ctx.workspaceId),
            eq(sprints.status, "active"),
          ),
        );
    }

    const [row] = await db
      .update(sprints)
      .set(patch)
      .where(and(eq(sprints.id, targetId), eq(sprints.workspaceId, ctx.workspaceId)))
      .returning({ id: sprints.id, name: sprints.name });

    if (!row) return { ok: false, error: "Sprint not found." };

    return {
      ok: true,
      data: { id: row.id, name: row.name, changed },
      speak: `Updated sprint "${row.name}" (${changed.join(", ")}).`,
    };
  },
};
