import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SignaturePlacementJson } from "@/db/schema";
import { notifyUsers } from "@/db/queries/town-hall";
import type { StampStatus } from "@/lib/signatures/sign-body";

export type PartnerSignatureRequest =
  typeof schema.partnerSignatureRequests.$inferSelect;
export type PartnerSignature = typeof schema.partnerSignatures.$inferSelect;

export type SignatureRequestWithSignature = PartnerSignatureRequest & {
  signature: Pick<
    PartnerSignature,
    | "id"
    | "signerName"
    | "signerEmail"
    | "signedAt"
    | "signedPdfPath"
    | "documentSha256"
    | "ip"
    | "stampStatus"
    | "placement"
    | "consentAccepted"
    | "consentLocale"
  > | null;
};

/** All requests in a room, newest first, each with its signature if signed. */
export async function listSignatureRequestsByRoom(input: {
  roomId: string;
}): Promise<SignatureRequestWithSignature[]> {
  const rows = await db
    .select({
      request: schema.partnerSignatureRequests,
      sigId: schema.partnerSignatures.id,
      signerName: schema.partnerSignatures.signerName,
      signerEmail: schema.partnerSignatures.signerEmail,
      signedAt: schema.partnerSignatures.signedAt,
      signedPdfPath: schema.partnerSignatures.signedPdfPath,
      documentSha256: schema.partnerSignatures.documentSha256,
      ip: schema.partnerSignatures.ip,
      stampStatus: schema.partnerSignatures.stampStatus,
      placement: schema.partnerSignatures.placement,
      consentAccepted: schema.partnerSignatures.consentAccepted,
      consentLocale: schema.partnerSignatures.consentLocale,
    })
    .from(schema.partnerSignatureRequests)
    .leftJoin(
      schema.partnerSignatures,
      eq(schema.partnerSignatures.requestId, schema.partnerSignatureRequests.id),
    )
    .where(eq(schema.partnerSignatureRequests.roomId, input.roomId))
    .orderBy(desc(schema.partnerSignatureRequests.createdAt));

  return rows.map((r) => ({
    ...r.request,
    signature: r.sigId
      ? {
          id: r.sigId,
          signerName: r.signerName as string,
          signerEmail: r.signerEmail,
          signedAt: r.signedAt as Date,
          signedPdfPath: r.signedPdfPath,
          documentSha256: r.documentSha256,
          ip: r.ip,
          stampStatus: r.stampStatus as string,
          placement: r.placement,
          consentAccepted: r.consentAccepted as boolean,
          consentLocale: r.consentLocale,
        }
      : null,
  }));
}

