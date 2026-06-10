import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { listContacts, type ContactLeadMode } from "@/db/queries/contacts";
import { toCsv } from "@/lib/csv";

function parseLeadMode(value: string | null): ContactLeadMode {
  if (value === "leads" || value === "all") return value;
  return "direct";
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const archived = req.nextUrl.searchParams.get("archived") === "true";
  // ?tag= and ?project= accept comma lists (matches the grid's multi-select filters).
  const splitList = (v: string | null) =>
    (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const tagNames = splitList(req.nextUrl.searchParams.get("tag"));
  const projectIds = splitList(req.nextUrl.searchParams.get("project"));
  const leadMode = parseLeadMode(req.nextUrl.searchParams.get("leadView"));

  const rows = await listContacts({
    workspaceId: user.workspaceId,
    archived,
    tagNames,
    projectIds,
    leadMode,
  });

  const csv = toCsv(
    [
      "id",
      "name",
      "type",
      "relationship",
      "organization",
      "projects",
      "tags",
      "channels",
      "lastTouchAt",
      "introChainFromText",
      "createdAt",
      "updatedAt",
    ],
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      relationship: c.relationshipType,
      organization: c.organization,
      projects: c.projects.map((p) => p.title).join("|"),
      tags: c.tags.map((t) => t.name).join("|"),
      channels: c.channels
        .map((ch) => `${ch.kind}:${ch.value}${ch.isPrimary ? "*" : ""}`)
        .join("|"),
      lastTouchAt: c.lastTouchAt,
      introChainFromText: c.introChainFromText,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
