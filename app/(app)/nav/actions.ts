"use server";

import { requireUser } from "@/lib/current-user";
import { listProjectLinks } from "@/db/queries/projects";

export type TreeDoc = {
  id: string;
  label: string;
  kind: "note" | "link" | "file" | "doc";
  /** Where clicking the node goes. External (link) opens in a new tab. */
  href: string;
  external: boolean;
};

/**
 * Children of a project node in the sidebar Explorer tree — its docs/links.
 * Lazy-loaded on first expand (so we don't fetch every project's docs upfront).
 */
export async function listProjectDocsAction(projectId: string): Promise<TreeDoc[]> {
  const user = await requireUser();
  const links = await listProjectLinks({ projectId, workspaceId: user.workspaceId });
  return links.map((l) => {
    if (l.kind === "doc") {
      return { id: l.id, label: l.label, kind: l.kind, href: `/projects/${projectId}/docs/${l.id}`, external: false };
    }
    if (l.kind === "link" && l.url) {
      return { id: l.id, label: l.label, kind: l.kind, href: l.url, external: true };
    }
    // file / note (and url-less links) live on the project page.
    return { id: l.id, label: l.label, kind: l.kind, href: `/projects/${projectId}`, external: false };
  });
}
