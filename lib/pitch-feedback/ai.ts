import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";
import type { PitchFeedbackInsightDraft } from "./types";

type ResponseForInsight = {
  sectionKey: string;
  promptKey: string;
  responseType: string;
  value: Record<string, unknown>;
};

function textValue(value: Record<string, unknown>) {
  const raw =
    typeof value.text === "string"
      ? value.text
      : typeof value.value === "string"
        ? value.value
        : typeof value.reaction === "string"
          ? value.reaction
          : "";
  return raw.trim();
}

function fallbackInsight(responses: ResponseForInsight[]): PitchFeedbackInsightDraft {
  const texts = responses.map((r) => textValue(r.value)).filter(Boolean);
  const joined = texts.join(" ").toLowerCase();
  const hasConcern =
    joined.includes("confus") ||
    joined.includes("skept") ||
    joined.includes("weak") ||
    joined.includes("risk") ||
    joined.includes("excessive");
  const hasPositive =
    joined.includes("clear") ||
    joined.includes("useful") ||
    joined.includes("exciting") ||
    joined.includes("reasonable");

  const objections = responses
    .filter((r) => r.responseType === "objection" || textValue(r.value).match(/weak|risk|confus|excessive/i))
    .map((r) => textValue(r.value))
    .filter(Boolean)
    .slice(0, 5);

  const positiveSignals = responses
    .filter((r) => textValue(r.value).match(/clear|useful|exciting|reasonable|yes/i))
    .map((r) => textValue(r.value))
    .filter(Boolean)
    .slice(0, 5);

  const sentiment = hasConcern && hasPositive ? "mixed" : hasConcern ? "mixed" : hasPositive ? "positive" : "neutral";
  const supportLevel = sentiment === "positive" ? "supportive" : sentiment === "mixed" ? "curious" : "curious";

  return {
    model: "heuristic",
    summary:
      texts.length > 0
        ? `Feedback captured across ${responses.length} prompt${responses.length === 1 ? "" : "s"}. Main signal: ${texts[0].slice(0, 220)}${texts[0].length > 220 ? "..." : ""}`
        : "Feedback completed with limited written detail. Review section reactions and scores before following up.",
    sentiment,
    confidenceScore: sentiment === "positive" ? 78 : sentiment === "mixed" ? 62 : 55,
    supportLevel,
    objections,
    confusionPoints: objections.slice(0, 3),
    positiveSignals,
    recommendedFollowup:
      objections.length > 0
        ? "Reply with thanks, acknowledge the strongest objection, and ask for a quick clarification call."
        : "Reply with thanks and ask whether they are willing to review the revised version or suggest one useful intro.",
    suggestedPitchEdits: objections.slice(0, 3).map((objection) => ({
      suggestion: `Clarify or add proof around: ${objection.slice(0, 140)}`,
    })),
  };
}

function parseInsightJson(value: string): PitchFeedbackInsightDraft | null {
  try {
    const parsed = JSON.parse(value) as Partial<PitchFeedbackInsightDraft>;
    if (!parsed.summary || !parsed.sentiment || !parsed.supportLevel) return null;
    return {
      model: parsed.model ?? "claude-haiku-4-5",
      summary: parsed.summary,
      sentiment: parsed.sentiment,
      confidenceScore: Math.max(0, Math.min(100, Number(parsed.confidenceScore ?? 65))),
      supportLevel: parsed.supportLevel,
      objections: Array.isArray(parsed.objections) ? parsed.objections.slice(0, 8) : [],
      confusionPoints: Array.isArray(parsed.confusionPoints) ? parsed.confusionPoints.slice(0, 8) : [],
      positiveSignals: Array.isArray(parsed.positiveSignals) ? parsed.positiveSignals.slice(0, 8) : [],
      recommendedFollowup: parsed.recommendedFollowup ?? "Follow up with a short thank-you and one specific next ask.",
      suggestedPitchEdits: Array.isArray(parsed.suggestedPitchEdits)
        ? parsed.suggestedPitchEdits.slice(0, 8)
        : [],
    };
  } catch {
    return null;
  }
}

export async function generatePitchFeedbackInsight(input: {
  contactName: string;
  campaignName: string;
  responses: ResponseForInsight[];
  workspaceId?: string;
  userId?: string;
}): Promise<PitchFeedbackInsightDraft> {
  const fallback = fallbackInsight(input.responses);
  if (!isAnthropicConfigured()) return fallback;

  const responsePayload = input.responses.map((response) => ({
    sectionKey: response.sectionKey,
    promptKey: response.promptKey,
    responseType: response.responseType,
    value: response.value,
  }));

  const result = await claudeChat({
    model: "claude-haiku-4-5",
    maxTokens: 900,
    system:
      "You are AGB CRM Active Brain. Analyze private pitch feedback for a founder. Output compact JSON only. Never invent facts. Keep follow-up human-approved.",
    prompt: JSON.stringify({
      instruction:
        "Return JSON with keys: summary, sentiment, confidenceScore, supportLevel, objections, confusionPoints, positiveSignals, recommendedFollowup, suggestedPitchEdits. sentiment must be positive|neutral|mixed|negative. supportLevel must be champion|supportive|curious|skeptical|disengaged. suggestedPitchEdits is array of {sectionKey?, suggestion}.",
      contactName: input.contactName,
      campaignName: input.campaignName,
      responses: responsePayload,
    }),
    spend: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      trackUsage: true,
      direction: "tool",
      payload: { surface: "pitch_feedback_summary" },
    },
  });

  if (!result.ok) return fallback;
  return parseInsightJson(result.text) ?? fallback;
}
