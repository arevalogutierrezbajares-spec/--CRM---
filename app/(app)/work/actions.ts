"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";

const {
  themes,
  initiatives,
  sprints,
  initiativeThemes,
  milestones,
} = schema;

/* ─── Themes ───────────────────────────────────────────────────────────── */

const themeSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
});

export async function createTheme(formData: FormData) {
  const user = await requireUser();
  const parsed = themeSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") || undefined,
    icon: formData.get("icon") || undefined,
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid theme");
  await db.insert(themes).values({
    workspaceId: user.workspaceId,
    name: parsed.data.name,
    color: parsed.data.color,
    icon: parsed.data.icon,
    description: parsed.data.description,
  });
  revalidatePath("/initiatives");
  revalidatePath("/work");
}

/* ─── Initiatives ──────────────────────────────────────────────────────── */

const initiativeSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().optional(),
  goal: z.string().optional(),
  projectId: z.string().uuid().optional(),
  priority: z.enum(["now", "next", "later", "backlog"]).default("next"),
  status: z
    .enum(["planning", "active", "paused", "done", "cancelled"])
    .default("planning"),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  themeIds: z.array(z.string().uuid()).optional(),
});

export async function createInitiative(formData: FormData) {
  const user = await requireUser();
  const themeIds = formData.getAll("themeIds").map(String).filter(Boolean);

  const parsed = initiativeSchema.safeParse({
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    goal: formData.get("goal") || undefined,
    projectId: formData.get("projectId") || undefined,
    priority: formData.get("priority") || "next",
    status: formData.get("status") || "planning",
    startDate: formData.get("startDate") || undefined,
    targetEndDate: formData.get("targetEndDate") || undefined,
    themeIds,
  });
  if (!parsed.success) throw new Error("Invalid initiative");

  const [row] = await db
    .insert(initiatives)
    .values({
      workspaceId: user.workspaceId,
      title: parsed.data.title,
      summary: parsed.data.summary,
      goal: parsed.data.goal,
      projectId: parsed.data.projectId || null,
      priority: parsed.data.priority,
      status: parsed.data.status,
      startDate: parsed.data.startDate || null,
      targetEndDate: parsed.data.targetEndDate || null,
      ownerUserId: user.id,
      createdBy: user.id,
    })
    .returning({ id: initiatives.id });

  if (parsed.data.themeIds && parsed.data.themeIds.length > 0) {
    await db.insert(initiativeThemes).values(
      parsed.data.themeIds.map((themeId) => ({
        initiativeId: row.id,
        themeId,
      })),
    );
  }

  revalidatePath("/initiatives");
  revalidatePath("/work");
  revalidatePath("/roadmap");
}

export async function updateInitiativeStatus(
  id: string,
  status: "planning" | "active" | "paused" | "done" | "cancelled",
) {
  const user = await requireUser();
  await db
    .update(initiatives)
    .set({
      status,
      actualEndDate:
        status === "done" ? new Date().toISOString().slice(0, 10) : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(initiatives.id, id),
        eq(initiatives.workspaceId, user.workspaceId),
      ),
    );
  revalidatePath("/initiatives");
  revalidatePath(`/initiatives/${id}`);
}

/* ─── Sprints ──────────────────────────────────────────────────────────── */

const sprintSchema = z.object({
  name: z.string().min(1).max(120),
  goal: z.string().optional(),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  initiativeId: z.string().uuid().optional(),
});

export async function createSprint(formData: FormData) {
  const user = await requireUser();
  const parsed = sprintSchema.safeParse({
    name: formData.get("name"),
    goal: formData.get("goal") || undefined,
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    initiativeId: formData.get("initiativeId") || undefined,
  });
  if (!parsed.success) throw new Error("Invalid sprint");
  await db.insert(sprints).values({
    workspaceId: user.workspaceId,
    name: parsed.data.name,
    goal: parsed.data.goal,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    initiativeId: parsed.data.initiativeId || null,
    status: "planned",
  });
  revalidatePath("/sprint");
  revalidatePath("/roadmap");
}

export async function setSprintStatus(
  id: string,
  status: "planned" | "active" | "completed",
) {
  const user = await requireUser();
  if (status === "active") {
    await db
      .update(sprints)
      .set({ status: "planned" })
      .where(
        and(
          eq(sprints.workspaceId, user.workspaceId),
          eq(sprints.status, "active"),
        ),
      );
  }
  await db
    .update(sprints)
    .set({ status })
    .where(
      and(eq(sprints.id, id), eq(sprints.workspaceId, user.workspaceId)),
    );
  revalidatePath("/sprint");
}

/* ─── Milestone (task) updates ─────────────────────────────────────────── */

export async function setMilestoneStatusRich(
  id: string,
  status:
    | "pending"
    | "in_progress"
    | "in_review"
    | "blocked"
    | "done"
    | "cancelled",
) {
  await requireUser();
  await db.update(milestones).set({ status }).where(eq(milestones.id, id));
  revalidatePath("/sprint");
  revalidatePath("/work");
}

export async function setMilestonePriority(
  id: string,
  priority: "now" | "next" | "later" | "backlog" | null,
) {
  await requireUser();
  await db.update(milestones).set({ priority }).where(eq(milestones.id, id));
  revalidatePath("/work");
}

export async function setMilestoneSprint(
  id: string,
  sprintId: string | null,
) {
  await requireUser();
  await db.update(milestones).set({ sprintId }).where(eq(milestones.id, id));
  revalidatePath("/sprint");
  revalidatePath("/work");
}

export async function setMilestoneInitiative(
  id: string,
  initiativeId: string | null,
) {
  await requireUser();
  await db
    .update(milestones)
    .set({ initiativeId })
    .where(eq(milestones.id, id));
  revalidatePath("/initiatives");
  revalidatePath("/work");
}
