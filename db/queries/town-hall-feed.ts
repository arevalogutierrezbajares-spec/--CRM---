import "server-only";
import { listPosts, type PostView } from "./town-hall";
import { listWorkspaceActivity, type ActivityEvent } from "./activity";

export const DEFAULT_TOWN_HALL_FEED_LIMIT = 60;

/** One row in the Town Hall activity log: a person's post, or a workspace activity event. */
export type FeedItem =
  | { kind: "post"; at: Date; post: PostView }
  | { kind: "activity"; at: Date; activity: ActivityEvent };

/**
 * The central Town Hall feed: top-level posts/messages interleaved with workspace
 * activity (task/action completions, doc adds, milestones, etc.), newest-first.
 * Replies (parentPostId) are folded out of the top-level stream.
 */
export async function listTownHallFeed(opts: {
  workspaceId: string;
  viewerId: string;
  limit?: number;
}): Promise<FeedItem[]> {
  const limit = opts.limit ?? DEFAULT_TOWN_HALL_FEED_LIMIT;
  const sourceLimit = Math.max(limit, DEFAULT_TOWN_HALL_FEED_LIMIT);
  const [posts, activity] = await Promise.all([
    listPosts({ workspaceId: opts.workspaceId, viewerId: opts.viewerId, limit: Math.max(40, Math.ceil(sourceLimit * 0.75)) }),
    listWorkspaceActivity(opts.workspaceId, sourceLimit),
  ]);

  const items: FeedItem[] = [];
  for (const p of posts) if (!p.parentPostId) items.push({ kind: "post", at: p.createdAt, post: p });
  for (const a of activity) items.push({ kind: "activity", at: a.at, activity: a });

  return items
    .filter((i) => i.at instanceof Date)
    .sort((x, y) => y.at.getTime() - x.at.getTime())
    .slice(0, limit);
}

export type { ActivityEvent };
