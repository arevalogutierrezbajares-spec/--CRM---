import {
  claudeChat,
  isAnthropicConfigured,
  type AnthropicSpendContext,
} from "@/lib/anthropic";

export type TriageVerdict = {
  category: "spam" | "new-contact" | "project-relevant" | "personal" | "unknown";
  confidence: number; // 0..1
  rationale: string;
  suggestedContactName?: string;
};

/**
 * AGB-700 — given an inbound message from an unknown sender, ask Claude to
 * classify it. Returns a soft verdict so the inbound handler can decide
 * whether to auto-create a contact, escalate, or drop silently.
 *
 * Falls back to a permissive "unknown" verdict when Claude isn't configured —
 * the caller still drops silently in that case (current default).
 */
export async function triageInbound(opts: {
  from: string;
  subject?: string;
  body: string;
  spend?: AnthropicSpendContext;
}): Promise<TriageVerdict> {
  if (!isAnthropicConfigured()) {
    return {
      category: "unknown",
      confidence: 0,
      rationale: "ANTHROPIC_API_KEY not set; triage skipped.",
    };
  }

  const res = await claudeChat({
    // Deterministic classification → Haiku (~15× cheaper than Opus).
    model: "claude-haiku-4-5",
    system:
      [
        "You triage inbound emails to a single founder's CRM.",
        "Output strict JSON only — no preamble, no markdown — matching:",
        `{"category":"spam"|"new-contact"|"project-relevant"|"personal"|"unknown","confidence":0..1,"rationale":"…","suggestedContactName"?:"…"}`,
        "Rules:",
        "- spam: cold outreach from sales SaaS, automated lists, link bait",
        "- new-contact: a real human reaching out for the first time about something specific",
        "- project-relevant: looks like it relates to an existing customer/project (contracts, replies, ops)",
        "- personal: friend/family/admin (banking, doctor, etc.)",
        "- unknown: not enough signal",
      ].join("\n"),
    prompt: [
      `From: ${opts.from}`,
      opts.subject ? `Subject: ${opts.subject}` : null,
      "",
      opts.body.slice(0, 4000),
    ]
      .filter(Boolean)
      .join("\n"),
    maxTokens: 300,
    spend: opts.spend
      ? {
          ...opts.spend,
          direction: "in",
          trackUsage: opts.spend.trackUsage ?? true,
          payload: {
            ...(typeof opts.spend.payload === "object" && opts.spend.payload !== null
              ? opts.spend.payload
              : {}),
            route: "postmark:triage",
          },
        }
      : undefined,
  });

  if (!res.ok) {
    return {
      category: "unknown",
      confidence: 0,
      rationale: `Claude error: ${res.error}`,
    };
  }
  try {
    // Be tolerant of code fences.
    const text = res.text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(text) as TriageVerdict;
    if (
      !parsed ||
      typeof parsed.category !== "string" ||
      typeof parsed.confidence !== "number"
    ) {
      throw new Error("malformed");
    }
    return parsed;
  } catch (e) {
    return {
      category: "unknown",
      confidence: 0,
      rationale: `parse failed: ${e instanceof Error ? e.message : "unknown"}; raw=${res.text.slice(0, 120)}`,
    };
  }
}
