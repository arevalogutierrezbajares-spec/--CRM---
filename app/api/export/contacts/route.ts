import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { listContacts } from "@/db/queries/contacts";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const archived = req.nextUrl.searchParams.get("archived") === "true";
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;
  const projectId = req.nextUrl.searchParams.get("project") ?? undefined;

  const rows = await listContacts({
    workspaceId: user.workspaceId,
    archived,
    tagName: tag,
    projectId,
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
