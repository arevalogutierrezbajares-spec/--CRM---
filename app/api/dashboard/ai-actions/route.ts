import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";
import { db, schema } from "@/db";
import { claudeChat, isAnthropicConfigured } from "@/lib/anthropic";

const { projects, milestones, contacts } = schema;

interface AIActionOut {
  id: string;
  priority: "high" | "medium" | "low";
  type: "risk" | "follow_up" | "opportunity";
  title: string;
  description: string;
  account?: string;
  source?: string;
  sourceAgeHours?: number;
  suggestedActions?: string[];
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = req.nextUrl.searchParams.get("scope") ?? "daily";

  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 30);

  /* ── Gather lightweight context ─────────────────────────────────────── */

  const [
    overdueTasksRows,
    blockedProjectsRows,
    staleContactsRows,
    stagnantProjectsRows,
  ] = await Promise.all([
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        dueDate: milestones.dueDate,
        projectTitle: projects.title,
      })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(
        and(
          eq(projects.workspaceId, user.workspaceId),
          sql`${milestones.status} <> 'done'`,
          sql`${milestones.dueDate} IS NOT NULL`,
          sql`${milestones.dueDate} < ${today}`,
        ),
      )
      .limit(10),
    db
      .select({
        id: projects.id,
        title: projects.title,
        waitingOn: projects.waitingOn,
        expectedUnblockDate: projects.expectedUnblockDate,
      })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, user.workspaceId),
          eq(projects.status, "waiting"),
        ),
      )
      .limit(10),
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        organization: contacts.organization,
        lastTouchAt: contacts.lastTouchAt,
        relationshipType: contacts.relationshipType,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, user.workspaceId),
          eq(contacts.archived, false),
          or(
            isNull(contacts.lastTouchAt),
            lt(contacts.lastTouchAt, staleCutoff),
          ),
        ),
      )
      .orderBy(contacts.lastTouchAt)
      .limit(10),
    db
      .select({
        id: projects.id,
        title: projects.title,
        updatedAt: projects.updatedAt,
        healthColor: projects.healthColor,
      })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, user.workspaceId),
          eq(projects.status, "active"),
          lt(projects.updatedAt, staleCutoff),
        ),
      )
      .orderBy(desc(projects.updatedAt))
      .limit(10),
  ]);

  const now = Date.now();
  const ageHours = (d: Date | null) =>
    d ? Math.round((now - d.getTime()) / 3_600_000) : null;
  const ageDays = (d: Date | null) =>
    d ? Math.round((now - d.getTime()) / 86_400_000) : null;

  const context = {
    scope,
    overdueTasks: overdueTasksRows.map((t) => ({
      title: t.title,
      project: t.projectTitle,
      dueDate: t.dueDate,
    })),
    blockedProjects: blockedProjectsRows.map((p) => ({
      title: p.title,
      waitingOn: p.waitingOn,
      expectedUnblockDate: p.expectedUnblockDate,
    })),
    staleContacts: staleContactsRows.map((c) => ({
      name: c.name,
      organization: c.organization,
      relationshipType: c.relationshipType,
      daysSinceLastTouch: ageDays(c.lastTouchAt),
    })),
    stagnantProjects: stagnantProjectsRows.map((p) => ({
      title: p.title,
      daysSinceUpdate: ageDays(p.updatedAt),
      health: p.healthColor,
    })),
  };

  const totalSignals =
    context.overdueTasks.length +
    context.blockedProjects.length +
    context.staleContacts.length +
    context.stagnantProjects.length;

  if (totalSignals === 0) {
    return NextResponse.json({ actions: [] });
  }

  const systemPrompt = `You are a chief-of-staff assistant for a CRM. Analyze the user's activity data and return the top action items they should take today.

Return ONLY a JSON array (no markdown, no commentary). Each item must match this schema:
{
  "id": "string (unique slug)",
  "priority": "high" | "medium" | "low",
  "type": "risk" | "follow_up" | "opportunity",
  "account": "string (contact/project name)",
  "source": "crm" (always crm for now),
  "source_age_hours": number,
  "title": "string (max 8 words, action-oriented)",
  "description": "string (max 20 words, why it matters)",
  "suggested_actions": ["string", "string"]
}

Rank by urgency. Return at most 6 items. Use:
- "risk" for blocked projects past expected unblock or overdue tasks > 5 days
- "follow_up" for stale contacts, recently-overdue tasks
- "opportunity" for cold warm contacts that could be revived`;

  const userPrompt = `Activity data (JSON):\n${JSON.stringify(context, null, 2)}\n\nReturn the JSON array now.`;

  const result = await claudeChat({
    model: "claude-haiku-4-5",
    system: systemPrompt,
    prompt: userPrompt.slice(0, 8000),
    maxTokens: 800,
    spend: {
      workspaceId: user.workspaceId,
      userId: user.id,
      direction: "out",
      trackUsage: true,
      payload: { route: "ai-actions", scope },
    },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Strip potential ```json fences and parse
  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Claude returned invalid JSON", raw: result.text }, { status: 502 });
  }

  if (!Array.isArray(parsed)) {
    return NextResponse.json({ error: "Expected array" }, { status: 502 });
  }

  const actions: AIActionOut[] = parsed.slice(0, 6).map((p: Record<string, unknown>, i: number) => ({
    id: String(p.id ?? `act-${i}`),
    priority: (p.priority as AIActionOut["priority"]) ?? "medium",
    type: (p.type as AIActionOut["type"]) ?? "follow_up",
    title: String(p.title ?? "Action"),
    description: String(p.description ?? ""),
    account: p.account ? String(p.account) : undefined,
    source: p.source ? String(p.source) : "crm",
    sourceAgeHours:
      typeof p.source_age_hours === "number" ? p.source_age_hours : undefined,
    suggestedActions: Array.isArray(p.suggested_actions)
      ? (p.suggested_actions as string[]).slice(0, 3)
      : undefined,
  }));

  return NextResponse.json({ actions });
}
