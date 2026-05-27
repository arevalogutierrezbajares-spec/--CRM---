import { and, eq, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts } = schema;

export type NetworkNode = {
  id: string;
  name: string;
  relationshipType: "friend" | "lead" | "partner" | "prospect";
  organization: string | null;
  introducerText: string | null;
  introducerId: string | null;
  children: NetworkNode[];
};

export type NetworkLens = "all" | "friend";

/**
 * Builds the intro-chain forest for a user. Each tree is rooted at a contact
 * that has no `intro_chain_from_contact_id` (a "discovered them on my own"
 * contact); children are contacts that point back via `intro_chain_from_contact_id`.
 *
 * Lens "friend" filters the resulting trees to only include subtrees that
 * contain at least one friend.
 */
export async function buildNetwork(opts: {
  workspaceId: string;
  lens: NetworkLens;
}): Promise<NetworkNode[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      relationshipType: contacts.relationshipType,
      organization: contacts.organization,
      introducerId: contacts.introChainFromContactId,
      introducerText: contacts.introChainFromText,
    })
    .from(contacts)
    .where(
      and(eq(contacts.workspaceId, opts.workspaceId), eq(contacts.archived, false)),
    );

  const byParent = new Map<string | null, typeof rows>();
  for (const r of rows) {
    const key = r.introducerId ?? null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(r);
    else byParent.set(key, [r]);
  }

  function build(parentId: string | null): NetworkNode[] {
    const children = byParent.get(parentId) ?? [];
    return children.map((r) => ({
      id: r.id,
      name: r.name,
      relationshipType: r.relationshipType,
      organization: r.organization,
      introducerId: r.introducerId,
      introducerText: r.introducerText,
      children: build(r.id),
    }));
  }

  const forest = build(null);

  if (opts.lens === "all") return forest;
  // "friend" lens: prune subtrees with no friend node.
  return forest.map(pruneToFriend).filter(Boolean) as NetworkNode[];
}

function pruneToFriend(node: NetworkNode): NetworkNode | null {
  const prunedChildren = node.children
    .map(pruneToFriend)
    .filter(Boolean) as NetworkNode[];
  const keep =
    node.relationshipType === "friend" || prunedChildren.length > 0;
  if (!keep) return null;
  return { ...node, children: prunedChildren };
}

/** Look up the orphans separately so the UI can call them out. */
export async function listOrphanContacts(workspaceId: string) {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      relationshipType: contacts.relationshipType,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.workspaceId, workspaceId),
        eq(contacts.archived, false),
        isNull(contacts.introChainFromContactId),
        or(
          isNull(contacts.introChainFromText),
          eq(contacts.introChainFromText, ""),
        ),
      ),
    );
}
