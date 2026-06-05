import "server-only";
import { createPost } from "@/db/queries/town-hall";
import { handleAgentMessage } from "@/lib/wa-agent/loop";

/** NIGO — the AI teammate's system user id (seeded as a workspace member). */
export const NIGO_USER_ID = "a1100000-0000-4000-8000-000000000001";
export const NIGO_NAME = "NIGO";

export function isNigoMentioned(mentionUserIds: string[]): boolean {
  return mentionUserIds.includes(NIGO_USER_ID);
}

const NIGO_PERSONA = `You are NIGO, the team's sharp AI teammate living in this CRM's Town Hall chat. Address people by first name; warm but concise (1–3 sentences, plain text). You have the FULL toolset — create/find contacts, add & edit tasks and action items, mark milestones done, log meetings & touches, schedule/cancel reminders, attach links, post status reports & daily recaps, look up projects/members. When asked to DO something, do it (preview destructive ops and ask for "yes" first). Never invent data; look things up with your tools.`;

/**
 * NIGO runs the full chief-of-staff agent (27 tools, conversation memory, token
 * cap, confirmation flow) on behalf of the asker, then posts the reply as the
 * NIGO system user (@mentioning the asker so it surfaces in the feed). Best-effort
 * — callers must not block the human's post on a NIGO failure.
 */
export async function runNigoReply(opts: {
  workspaceId: string;
  askerId: string;
  askerName: string;
  question: string;
}): Promise<void> {
  const firstName = opts.askerName.split(/\s+/)[0] || opts.askerName;
  // Strip the @NIGO summon token — the agent shouldn't treat it as a contact mention.
  const body = opts.question.replace(/@nigo\b/gi, "").trim() || "(no message)";

  let text = "";
  try {
    const res = await handleAgentMessage({
      userId: opts.askerId,
      workspaceId: opts.workspaceId,
      body,
      persona: NIGO_PERSONA,
    });
    // Even a non-ok result carries a user-facing reply (e.g. daily budget reached).
    if (res.reply && res.reply.trim()) text = res.reply.trim();
  } catch {
    /* fall through to fallback */
  }
  if (!text) {
    text = `Hey ${firstName}, my brain's offline for a sec — ping me again in a moment.`;
  }

  await createPost({
    workspaceId: opts.workspaceId,
    authorId: NIGO_USER_ID,
    body: text.slice(0, 4000),
    kind: "message",
    mentionUserIds: [opts.askerId],
    refs: [],
    parentPostId: null,
  });
}
