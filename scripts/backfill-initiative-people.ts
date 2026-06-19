#!/usr/bin/env tsx
/**
 * FR-E5 backfill (AC-E5-5a/b). Migrates the roadmap @-mention model away from
 * inline title tokens to the initiative_people join table as the source of truth:
 *
 *   1. parse each initiative title for @tokens → resolve to workspace user ids
 *   2. upsert those into initiative_people (the rows the new bubble control owns)
 *   3. rewrite the title with the tokens stripped (clean prose)
 *
 * Idempotent: once a title has no resolvable tokens it is left untouched, so the
 * script is safe to re-run. Unresolvable tokens are LEFT in the title and logged
 * for manual review (AC-E5-5a) rather than silently dropped.
 *
 *   npx tsx scripts/backfill-initiative-people.ts          # dry run (default)
 *   npx tsx scripts/backfill-initiative-people.ts --apply  # write changes
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildOwnerMaps, resolveMentionUserIds } from "@/db/queries/roadmap";
import { stripMentionTokens, MENTION_TOKEN_RE_G } from "@/lib/roadmap-mentions";

const APPLY = process.argv.includes("--apply");

async function main() {
  const inits = await db
    .select({
      id: schema.initiatives.id,
      workspaceId: schema.initiatives.workspaceId,
      title: schema.initiatives.title,
    })
    .from(schema.initiatives);

  const mapsByWs = new Map<string, Awaited<ReturnType<typeof buildOwnerMaps>>>();
  let titlesChanged = 0;
  let peopleUpserted = 0;
  const unresolved: Array<{ id: string; token: string }> = [];

  for (const init of inits) {
    if (!mapsByWs.has(init.workspaceId))
      mapsByWs.set(init.workspaceId, await buildOwnerMaps(init.workspaceId));
    const maps = mapsByWs.get(init.workspaceId)!;

    const tokens = init.title.match(MENTION_TOKEN_RE_G) ?? [];
    if (tokens.length === 0) continue;

    const userIds = resolveMentionUserIds(init.title, maps);
    // Tokens that resolved → strip them; tokens that didn't → keep + flag.
    const resolvedHandles = new Set(userIds.map((id) => maps.handleByUserId.get(id)));
    const keptTokens = tokens.filter(
      (t) => !resolvedHandles.has(t.slice(1).toLowerCase()) && !userIds.some((id) => maps.handleByUserId.get(id) === t.slice(1).toLowerCase()),
    );
    for (const t of keptTokens) unresolved.push({ id: init.id, token: t });

    // Only strip the RESOLVED tokens (leave unresolved ones in place).
    let newTitle = init.title;
    for (const id of userIds) {
      const handle = maps.handleByUserId.get(id);
      if (handle) newTitle = newTitle.replace(new RegExp(`@${handle}\\b`, "giu"), "");
    }
    newTitle = newTitle.replace(/\s{2,}/g, " ").trim();
    // Fall back to a full strip if the handle-targeted pass left stragglers from
    // alias tokens (first-name vs full-name) — but never blank the title.
    if (userIds.length && newTitle === init.title) {
      const stripped = stripMentionTokens(init.title);
      if (stripped) newTitle = stripped;
    }

    console.log(
      `${init.id}  people:[${userIds.length}]  "${init.title}" -> "${newTitle}"` +
        (keptTokens.length ? `  (kept unresolved: ${keptTokens.join(" ")})` : ""),
    );

    if (APPLY) {
      if (userIds.length) {
        await db
          .insert(schema.initiativePeople)
          .values(userIds.map((userId) => ({ initiativeId: init.id, userId })))
          .onConflictDoNothing();
        peopleUpserted += userIds.length;
      }
      if (newTitle && newTitle !== init.title) {
        await db
          .update(schema.initiatives)
          .set({ title: newTitle })
          .where(eq(schema.initiatives.id, init.id));
        titlesChanged += 1;
      }
    } else {
      if (userIds.length) peopleUpserted += userIds.length;
      if (newTitle && newTitle !== init.title) titlesChanged += 1;
    }
  }

  console.log(
    `\n${APPLY ? "APPLIED" : "DRY RUN"} — ${inits.length} initiatives scanned · ` +
      `${titlesChanged} titles ${APPLY ? "rewritten" : "would change"} · ` +
      `${peopleUpserted} people ${APPLY ? "upserted" : "would upsert"} · ` +
      `${unresolved.length} unresolved token(s) left for review`,
  );
  if (unresolved.length)
    console.log("Unresolved:", unresolved.map((u) => `${u.token}@${u.id.slice(0, 8)}`).join(", "));
  if (!APPLY) console.log("Re-run with --apply to write.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