export async function getSignatureRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<PartnerSignatureRequest | null> {
  const [row] = await db
    .select()
    .from(schema.partnerSignatureRequests)
    .where(
      and(
        eq(schema.partnerSignatureRequests.id, input.requestId),
        eq(schema.partnerSignatureRequests.roomId, input.roomId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getSignatureForRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<PartnerSignature | null> {
  const [row] = await db
    .select()
    .from(schema.partnerSignatures)
    .where(
      and(
        eq(schema.partnerSignatures.requestId, input.requestId),
        eq(schema.partnerSignatures.roomId, input.roomId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Owner asks for a signature on a repository entry. Re-requesting a voided
 * target re-opens it; a signed target is immutable (the audit record wins).
 * Caller must freeze the document and attach freeze metadata after insert.
 */
export async function createSignatureRequest(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
  targetKind: "share" | "item";
  targetId: string;
  title: string;
  message?: string | null;
}): Promise<
  | { ok: true; request: PartnerSignatureRequest }
  | { ok: false; error: string }
> {
  const [existing] = await db
    .select()
    .from(schema.partnerSignatureRequests)
    .where(
      and(
        eq(schema.partnerSignatureRequests.roomId, input.roomId),
        eq(schema.partnerSignatureRequests.targetKind, input.targetKind),
        eq(schema.partnerSignatureRequests.targetId, input.targetId),
      ),
    )
    .limit(1);

  if (existing?.status === "signed") {
    return { ok: false, error: "Este documento ya fue firmado." };
  }

  const now = new Date();
  let request: PartnerSignatureRequest;
  if (existing) {
    const [updated] = await db
      .update(schema.partnerSignatureRequests)
      .set({
        status: "pending",
        titleSnapshot: input.title,
        message: input.message?.trim() || null,
        requestedBy: input.actorId,
        // Clear prior freeze/notify so re-request re-freezes cleanly.
        sourceStoragePath: null,
        frozenStoragePath: null,
        documentSha256AtRequest: null,
        documentByteLength: null,
        documentMimeType: null,
        notifyEmails: null,
        lastNotifiedAt: null,
        notifyError: null,
        updatedAt: now,
      })
      .where(eq(schema.partnerSignatureRequests.id, existing.id))
      .returning();
    request = updated;
  } else {
    const [created] = await db
      .insert(schema.partnerSignatureRequests)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        targetKind: input.targetKind,
        targetId: input.targetId,
        titleSnapshot: input.title,
        message: input.message?.trim() || null,
        requestedBy: input.actorId,
      })
      .returning();
    request = created;
  }

  await db
    .insert(schema.partnerAccessEvents)
    .values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      actorUserId: input.actorId,
      eventType: "signature_requested",
      metadata: { requestId: request.id, title: input.title },
    })
    .catch(() => {});

  return { ok: true, request };
}

/** Attach freeze metadata after successful storage copy. */
export async function setSignatureRequestFreeze(input: {
  requestId: string;
  roomId: string;
  sourceStoragePath: string;
  frozenStoragePath: string;
  documentSha256AtRequest: string;
  documentByteLength: number;
  documentMimeType: string;
}): Promise<PartnerSignatureRequest | null> {
  const [updated] = await db
    .update(schema.partnerSignatureRequests)
    .set({
      sourceStoragePath: input.sourceStoragePath,
      frozenStoragePath: input.frozenStoragePath,
      documentSha256AtRequest: input.documentSha256AtRequest,
      documentByteLength: input.documentByteLength,
      documentMimeType: input.documentMimeType,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.partnerSignatureRequests.id, input.requestId),
        eq(schema.partnerSignatureRequests.roomId, input.roomId),
      ),
    )
    .returning();
  return updated ?? null;
}

/** Record notify attempt (success or failure). Never throws for callers. */
export async function setSignatureRequestNotify(input: {
  requestId: string;
  roomId: string;
  emails: string[];
  error: string | null;
}): Promise<void> {
  await db
    .update(schema.partnerSignatureRequests)
    .set({
      notifyEmails: input.emails.length > 0 ? input.emails : null,
      lastNotifiedAt: input.error ? null : new Date(),
      notifyError: input.error,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.partnerSignatureRequests.id, input.requestId),
        eq(schema.partnerSignatureRequests.roomId, input.roomId),
      ),
    )
    .catch(() => {});

  if (input.emails.length > 0) {
    const [req] = await db
      .select({ workspaceId: schema.partnerSignatureRequests.workspaceId })
      .from(schema.partnerSignatureRequests)
      .where(eq(schema.partnerSignatureRequests.id, input.requestId))
      .limit(1);
    if (req) {
      await db
        .insert(schema.partnerAccessEvents)
        .values({
          workspaceId: req.workspaceId,
          roomId: input.roomId,
          eventType: input.error
            ? "signature_notify_failed"
            : "signature_notify_sent",
          metadata: {
            requestId: input.requestId,
            emails: input.emails,
            error: input.error,
          },
        })
        .catch(() => {});
    }
  }
}

/** Void a pending request (signed ones are immutable). */
export async function voidSignatureRequest(input: {
  workspaceId: string;
  roomId: string;
  requestId: string;
}): Promise<boolean> {
  const [updated] = await db
    .update(schema.partnerSignatureRequests)
    .set({ status: "voided", updatedAt: new Date() })
    .where(
      and(
        eq(schema.partnerSignatureRequests.id, input.requestId),
        eq(schema.partnerSignatureRequests.roomId, input.roomId),
        eq(schema.partnerSignatureRequests.workspaceId, input.workspaceId),
        eq(schema.partnerSignatureRequests.status, "pending"),
      ),
    )
    .returning({ id: schema.partnerSignatureRequests.id });
  return Boolean(updated);
}

/** Flood guard for the public sign endpoint. */
export async function countRecentSignatures(input: {
  roomId: string;
  seconds: number;
}): Promise<number> {
  const since = new Date(Date.now() - input.seconds * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerSignatures)
    .where(
      and(
        eq(schema.partnerSignatures.roomId, input.roomId),
        gt(schema.partnerSignatures.signedAt, since),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Record the signature. Atomically claims the pending request (UPDATE … WHERE
 * status='pending') so two concurrent submissions can't both win — the loser
 * gets ok:false. `signedAt` is the server clock, never client-supplied.
 */
export async function createPartnerSignature(input: {
  workspaceId: string;
  roomId: string;
  requestId: string;
  memberId: string | null;
  signerName: string;
  signerEmail: string;
  signatureImagePath: string | null;
  documentSha256: string | null;
  signedPdfPath: string | null;
  ip: string | null;
  userAgent: string | null;
  signedAt: Date;
  consentAccepted: boolean;
  consentTextKey: string | null;
  consentLocale: string | null;
  consentAt: Date;
  placement: SignaturePlacementJson | null;
  stampStatus: StampStatus;
}): Promise<{ ok: true; signature: PartnerSignature } | { ok: false; error: string }> {
  const result = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(schema.partnerSignatureRequests)
      .set({ status: "signed", updatedAt: new Date() })
      .where(
        and(
          eq(schema.partnerSignatureRequests.id, input.requestId),
          eq(schema.partnerSignatureRequests.roomId, input.roomId),
          eq(schema.partnerSignatureRequests.status, "pending"),
        ),
      )
      .returning();
    if (!claimed) return null;

    const [signature] = await tx
      .insert(schema.partnerSignatures)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        requestId: input.requestId,
        memberId: input.memberId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        signatureImagePath: input.signatureImagePath,
        documentSha256: input.documentSha256,
        signedPdfPath: input.signedPdfPath,
        ip: input.ip,
        userAgent: input.userAgent,
        signedAt: input.signedAt,
        consentAccepted: input.consentAccepted,
        consentTextKey: input.consentTextKey,
        consentLocale: input.consentLocale,
        consentAt: input.consentAt,
        placement: input.placement,
        stampStatus: input.stampStatus,
        stampAttempts: 0,
      })
      .returning();

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      eventType: "document_signed",
      metadata: {
        requestId: input.requestId,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        title: claimed.titleSnapshot,
      },
    });

    return signature;
  });

  if (!result) {
    return { ok: false, error: "Esta solicitud ya no está pendiente." };
  }

  try {
    const [room] = await db
      .select({ createdBy: schema.partnerRooms.createdBy, name: schema.partnerRooms.name })
      .from(schema.partnerRooms)
      .where(eq(schema.partnerRooms.id, input.roomId))
      .limit(1);
    if (room) {
      await notifyUsers({
        workspaceId: input.workspaceId,
        actorId: room.createdBy,
        recipientUserIds: [room.createdBy],
        includeActor: true,
        entityType: "partner_room",
        entityId: input.roomId,
        title: `${input.signerName} firmó un documento en ${room.name}`,
        kind: "partner_signature",
      });
    }
  } catch {
    // Never fail the signature because the bell did.
  }

  return { ok: true, signature: result };
}

