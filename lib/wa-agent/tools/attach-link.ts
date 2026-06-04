import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { createProjectLink } from "@/db/queries/projects";
import { validateLinkUrl } from "@/lib/project-links/validate";
import { detectCategory } from "@/lib/project-links/detect-category";
import { brandForUrl } from "@/lib/project-links/host-brands";
import { safeStr, type ToolEntry } from "./_types";

const { projects } = schema;

const CATEGORIES = [
  "business",
  "marketing",
  "tech",
  "ops",
  "design",
  "finance",
  "other",
] as const;
type Category = (typeof CATEGORIES)[number];

async function resolveProject(
  workspaceId: string,
  projectId: string,
  projectQuery: string,
): Promise<
  | { ok: true; id: string; title: string }
  | { ok: false; error: string }
> {
  if (projectId) {
    const [p] = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1);
    return p
      ? { ok: true, ...p }
      : { ok: false, error: "No project with that id in this workspace" };
  }
  if (projectQuery) {
    const rows = await db
      .select({ id: projects.id, title: projects.title })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          ilike(projects.title, `%${projectQuery}%`),
        ),
      )
      .limit(2);
    if (rows.length === 0) return { ok: false, error: "No matching project" };
    if (rows.length > 1) {
      return {
        ok: false,
        error: `Multiple projects match "${projectQuery}" — ask which one, or pass project_id.`,
      };
    }
    return { ok: true, ...rows[0] };
  }
  return { ok: false, error: "Provide project_id or project_query" };
}

export const attachLink: ToolEntry = {
  definition: {
    name: "attach_link",
    description:
      "Attach a URL (Google Doc, Figma, repo, dashboard, etc.) to a project. " +
      "Resolve the project with project_id or project_query. The label and " +
      "category are auto-detected from the URL when omitted.",
    input_schema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "Exact project id (preferred)" },
        project_query: {
          type: "string",
          description: "Project title fragment, used only if project_id is absent",
        },
        url: { type: "string", description: "The https:// URL to attach" },
        label: {
          type: "string",
          description: "Optional display label; defaults to the brand/host name",
        },
        category: {
          type: "string",
          enum: [...CATEGORIES],
          description: "Optional; auto-detected from the URL when omitted",
        },
      },
      required: ["url"],
    },
  },
  async execute(input, ctx) {
    const url = safeStr(input.url, 2048);
    const validation = validateLinkUrl(url);
    if (!validation.ok) return { ok: false, error: validation.error };
    const cleanUrl = validation.url;

    const project = await resolveProject(
      ctx.workspaceId,
      safeStr(input.project_id, 64),
      safeStr(input.project_query, 120),
    );
    if (!project.ok) return { ok: false, error: project.error };

    const rawCat = safeStr(input.category, 20) as Category;
    const category: Category = (CATEGORIES as readonly string[]).includes(rawCat)
      ? rawCat
      : detectCategory(cleanUrl);

    const label = safeStr(input.label, 200) || brandForUrl(cleanUrl) || cleanUrl;

    const row = await createProjectLink({
      workspaceId: ctx.workspaceId,
      projectId: project.id,
      actorId: ctx.userId,
      label,
      url: cleanUrl,
      category,
      description: null,
    });

    return {
      ok: true,
      data: { linkId: row.id, projectTitle: project.title, category, label },
      speak: `Added "${label}" (${category}) to ${project.title}.`,
    };
  },
};
