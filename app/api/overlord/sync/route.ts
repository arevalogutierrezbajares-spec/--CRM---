import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { syncOverlord } from "@/lib/overlord-sync";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await syncOverlord(user.workspaceId);
  return NextResponse.json(result);
}
