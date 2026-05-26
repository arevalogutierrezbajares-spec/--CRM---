import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getCurrentUser } from "@/lib/current-user";

/**
 * AGB-407 — "Not useful" feedback.
 *
 * Persisted to a flat file under FEEDBACK_LOG_PATH (or /tmp/agb-feedback.jsonl
 * in dev). That's intentionally low-tech: we can rotate into a DB table later
 * if signal warrants, but for v1 we just want the data captured.
 *
 * Payload shape:
 *   { surface: 'reintro' | 'weekly-briefing' | 'post-meeting' | string,
 *     subjectId: string | null,
 *     vote: 'down' | 'up',
 *     note?: string }
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = (await req.json().catch(() => null)) as
    | {
        surface?: string;
        subjectId?: string | null;
        vote?: "up" | "down";
        note?: string;
      }
    | null;
  if (!payload || !payload.surface || !payload.vote) {
    return NextResponse.json({ error: "surface + vote required" }, { status: 400 });
  }

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    userId: user.id,
    surface: payload.surface,
    subjectId: payload.subjectId ?? null,
    vote: payload.vote,
    note: payload.note ?? null,
  });

  const file =
    process.env.FEEDBACK_LOG_PATH ?? path.join("/tmp", "agb-feedback.jsonl");
  try {
    await fs.appendFile(file, entry + "\n");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Append failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
