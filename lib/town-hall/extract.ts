import {
  claudeChat,
  isAnthropicConfigured,
  type AnthropicSpendContext,
} from "@/lib/anthropic";

export type ExtractedActionItem = {
  title: string;
  description?: string;
  /** Display name of the suggested assignee (must match a member name). */
  suggestedAssigneeName?: string;
  /** Title of a referenced object (project), best-effort. */
  suggestedRef?: string;
  priority?: "now" | "next" | "later" | "backlog";
};

export type ExtractResult =
  | { ok: true; items: ExtractedActionItem[] }
  | { ok: false; error: string };

/**
 * Paste meeting notes → Claude extracts discrete action items, each with a
 * suggested assignee (from the @names present / provided members) and an
 * optional referenced project. Returns suggestions for the user to CONFIRM —
 * nothing is committed here.
 */
export async function extractActionItems(opts: {
  notes: string;
  memberNames: string[];
  projectTitles: string[];
  spend?: AnthropicSpendContext;
}): Promise<ExtractResult> {
  if (!isAnthropicConfigured()) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const res = await claudeChat({
    // Deterministic structured extraction → Haiku (cheap, fast).
    model: "claude-haiku-4-5",
    system: [
      "You extract action items from meeting notes for a founder's CRM.",
      "Output STRICT JSON ONLY — no preamble, no markdown fences — matching:",
      `{"items":[{"title":"…","description"?:"…","suggestedAssigneeName"?:"…","suggestedRef"?:"…","priority"?:"now"|"next"|"later"|"backlog"}]}`,
      "Rules:",
      "- One item per concrete, actionable to-do. Skip discussion / FYI lines.",
      "- title: imperative, < 100 chars.",
      "- suggestedAssigneeName: ONLY if a person is clearly responsible; it MUST",
      "  be an exact match from the WORKSPACE MEMBERS list. Omit if unsure.",
      "- suggestedRef: ONLY if it clearly relates to one of the PROJECTS; it MUST",
      "  be an exact match from the PROJECTS list. Omit otherwise.",
      "- priority: infer urgency; omit if unclear.",
      "- If there are no action items, return {\"items\":[]}.",
    ].join("\n"),
    prompt: [
      `WORKSPACE MEMBERS: ${opts.memberNames.join(", ") || "(none)"}`,
      `PROJECTS: ${opts.projectTitles.join(", ") || "(none)"}`,
      "",
      "NOTES:",
      opts.notes.slice(0, 8000),
    ].join("\n"),
    maxTokens: 1500,
    spend: opts.spend
      ? {
          ...opts.spend,
          direction: "out",
          trackUsage: opts.spend.trackUsage ?? true,
          payload: {
            ...(typeof opts.spend.payload === "object" && opts.spend.payload !== null
              ? opts.spend.payload
              : {}),
            route: "town-hall:extract-action-items",
          },
        }
      : undefined,
  });

  if (!res.ok) return { ok: false, error: res.error };

  try {
    const text = res.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(text) as { items?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items: ExtractedActionItem[] = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const title = typeof r.title === "string" ? r.title.trim() : "";
      if (!title) continue;
      const priority =
        r.priority === "now" ||
        r.priority === "next" ||
        r.priority === "later" ||
        r.priority === "backlog"
          ? r.priority
          : undefined;
      items.push({
        title: title.slice(0, 200),
        description:
          typeof r.description === "string" && r.description.trim()
            ? r.description.trim()
            : undefined,
        suggestedAssigneeName:
          typeof r.suggestedAssigneeName === "string" &&
          r.suggestedAssigneeName.trim()
            ? r.suggestedAssigneeName.trim()
            : undefined,
        suggestedRef:
          typeof r.suggestedRef === "string" && r.suggestedRef.trim()
            ? r.suggestedRef.trim()
            : undefined,
        priority,
      });
    }
    return { ok: true, items };
  } catch (e) {
    return {
      ok: false,
      error: `parse failed: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }
}
