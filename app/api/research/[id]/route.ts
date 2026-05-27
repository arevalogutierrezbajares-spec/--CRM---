import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getResearchNoteById } from "@/db/queries/research";
import { resolveBrainPath } from "@/lib/brain-roots";

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, props: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await props.params;
  const note = await getResearchNoteById({ id, workspaceId: user.workspaceId });
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const abs = resolveBrainPath(note.sourceRoot, note.relPath);
  if (!abs) {
    return NextResponse.json({ error: "Source root not allowed" }, { status: 403 });
  }
  try {
    const content = await fs.readFile(abs, "utf8");
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: `Read failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
