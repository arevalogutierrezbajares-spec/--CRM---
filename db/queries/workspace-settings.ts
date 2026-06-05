import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type WorkspaceCountdown = {
  title: string | null;
  /** YYYY-MM-DD (postgres `date`). */
  date: string | null;
  subpoints: string[];
};

/** The workspace's "big milestone" countdown config (null when no date is set). */
export async function getWorkspaceCountdown(workspaceId: string): Promise<WorkspaceCountdown | null> {
  const [w] = await db
    .select({
      title: schema.workspaces.countdownTitle,
      date: schema.workspaces.countdownDate,
      subpoints: schema.workspaces.countdownSubpoints,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .limit(1);
  if (!w || !w.date) return null;
  return { title: w.title, date: w.date, subpoints: w.subpoints ?? [] };
}
