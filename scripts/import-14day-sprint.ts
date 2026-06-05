#!/usr/bin/env tsx
/**
 * Import the 14-Day Dual Sprint into AGB CRM as a single sprint + two workstreams.
 *
 * Usage:
 *   npx tsx scripts/import-14day-sprint.ts --workspace-id=<workspaceId> --activate
 *
 * Environment options:
 *   AGB_WORKSPACE_ID      workspace to write into (optional)
 *   AGB_SPRINT_ACTOR_ID   user id to set as creator/owner (optional)
 */
import "dotenv/config";
import { and, desc, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";

type StreamTask = {
  title: string;
  section: "week1" | "week2";
};

type StreamPlan = {
  initiativeTitle: string;
  projectMatchHints: string[];
  tasks: StreamTask[];
  projectFallback: string;
};

const PLAN_NAME = "14-Day Dual Sprint";
const SPRINT_GOAL = "CaneyCloud + VAV launch within the same 14-day cycle.";
const START_DATE = "2026-05-30";
const END_DATE = "2026-06-13";
const WEEK1_DUE = "2026-06-05";
const WEEK2_DUE = "2026-06-13";

const STREAMS: StreamPlan[] = [
  {
    initiativeTitle: "CaneyCloud",
    projectMatchHints: ["CaneyCloud", "Caney"],
    projectFallback: "CaneyCloud",
    tasks: [
      { title: "Warm network is fully activated", section: "week1" },
      { title: "Pipeline is moving with urgency", section: "week1" },
      { title: "Facebook Business account live", section: "week1" },
      { title: "Platform is demo and delivery ready", section: "week1" },
      { title: "Pipeline active with first closes happening", section: "week2" },
      { title: "Beta clients onboarded with full support", section: "week2" },
      { title: "Onboarding presentation complete", section: "week2" },
      { title: "Feedback loop open and active", section: "week2" },
      { title: "5 beta clients signed, onboarded, and live on CaneyCloud", section: "week2" },
    ],
  },
  {
    initiativeTitle: "Vamos a Venezuela",
    projectMatchHints: ["Vamos a Venezuela", "VAV", "Venezuela", "Vamos"],
    projectFallback: "Vamos a Venezuela",
    tasks: [
      { title: "Platform is error-free and client-ready", section: "week1" },
      { title: "Ambassador pipeline deepened and expanded", section: "week1" },
      { title: "VAV promotional deck started", section: "week1" },
      { title: "At least two ambassador conversations active", section: "week2" },
      { title: "Promotional deck complete and ready to send", section: "week2" },
      { title: "VAV launches with real inventory", section: "week2" },
      { title: "Launch story is ready to tell", section: "week2" },
    ],
  },
];

const { projects, initiatives, sprints, milestones, workspaceMembers, users } = schema;

function getWorkspaceIdArg(): string | null {
  const explicit = process.argv
    .find((arg) => arg.startsWith("--workspace-id="))
    ?.split("=")[1]?.trim();
  return explicit ?? process.env.AGB_WORKSPACE_ID ?? null;
}

function shouldActivate(): boolean {
  return process.argv.includes("--activate");
}

async function resolveWorkspace(): Promise<string> {
  const envWorkspace = getWorkspaceIdArg();
  if (envWorkspace) return envWorkspace;

  const rows = await db
    .selectDistinct({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .limit(2);

  if (rows.length === 0) {
    throw new Error(
      "No workspace found. Set AGB_WORKSPACE_ID or use --workspace-id=<id>.",
    );
  }
  if (rows.length > 1) {
    throw new Error(
      `Multiple workspaces found. Set AGB_WORKSPACE_ID or use --workspace-id=<id>.\nFound: ${rows.map((r) => r.id).join(", ")}`,
    );
  }
  return rows[0].id;
}

async function resolveActorId(workspaceId: string): Promise<string> {
  if (process.env.AGB_SPRINT_ACTOR_ID) return process.env.AGB_SPRINT_ACTOR_ID;

  const ownerRow = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  if (ownerRow.length > 0) return ownerRow[0].userId;

  const anyRow = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .limit(1);
  if (anyRow.length > 0) return anyRow[0].userId;

  const fallback = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.currentWorkspaceId, workspaceId))
    .limit(1);
  if (fallback.length === 0) {
    throw new Error("No user found for workspace. Set AGB_SPRINT_ACTOR_ID.");
  }
  return fallback[0].id;
}

async function getOrCreateProject(
  workspaceId: string,
  actorId: string,
  hints: string[],
  fallbackName: string,
) {
  for (const hint of hints) {
    const rows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(
        and(eq(projects.workspaceId, workspaceId), ilike(projects.title, `%${hint}%`)),
      )
      .orderBy(desc(projects.createdAt))
      .limit(1);
    if (rows.length > 0) return rows[0];
  }

  const inserted = await db
    .insert(projects)
    .values({
      workspaceId,
      title: fallbackName,
      createdBy: actorId,
    })
    .returning({ id: projects.id, title: projects.title });
  return inserted[0];
}

async function getOrCreateInitiative(
  workspaceId: string,
  actorId: string,
  projectId: string,
  title: string,
) {
  const existing = await db
    .select({ id: initiatives.id, title: initiatives.title })
    .from(initiatives)
    .where(
      and(
        eq(initiatives.workspaceId, workspaceId),
        ilike(initiatives.title, `%${title}%`),
      ),
    )
    .orderBy(desc(initiatives.updatedAt))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await db
    .insert(initiatives)
    .values({
      workspaceId,
      title,
      summary: `Operational stream for ${title} in ${PLAN_NAME}.`,
      projectId,
      priority: "now",
      status: "active",
      ownerUserId: actorId,
      createdBy: actorId,
    })
    .returning({ id: initiatives.id, title: initiatives.title });
  return inserted[0];
}

async function getOrCreateSprint(workspaceId: string) {
  const existing = await db
    .select()
    .from(sprints)
    .where(and(eq(sprints.workspaceId, workspaceId), eq(sprints.name, PLAN_NAME)))
    .limit(1);

  if (existing.length > 0) {
    const sprint = existing[0];
    if (sprint.startDate !== START_DATE || sprint.endDate !== END_DATE || sprint.goal !== SPRINT_GOAL) {
      await db
        .update(sprints)
        .set({
          startDate: START_DATE,
          endDate: END_DATE,
          goal: SPRINT_GOAL,
        })
        .where(eq(sprints.id, sprint.id));
    }
    return sprint;
  }

  const created = await db
    .insert(sprints)
    .values({
      workspaceId,
      name: PLAN_NAME,
      goal: SPRINT_GOAL,
      startDate: START_DATE,
      endDate: END_DATE,
      status: "planned",
    })
    .returning();
  return created[0];
}

async function upsertTask(
  workspaceId: string,
  actorId: string,
  sprintId: string,
  initiativeId: string,
  projectId: string,
  task: StreamTask,
) {
  const dueDate = task.section === "week1" ? WEEK1_DUE : WEEK2_DUE;
  const already = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(
      and(
        eq(milestones.workspaceId, workspaceId),
        eq(milestones.sprintId, sprintId),
        eq(milestones.title, task.title),
      ),
    )
    .limit(1);
  if (already.length > 0) return false;

  await db.insert(milestones).values({
    workspaceId,
    projectId,
    title: task.title,
    dueDate,
    createdBy: actorId,
    initiativeId,
    sprintId,
    priority: "now",
  });
  return true;
}

async function main() {
  const workspaceId = await resolveWorkspace();
  const actorId = await resolveActorId(workspaceId);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Actor: ${actorId}`);

  const sprint = await getOrCreateSprint(workspaceId);
  console.log(`Sprint: ${sprint.id} (${sprint.name})`);
  if (shouldActivate()) {
    await db
      .update(sprints)
      .set({ status: "planned" })
      .where(
        and(
          eq(sprints.workspaceId, workspaceId),
          eq(sprints.status, "active"),
        ),
      );
    await db.update(sprints).set({ status: "active" }).where(eq(sprints.id, sprint.id));
    console.log("Sprint activated.");
  }

  let createdCount = 0;
  let existingCount = 0;

  for (const stream of STREAMS) {
    const project = await getOrCreateProject(
      workspaceId,
      actorId,
      stream.projectMatchHints,
      stream.projectFallback,
    );
    const initiative = await getOrCreateInitiative(
      workspaceId,
      actorId,
      project.id,
      stream.initiativeTitle,
    );

    console.log(`Stream: ${stream.initiativeTitle} -> ${project.title}`);

    for (const task of stream.tasks) {
      const created = await upsertTask(
        workspaceId,
        actorId,
        sprint.id,
        initiative.id,
        project.id,
        task,
      );
      if (created) {
        createdCount += 1;
      } else {
        existingCount += 1;
      }
    }
  }

  console.log(`Sprint capture complete. ${createdCount} new tasks created, ${existingCount} existing tasks reused.`);
  console.log(`Open the Sprint page at /sprint and review status for ${sprint.name}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
