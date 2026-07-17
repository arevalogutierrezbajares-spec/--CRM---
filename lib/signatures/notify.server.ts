/**
 * Best-effort email notifications for signature request + completed.
 * Never throws — callers treat mail as non-blocking.
 */
import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendEmail, isResendConfigured } from "@/lib/resend";
import {
  buildSignatureCompletedEmail,
  buildSignatureRequestEmail,
} from "@/lib/signatures/emails";
import { setSignatureRequestNotify } from "@/db/queries/partner-signatures";
import { SITE_URL } from "@/lib/site-url";
import { partnerRoomGuestUrl } from "@/lib/partner-room-link.server";
import { decryptRoomToken } from "@/lib/partner-access-token.server";

function uniqueEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of list) {
    const t = e.trim().toLowerCase();
    if (!t || !t.includes("@") || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Resolve guest emails for a room: claimed members + optional extras + contact email. */
export async function resolveSignatureNotifyEmails(opts: {
  roomId: string;
  workspaceId: string;
  extraEmails?: string[] | null;
}): Promise<string[]> {
  const extras = opts.extraEmails ?? [];
  const members = await db
    .select({ email: schema.partnerRoomMembers.email })
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, opts.roomId),
        isNotNull(schema.partnerRoomMembers.email),
      ),
    )
    .catch(() => []);

  const [room] = await db
    .select({ primaryContactId: schema.partnerRooms.primaryContactId })
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.id, opts.roomId))
    .limit(1)
    .catch(() => [undefined]);

  let contactEmails: string[] = [];
  if (room?.primaryContactId) {
    const channels = await db
      .select({ value: schema.contactChannels.value })
      .from(schema.contactChannels)
      .where(
        and(
          eq(schema.contactChannels.contactId, room.primaryContactId),
          eq(schema.contactChannels.kind, "email"),
        ),
      )
      .catch(() => []);
    contactEmails = channels.map((c) => c.value);
  }

  return uniqueEmails([
    ...extras,
    ...members.map((m) => m.email!).filter(Boolean),
    ...contactEmails,
  ]);
}

export async function buildGuestDeepLink(opts: {
  roomId: string;
  requestId: string;
  roomName?: string | null;
}): Promise<string | null> {
  const [room] = await db
    .select({
      enc: schema.partnerRooms.publicAccessTokenEnc,
      name: schema.partnerRooms.name,
    })
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.id, opts.roomId))
    .limit(1);
  if (!room) return null;
  const base = partnerRoomGuestUrl(room.enc, opts.roomName ?? room.name);
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("sign", opts.requestId);
  return url.toString();
}

function guestAccessBase(enc: string | null | undefined): string | null {
  const tok = decryptRoomToken(enc);
  return tok ? `${SITE_URL}/access/${tok}` : null;
}

export async function notifySignatureRequested(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
  title: string;
  message?: string | null;
  locale: string;
  roomName: string;
  extraEmails?: string[] | null;
}): Promise<{ sent: number; emails: string[]; error: string | null; deepLink: string | null }> {
  const emails = await resolveSignatureNotifyEmails({
    roomId: opts.roomId,
    workspaceId: opts.workspaceId,
    extraEmails: opts.extraEmails,
  });

  const deepLink = await buildGuestDeepLink({
    roomId: opts.roomId,
    requestId: opts.requestId,
    roomName: opts.roomName,
  });

  if (emails.length === 0) {
    await setSignatureRequestNotify({
      requestId: opts.requestId,
      roomId: opts.roomId,
      emails: [],
      error: "no_recipients",
    });
    return { sent: 0, emails: [], error: "no_recipients", deepLink };
  }

  if (!isResendConfigured()) {
    await setSignatureRequestNotify({
      requestId: opts.requestId,
      roomId: opts.roomId,
      emails,
      error: "resend_not_configured",
    });
    return { sent: 0, emails, error: "resend_not_configured", deepLink };
  }

  if (!deepLink) {
    await setSignatureRequestNotify({
      requestId: opts.requestId,
      roomId: opts.roomId,
      emails,
      error: "no_guest_link",
    });
    return { sent: 0, emails, error: "no_guest_link", deepLink: null };
  }

  const mail = buildSignatureRequestEmail({
    locale: opts.locale,
    roomName: opts.roomName,
    title: opts.title,
    message: opts.message,
    deepLink,
  });

  const result = await sendEmail({
    to: emails,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });

  if (!result.ok) {
    await setSignatureRequestNotify({
      requestId: opts.requestId,
      roomId: opts.roomId,
      emails,
      error: result.error,
    });
    return { sent: 0, emails, error: result.error, deepLink };
  }

  await setSignatureRequestNotify({
    requestId: opts.requestId,
    roomId: opts.roomId,
    emails,
    error: null,
  });
  return { sent: emails.length, emails, error: null, deepLink };
}

export async function notifySignatureCompleted(opts: {
  workspaceId: string;
  roomId: string;
  requestId: string;
  title: string;
  locale: string;
  roomName: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  documentSha256: string | null;
  hasSignedPdf: boolean;
  ownerUserId: string | null;
}): Promise<void> {
  try {
    if (!isResendConfigured()) return;

    const emails: string[] = [opts.signerEmail];
    if (opts.ownerUserId) {
      const [owner] = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, opts.ownerUserId))
        .limit(1);
      if (owner?.email) emails.push(owner.email);
    }

    const unique = uniqueEmails(emails);
    if (unique.length === 0) return;

    const [room] = await db
      .select({
        enc: schema.partnerRooms.publicAccessTokenEnc,
        name: schema.partnerRooms.name,
      })
      .from(schema.partnerRooms)
      .where(eq(schema.partnerRooms.id, opts.roomId))
      .limit(1);

    const accessBase = guestAccessBase(room?.enc);
    const roomLink = accessBase ?? SITE_URL;
    const downloadLink =
      opts.hasSignedPdf && accessBase
        ? `${accessBase}/signed/${opts.requestId}`
        : null;

    const mail = buildSignatureCompletedEmail({
      locale: opts.locale,
      roomName: opts.roomName,
      title: opts.title,
      signerName: opts.signerName,
      signerEmail: opts.signerEmail,
      signedAt: opts.signedAt,
      documentSha256: opts.documentSha256,
      downloadLink,
      roomLink,
    });

    await sendEmail({
      to: unique,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  } catch {
    // Never fail the signature because mail failed.
  }
}
