import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { graph } from "@/lib/brain/data/graph";
import { searchBrain } from "@/lib/brain/search";

/**
 * GET /api/brain/search?q=…&limit=20
 * Deterministic rebuild-guard over brain-graph.json. Auth required.
 */
export async function GET(req: Request) {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitRaw)
    ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
    : 20;

  if (!q.trim()) {
    return NextResponse.json(
      { error: "q is required", safeToBuild: false, matches: [] },
      { status: 400 },
    );
  }

  const result = searchBrain(graph, q, limit);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
