"use server";

import { requireUser } from "@/lib/current-user";
import { listProjectsForPicker, listWorkspaceDocs } from "@/db/queries/items";
import { listRecentProjects } from "@/db/queries/pins";
import { listWorkspaceMembers } from "@/db/queries/team";
import { listObjectives, quarterOf } from "@/db/queries/okrs";
import { todayInTz } from "@/lib/date/today";

/** Projects for the command palette's "Go to project" + capture resolution. */
export async function paletteProjectsAction(): Promise<{ id: string; title: string }[]> {
  const user = await requireUser();
  return listProjectsForPicker(user.workspaceId);
}

export type PaletteEntity = { id: string; label: string; href: string; sub?: string };

export type PaletteData = {
  recent: PaletteEntity[];
  projects: PaletteEntity[];
  docs: PaletteEntity[];
  people: PaletteEntity[];
  objectives: PaletteEntity[];
};

/** Everything the palette can navigate to — projects, docs, people, OKRs + recents. */
export async function paletteDataAction(): Promise<PaletteData> {
  const user = await requireUser();
  const quarter = quarterOf(new Date(todayInTz(user.timezone)));
  const [projects, docs, members, recents, objectives] = await Promise.all([
    listProjectsForPicker(user.workspaceId),
    listWorkspaceDocs(user.workspaceId),
    listWorkspaceMembers(user.workspaceId),
    listRecentProjects(user.workspaceId, user.id, 6),
    listObjectives(user.workspaceId, quarter),
  ]);
  return {
    recent: recents.map((p) => ({ id: p.id, label: p.title, href: `/projects/${p.id}` })),
    projects: projects.map((p) => ({ id: p.id, label: p.title, href: `/projects/${p.id}` })),
    docs: docs.map((d) => ({ id: d.refId, label: d.label, href: d.href, sub: d.projectTitle })),
    people: members.map((m) => ({ id: m.userId, label: m.displayName, href: `/team`, sub: m.email })),
    objectives: objectives.map((o) => ({ id: o.id, label: o.title, href: `/priorities`, sub: o.quarter })),
  };
}
