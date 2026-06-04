"use server";

import { requireUser } from "@/lib/current-user";
import { listProjectLinks } from "@/db/queries/projects";

export type TreeDoc = {
  id: string;
  label: string;
  kind: "note" | "link" | "file" | "doc";
  /** Doc section (link_category): business/marketing/tech/ops/design/finance/other. */
  category: string;
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
    const base = { id: l.id, label: l.label, kind: l.kind, category: l.category };
    if (l.kind === "doc") {
      return { ...base, href: `/projects/${projectId}/docs/${l.id}`, external: false };
    }
    if (l.kind === "link" && l.url) {
      return { ...base, href: l.url, external: true };
    }
    // file / note (and url-less links) live on the project page.
    return { ...base, href: `/projects/${projectId}`, external: false };
  });
}
