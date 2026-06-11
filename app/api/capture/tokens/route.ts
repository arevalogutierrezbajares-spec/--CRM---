import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { hashToken, mintTokenPlaintext } from "@/lib/capture/tokens";
import {
  insertCaptureToken,
  listCaptureTokens,
} from "@/db/queries/capture-tokens";

/**
 * Helper token management (NFR-CALL-SEC-2). Session-authed — this is the
 * founder in the browser, not the Helper. The plaintext is returned exactly
 * once at mint time; only its hash is stored.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tokens = await listCaptureTokens({ workspaceId: user.workspaceId });
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name ?? "Mac Helper").trim().slice(0, 80) || "Mac Helper";

  const plaintext = mintTokenPlaintext();
  const id = await insertCaptureToken({
    workspaceId: user.workspaceId,
    userId: user.id,
    name,
    tokenHash: hashToken(plaintext),
  });
  return NextResponse.json({ id, name, token: plaintext }, { status: 201 });
}
