import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listProjects, getProject } from "@/db/queries/projects";
import { instantiateMilestonesFromTemplate } from "@/db/queries/milestones";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { projects, pipelineStages, pipelineTemplates, milestones } = schema;

const baseProject = {
  workspaceId: FAKE_WORKSPACE_ID,
  createdBy: FAKE_USER_ID,
};

describe("[integration] projects + template instantiation", () => {
  it("instantiateMilestonesFromTemplate creates one milestone per stage with correct ordering", async () => {
    const template = "caney-posada-onboarding";
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order));
    expect(stages.length).toBe(12);

    const [stage1] = stages;
    const [p] = await db
      .insert(projects)
      .values({
        ...baseProject,
        title: "Marta — Caney onboarding",
        templateId: template,
        currentStageId: stage1.id,
      })
      .returning();

    const created = await instantiateMilestonesFromTemplate({
      projectId: p.id,
      templateId: template,
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
    });

    expect(created.length).toBe(12);
    const stored = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, p.id))
      .orderBy(asc(milestones.order));
    expect(stored.map((m) => m.title)).toEqual(stages.map((s) => s.name));

    for (let i = 0; i < stored.length; i++) {
      if (stages[i].slaDays === null) {
        expect(stored[i].dueDate).toBeNull();
      } else {
        expect(stored[i].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("listProjects computes health from milestones (overdue → red)", async () => {
    const template = "bd-courtship";
    const [stage1] = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order))
      .limit(1);

    const [p] = await db
      .insert(projects)
      .values({
        ...baseProject,
        title: "Overdue project",
        templateId: template,
        currentStageId: stage1.id,
      })
      .returning();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.insert(milestones).values({
      projectId: p.id,
      title: "Send proposal",
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      dueDate: yesterday.toISOString().slice(0, 10),
    });

    const list = await listProjects({ workspaceId: FAKE_WORKSPACE_ID });
    const subject = list.find((x) => x.id === p.id)!;
    expect(subject.computedHealth).toBe("red");
    expect(subject.milestoneOverdueCount).toBe(1);
  });

  it("getProject returns linked contacts + stages + milestones", async () => {
    const template = "vav-creator-campaign";
    const [stage1] = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order))
      .limit(1);

    const [p] = await db
      .insert(projects)
      .values({
        ...baseProject,
        title: "VAV deal",
        templateId: template,
        currentStageId: stage1.id,
      })
      .returning();

    const detail = await getProject({
      id: p.id,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(detail).toBeTruthy();
    expect(detail!.templateName).toBe("VAV creator campaign");
    expect(detail!.stages.length).toBe(10);
    expect(detail!.contacts).toEqual([]);
  });

  it("seed contains 4 templates with correct stage counts", async () => {
    const allTemplates = await db.select().from(pipelineTemplates);
    expect(allTemplates.length).toBe(4);

    const ids = allTemplates.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "caney-posada-onboarding",
        "vav-creator-campaign",
        "bd-courtship",
        "restaurant-discovery",
      ]),
    );

    const counts = await Promise.all(
      ids.map(async (id) => {
        const rows = await db
          .select()
          .from(pipelineStages)
          .where(eq(pipelineStages.templateId, id));
        return { id, count: rows.length };
      }),
    );
    const byId = Object.fromEntries(counts.map((c) => [c.id, c.count]));
    expect(byId["caney-posada-onboarding"]).toBe(12);
    expect(byId["vav-creator-campaign"]).toBe(10);
    expect(byId["bd-courtship"]).toBe(5);
    expect(byId["restaurant-discovery"]).toBe(8);
  });
});
