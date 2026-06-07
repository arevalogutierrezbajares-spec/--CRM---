"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/current-user";
import { getProjectLinkById } from "@/db/queries/lines-of-business";
import { createProjectDoc, saveProjectDocContent } from "@/db/queries/docs";
import * as schema from "@/db/schema";

type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const CATEGORIES = schema.linkCategory.enumValues as readonly string[];

function coerceCategory(value?: string) {
  return (CATEGORIES.includes(value ?? "")
    ? value
    : "other") as (typeof schema.linkCategory.enumValues)[number];
}

/** Create a blank collaborative doc and return its id (= the project_links id). */
export async function createDocAction(opts: {
  lobId: string;
  label?: string;
  category?: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const label = opts.label?.trim() || "Untitled doc";
  const { linkId } = await createProjectDoc({
    workspaceId: user.workspaceId,
    lobId: opts.lobId,
    actorId: user.id,
    label,
    category: coerceCategory(opts.category),
  });
  revalidatePath(`/lob/${opts.lobId}`);
  return { ok: true, id: linkId };
}

/**
 * Autosave a doc's content. Any workspace member may edit a doc (that's the
 * point of collaboration), so authorization is workspace membership — enforced
 * by looking the row up scoped to the caller's workspace.
 */
export async function saveDocContentAction(opts: {
  linkId: string;
  ydoc: string;
  text: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const link = await getProjectLinkById({
    linkId: opts.linkId,
    workspaceId: user.workspaceId,
  });
  if (!link || link.kind !== "doc") return { ok: false, error: "Doc not found" };

  await saveProjectDocContent({
    linkId: opts.linkId,
    workspaceId: user.workspaceId,
    actorId: user.id,
    ydoc: opts.ydoc,
    text: opts.text,
  });
  return { ok: true };
}
