import { describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listLines, getLob } from "@/db/queries/lines-of-business";
import { instantiateMilestonesFromTemplate } from "@/db/queries/milestones";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { linesOfBusiness, projects, pipelineStages, pipelineTemplates, milestones } =
  schema;

const baseRow = {
  workspaceId: FAKE_WORKSPACE_ID,
  createdBy: FAKE_USER_ID,
};

/** Create an LoB and a single child Project under it; return both ids. */
async function makeLobWithProject(opts: {
  title: string;
  templateId?: string;
  currentStageId?: string;
}) {
  const [lob] = await db
    .insert(linesOfBusiness)
    .values({
      ...baseRow,
      title: opts.title,
      templateId: opts.templateId ?? null,
      currentStageId: opts.currentStageId ?? null,
    })
    .returning();
  const [project] = await db
    .insert(projects)
    .values({ ...baseRow, lobId: lob.id, title: opts.title })
    .returning();
  return { lobId: lob.id, projectId: project.id };
}

describe("[integration] LoB + projects + template instantiation", () => {
  it("instantiateMilestonesFromTemplate creates one milestone per stage with correct ordering", async () => {
    const template = "caney-posada-onboarding";
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order));
    expect(stages.length).toBe(12);

    const { projectId } = await makeLobWithProject({
      title: "Marta — Caney onboarding",
      templateId: template,
      currentStageId: stages[0].id,
    });

    const created = await instantiateMilestonesFromTemplate({
      projectId,
      templateId: template,
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
    });

    expect(created.length).toBe(12);
    const stored = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
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

  it("listLines computes health from child-project milestones (overdue → red)", async () => {
    const template = "bd-courtship";
    const [stage1] = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order))
      .limit(1);

    const { lobId, projectId } = await makeLobWithProject({
      title: "Overdue venture",
      templateId: template,
      currentStageId: stage1.id,
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await db.insert(milestones).values({
      projectId,
      title: "Send proposal",
      workspaceId: FAKE_WORKSPACE_ID,
      createdBy: FAKE_USER_ID,
      dueDate: yesterday.toISOString().slice(0, 10),
    });

    const list = await listLines({ workspaceId: FAKE_WORKSPACE_ID });
    const subject = list.find((x) => x.id === lobId)!;
    expect(subject.computedHealth).toBe("red");
    expect(subject.milestoneOverdueCount).toBe(1);
  });

  it("getLob returns linked contacts + stages + rolled-up milestones", async () => {
    const template = "vav-creator-campaign";
    const [stage1] = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.templateId, template))
      .orderBy(asc(pipelineStages.order))
      .limit(1);

    const { lobId } = await makeLobWithProject({
      title: "VAV deal",
      templateId: template,
      currentStageId: stage1.id,
    });

    const detail = await getLob({ id: lobId, workspaceId: FAKE_WORKSPACE_ID });
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
