import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/current-user";
import { getMailboxForAction } from "@/db/queries/email";
import { getEmailProvider } from "@/lib/email/provider";
import type { MailboxRecord } from "@/lib/email/types";

type Params = Promise<{ attachmentId: string }>;

function downloadHeaders(filename: string, mimeType: string) {
  return {
    "Content-Type": mimeType,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
  };
}

export async function GET(_req: Request, props: { params: Params }) {
  const user = await requireUser();
  const { attachmentId } = await props.params;
  const [row] = await db
    .select({
      attachment: schema.emailAttachments,
      message: schema.emailMessages,
      mailbox: schema.emailMailboxes,
      provider: schema.emailProviderConnections.provider,
    })
    .from(schema.emailAttachments)
    .innerJoin(schema.emailMessages, eq(schema.emailMessages.id, schema.emailAttachments.messageId))
    .innerJoin(schema.emailMailboxes, eq(schema.emailMailboxes.id, schema.emailMessages.mailboxId))
    .innerJoin(
      schema.emailProviderConnections,
      eq(schema.emailProviderConnections.id, schema.emailMailboxes.providerConnectionId),
    )
    .where(
      and(
        eq(schema.emailAttachments.id, attachmentId),
        eq(schema.emailAttachments.workspaceId, user.workspaceId),
      ),
    )
    .limit(1);

  if (!row) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  const mailbox = await getMailboxForAction(user, row.mailbox.id);
  if (!mailbox?.rights.canView) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const provider = getEmailProvider(row.provider);
  const result = await provider.downloadAttachment({
    mailbox: mailbox.record as MailboxRecord,
    providerMessageId: row.message.providerMessageId,
    providerAttachmentId: row.attachment.providerAttachmentId,
    filename: row.attachment.filename,
    mimeType: row.attachment.mimeType,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.providerStatus && result.providerStatus >= 400 ? result.providerStatus : 502 },
    );
  }
  const body = new ArrayBuffer(result.content.byteLength);
  new Uint8Array(body).set(result.content);
  return new Response(body, {
    status: 200,
    headers: downloadHeaders(result.filename, result.mimeType),
  });
}
