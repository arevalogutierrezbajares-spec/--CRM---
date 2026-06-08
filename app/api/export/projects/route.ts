import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { listLines } from "@/db/queries/lines-of-business";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status");
  const rows = await listLines({
    workspaceId: user.workspaceId,
    status:
      status === "active" || status === "waiting" || status === "done" || status === "lost"
        ? status
        : undefined,
  });

  const csv = toCsv(
    [
      "id",
      "title",
      "status",
      "health",
      "computedHealth",
      "template",
      "dueDate",
      "waitingOn",
      "expectedUnblockDate",
      "openMilestones",
      "overdueMilestones",
      "contactCount",
      "createdAt",
      "updatedAt",
    ],
    rows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      health: p.healthColor,
      computedHealth: p.computedHealth,
      template: p.templateName,
      dueDate: p.dueDate,
      waitingOn: p.waitingOn,
      expectedUnblockDate: p.expectedUnblockDate,
      openMilestones: p.milestoneOpenCount,
      overdueMilestones: p.milestoneOverdueCount,
      contactCount: p.contactCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="projects-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
