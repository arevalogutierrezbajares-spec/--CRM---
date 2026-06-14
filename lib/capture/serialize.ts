import type { PostView } from "@/db/queries/town-hall";

/** PostView → the helper's wire shape. Shared by /api/capture/posts + /notes. */
export function serializePost(p: PostView) {
  return {
    id: p.id,
    author: p.authorName,
    body: p.body,
    kind: p.kind,
    createdAt: p.createdAt.toISOString(),
    references: p.refs.map((r) => ({ kind: r.refType, id: r.refId, label: r.label })),
    mentions: p.mentions.map((m) => ({ id: m.userId, name: m.displayName })),
    reactions: p.reactions.map((r) => ({ emoji: r.emoji, count: r.count, reactedByMe: r.mine })),
  };
}
