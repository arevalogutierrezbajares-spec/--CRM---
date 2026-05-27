import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts } = schema;

export type WarmPathNode = {
  id: string;
  name: string;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  organization: string | null;
};

/**
 * AGB-204 — find the shortest intro path from one of your friends (or you) to
 * the target. Walks the intro_chain_from_contact_id edge backwards: target
 * was introduced by X, who was introduced by Y, …
 *
 * Returns the path as `[target, ..., root]` (closest to root last) — so the
 * caller can render "you → X → Y → target" by reversing.
 *
 * Limitations: today the graph is single-edge (a contact has exactly one
 * `introducer_id`). Real-world many-paths are out of scope until the schema
 * grows a `contact_introductions` join table.
 */
export async function findWarmPath(opts: {
  workspaceId: string;
  toContactId: string;
}): Promise<WarmPathNode[] | null> {
  const owned = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      relationshipType: contacts.relationshipType,
      organization: contacts.organization,
      introducerId: contacts.introChainFromContactId,
    })
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, opts.workspaceId), eq(contacts.archived, false)),
    );

  const byId = new Map(owned.map((c) => [c.id, c]));
  const target = byId.get(opts.toContactId);
  if (!target) return null;

  // Walk introducer chain until we hit a friend or root.
  const path: WarmPathNode[] = [];
  const seen = new Set<string>();
  let cursor: typeof target | undefined = target;
  while (cursor) {
    if (seen.has(cursor.id)) break; // cycle guard
    seen.add(cursor.id);
    path.push({
      id: cursor.id,
      name: cursor.name,
      relationshipType: cursor.relationshipType,
      organization: cursor.organization,
    });
    if (cursor.relationshipType === "friend") return path;
    if (!cursor.introducerId) break;
    cursor = byId.get(cursor.introducerId);
  }
  // No friend root reached. Return the chain we have so the UI can show what
  // we know (caller decides whether to render).
  return path.length > 0 ? path : null;
}
