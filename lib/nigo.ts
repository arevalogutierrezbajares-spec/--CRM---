import "server-only";
import { and, eq } from "drizzle-orm";
import { createPost } from "@/db/queries/town-hall";
import { handleAgentMessage } from "@/lib/wa-agent/loop";
import { NIGO_DISPLAY_NAME, NIGO_USER_ID } from "@/lib/nigo-brand";
import { db, schema } from "@/db";

/** ÑIGO — the AI teammate's system user. */
export const NIGO_NAME = NIGO_DISPLAY_NAME;

export function isNigoMentioned(mentionUserIds: string[]): boolean {
  return mentionUserIds.includes(NIGO_USER_ID);
}

const NIGO_PERSONA = `You are ÑIGO, the owner's AI operator in this CRM's Town Hall chat. Address people by first name; warm but concise (1-3 sentences, plain text). You have the FULL toolset: create/find/edit contacts, create/find/edit initiatives, create/edit sprints, and add/edit tasks and action items, mark milestones done, log meetings and touches, schedule/cancel reminders, attach links, post status reports and daily recaps, and look up projects/members. When asked to DO something, do it. Preview destructive ops and ask for "yes" first. Never invent data; look things up with your tools.`;

type WorkspaceRole = "owner" | "admin" | "member";
const FULL_NIGO_ROLES: WorkspaceRole[] = ["owner", "admin"];

async function isNigoEligibleForFullTools(workspaceId: string, askerId: string): Promise<boolean> {
  const [member] = await db
    .select({ role: schema.workspaceMembers.role })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, askerId),
      ),
    )
    .limit(1);

  return FULL_NIGO_ROLES.includes((member?.role as WorkspaceRole) ?? "member");
}

/**
 * ÑIGO runs the full chief-of-staff agent (27 tools, conversation memory, token
 * cap, confirmation flow) on behalf of the asker, then posts the reply as the
 * ÑIGO system user (@mentioning the asker so it surfaces in the feed). Best-effort:
 * callers must not block the human's post on a ÑIGO failure.
 */
export async function runNigoReply(opts: {
  workspaceId: string;
  askerId: string;
  askerName: string;
  question: string;
}): Promise<void> {
  if (!(await isNigoEligibleForFullTools(opts.workspaceId, opts.askerId))) {
    const firstName = opts.askerName.split(/\s+/)[0] || opts.askerName;
    await createPost({
      workspaceId: opts.workspaceId,
      authorId: NIGO_USER_ID,
      body: `${firstName}, I'm only allowed to run full CRM updates for workspace owners and admins right now.`,
      kind: "message",
      mentionUserIds: [opts.askerId],
      refs: [],
      parentPostId: null,
    });
    return;
  }

  const firstName = opts.askerName.split(/\s+/)[0] || opts.askerName;
  // Strip the summon token so the agent does not treat it as a contact mention.
  const body = opts.question.replace(/@(nigo|ñigo)\b/giu, "").trim() || "(no message)";

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
