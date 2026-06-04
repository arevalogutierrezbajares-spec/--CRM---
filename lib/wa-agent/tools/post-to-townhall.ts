/**
 * post_to_townhall — let a teammate post to the workspace Town Hall feed from
 * WhatsApp ("post to town hall: shipped the deck"). Authored as the WA sender.
 */
import { createPost } from "@/db/queries/town-hall";
import { broadcastNewPost } from "@/lib/town-hall/broadcast";
import { safeStr, type ToolEntry } from "./_types";

export const postToTownHall: ToolEntry = {
  definition: {
    name: "post_to_townhall",
    description:
      "Post a short update to the workspace Town Hall feed (the shared team " +
      "channel). Use when the user says to post / share something with the team.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The update to post. Max ~800 chars." },
      },
      required: ["message"],
    },
  },

  async execute(input, ctx) {
    const body = safeStr(input.message, 800);
    if (!body) return { ok: false, error: "Nothing to post." };
    await createPost({
      workspaceId: ctx.workspaceId,
      authorId: ctx.userId,
      body,
      mentionUserIds: [],
      refs: [],
    });
    // Notify any open web feeds (no browser did the client-side broadcast here).
    await broadcastNewPost(ctx.workspaceId);
    return {
      ok: true,
      data: { posted: true },
      speak: `Posted to Town Hall: "${body.length > 60 ? body.slice(0, 60) + "…" : body}"`,
    };
  },
};
