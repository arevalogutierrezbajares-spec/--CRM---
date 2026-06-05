import "server-only";
import { claudeChat } from "@/lib/anthropic";
import { listPosts, createPost } from "@/db/queries/town-hall";
import { listKpis } from "@/db/queries/okrs";

/** NIGO — the AI teammate's system user id (seeded as a workspace member). */
export const NIGO_USER_ID = "a1100000-0000-4000-8000-000000000001";
export const NIGO_NAME = "NIGO";

export function isNigoMentioned(mentionUserIds: string[]): boolean {
  return mentionUserIds.includes(NIGO_USER_ID);
}

const SYSTEM = `You are NIGO, the friendly AI teammate inside this team's "Town Hall" chat — an internal founder/chief-of-staff CRM for a Venezuela-focused venture group (CaneyCloud posada PMS, VAV tourism marketplace, a restaurant vertical, BD/capital pipeline).

You are summoned with @NIGO. Reply like a sharp, concise teammate in a chat thread:
- 1–3 short sentences. Warm but no fluff, no "Hi"/"Best regards", no markdown headings.
- Always address the asker by their first name.
- Use ONLY the provided context (recent messages + KPIs). Never invent numbers, names, or status.
- If you genuinely don't know from the context, say so briefly.
- You cannot take actions yet (create tasks, send messages). If asked to, say you can't act yet and suggest the fastest manual step (e.g. "drop it in Action items with the + above").`;

/**
 * NIGO reads recent Town Hall context + the current KPIs and posts a concise,
 * workspace-aware reply (a top-level message @mentioning the asker, so it's
 * visible in the activity feed). Best-effort — callers should not block the
 * original post on a NIGO failure.
 */
export async function runNigoReply(opts: {
  workspaceId: string;
  askerId: string;
  askerName: string;
  question: string;
}): Promise<void> {
  const firstName = opts.askerName.split(/\s+/)[0] || opts.askerName;

  const [recent, kpis] = await Promise.all([
    listPosts({ workspaceId: opts.workspaceId, limit: 10 }).catch(() => []),
    listKpis(opts.workspaceId).catch(() => []),
  ]);

  const convo = recent
    .filter((p) => !p.parentPostId)
    .reverse()
    .map((p) => `${p.authorName}: ${p.body}`)
    .join("\n")
    .slice(0, 2000);

  const kpiLines = kpis
    .map((k) => {
      const val = k.binary
        ? k.progress >= 1
          ? "done"
          : "pending"
        : `${k.current}/${k.target}${k.unit ? ` ${k.unit}` : ""}`;
      return `- ${k.title}: ${val} (${k.paceHealth})`;
    })
    .join("\n");

  const prompt = `Recent Town Hall messages (oldest→newest):
${convo || "(none yet)"}

Current KPIs:
${kpiLines || "(none set)"}

${firstName} just asked you:
"${opts.question}"

Write NIGO's reply (address ${firstName} by name).`;

  let text = "";
  try {
    const res = await claudeChat({ system: SYSTEM, prompt, maxTokens: 400 });
    if (res.ok) text = res.text.trim();
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
