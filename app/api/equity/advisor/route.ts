import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";
import { EQUITY_ROLE_BANDS } from "@/lib/equity/demo-data";
import { buildDeterministicAdvisor } from "@/lib/equity/calculations";
import type { EquityAdvisorResult } from "@/lib/equity/types";

const requestSchema = z.object({
  roleBandId: z.string().min(1),
  proposedBps: z.number().int().min(1).max(2_500),
  vestingMonths: z.number().int().min(1).max(96),
  cliffMonths: z.number().int().min(0).max(48),
  deliverableCount: z.number().int().min(0).max(20),
  criticalDeliverables: z.number().int().min(0).max(20),
  availablePoolBps: z.number().int().min(0).max(10_000),
});

const resultSchema = z.object({
  decision: z.enum(["approve", "revise", "hold"]),
  confidence: z.number().int().min(0).max(100),
  headline: z.string().min(1).max(160),
  rationale: z.string().min(1).max(700),
  suggestedTerms: z.array(z.string().min(1).max(180)).min(1).max(5),
  risks: z.array(z.string().min(1).max(180)).min(1).max(5),
  questions: z.array(z.string().min(1).max(180)).min(1).max(5),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: z.infer<typeof requestSchema>;
  try {
    payload = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid advisor input" }, { status: 400 });
  }

  const roleBand = EQUITY_ROLE_BANDS.find((r) => r.id === payload.roleBandId);
  if (!roleBand) {
    return NextResponse.json({ error: "Unknown role band" }, { status: 400 });
  }

  const fallback = buildDeterministicAdvisor({
    scenario: payload,
    roleBand,
    availablePoolBps: payload.availablePoolBps,
  });

  if (!isAnthropicConfigured()) {
    return NextResponse.json({ advisor: fallback });
  }

  const system = `You are the equity governance advisor inside a founder CRM.

Your job:
- Help the founder reason about equity grants, vesting, deliverables, dilution, and governance.
- Be practical, conservative, and business-focused.
- Never provide legal, tax, accounting, or securities advice.
- Return only valid JSON. No markdown. No commentary outside JSON.

JSON schema:
{
  "decision": "approve" | "revise" | "hold",
  "confidence": number from 0 to 100,
  "headline": "short decision headline",
  "rationale": "plain English explanation",
  "suggestedTerms": ["specific term"],
  "risks": ["specific risk"],
  "questions": ["question founder should answer before issuing"]
}`;

  const prompt = `Founder: ${user.displayName} <${user.email}>
Role band: ${JSON.stringify(roleBand)}
Scenario: ${JSON.stringify(payload)}
Deterministic baseline: ${JSON.stringify(fallback)}

Return the JSON object now.`;

  const result = await claudeChat({
    system,
    prompt,
    maxTokens: 1_200,
  });

  if (!result.ok) {
    return NextResponse.json({ advisor: fallback });
  }

  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  try {
    const parsed = resultSchema.parse(JSON.parse(cleaned));
    const advisor: EquityAdvisorResult = {
      mode: "ai",
      decision: parsed.decision,
      confidence: parsed.confidence,
      headline: parsed.headline,
      rationale: parsed.rationale,
      suggestedTerms: parsed.suggestedTerms,
      risks: parsed.risks,
      questions: parsed.questions,
    };
    return NextResponse.json({ advisor });
  } catch {
    return NextResponse.json({ advisor: fallback });
  }
}