/**
 * Attach the stamped-PDF path after the fact. Stamping runs AFTER the
 * signature record is committed (it's best-effort by design — a pdf-lib
 * failure or hang must never lose a completed signature).
 */
export async function setSignatureStampResult(input: {
  signatureId: string;
  roomId: string;
  signedPdfPath: string | null;
  stampStatus: StampStatus;
  stampError: string | null;
  incrementAttempts?: boolean;
}): Promise<boolean> {
  if (input.incrementAttempts) {
    const [updated] = await db
      .update(schema.partnerSignatures)
      .set({
        signedPdfPath: input.signedPdfPath,
        stampStatus: input.stampStatus,
        stampError: input.stampError,
        stampAttempts: sql`${schema.partnerSignatures.stampAttempts} + 1`,
      })
      .where(
        and(
          eq(schema.partnerSignatures.id, input.signatureId),
          eq(schema.partnerSignatures.roomId, input.roomId),
        ),
      )
      .returning({ id: schema.partnerSignatures.id });
    return Boolean(updated);
  }
  const [updated] = await db
    .update(schema.partnerSignatures)
    .set({
      signedPdfPath: input.signedPdfPath,
      stampStatus: input.stampStatus,
      stampError: input.stampError,
    })
    .where(
      and(
        eq(schema.partnerSignatures.id, input.signatureId),
        eq(schema.partnerSignatures.roomId, input.roomId),
      ),
    )
    .returning({ id: schema.partnerSignatures.id });
  return Boolean(updated);
}

/** @deprecated use setSignatureStampResult — kept for any leftover call sites */
export async function setSignaturePdfPath(input: {
  signatureId: string;
  roomId: string;
  signedPdfPath: string;
}): Promise<boolean> {
  return setSignatureStampResult({
    signatureId: input.signatureId,
    roomId: input.roomId,
    signedPdfPath: input.signedPdfPath,
    stampStatus: "ready",
    stampError: null,
    incrementAttempts: true,
  });
}
