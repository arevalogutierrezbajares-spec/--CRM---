import { NextRequest, NextResponse } from "next/server";
import {
  getPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  countRecentSignatures,
  createPartnerSignature,
  getSignatureRequest,
  setSignatureStampResult,
} from "@/db/queries/partner-signatures";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";
import { decodeSignatureDataUrl } from "@/lib/signatures/signature-image";
import { sha256Hex, stampSignedPdf } from "@/lib/signatures/stamp.server";
import {
  fetchBytesForSignatureRequest,
  isPdfBytes,
} from "@/lib/signatures/target.server";
import { uploadBytes } from "@/lib/project-files/storage";
import {
  assertFrozenHashMatch,
  validateSignBody,
} from "@/lib/signatures/sign-body";
import {
  signatureImagePath as buildSigImagePath,
  signedPdfPath as buildSignedPdfPath,
} from "@/lib/signatures/freeze-paths";
import { notifySignatureCompleted } from "@/lib/signatures/notify.server";

const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_IN_WINDOW = 5;

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  const t = getRoomDict(room?.locale).api;
  if (!room) {
    return NextResponse.json({ error: t.roomNotFound }, { status: 404 });
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: t.roomLocked }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }

  const parsed = validateSignBody(json);
  if (!parsed.ok) {
    const msg =
      parsed.error === "email_required"
        ? t.emailRequired
        : parsed.error === "consent_required"
          ? t.consentRequired
          : parsed.error === "name_required"
            ? t.nameRequired
            : t.invalidRequest;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const recent = await countRecentSignatures({
    roomId: room.id,
    seconds: RATE_WINDOW_SECONDS,
  }).catch(() => 0);
  if (recent >= RATE_MAX_IN_WINDOW) {
    return NextResponse.json({ error: t.signBurst }, { status: 429 });
  }

  const request = await getSignatureRequest({
    roomId: room.id,
    requestId: parsed.requestId,
  });
  if (!request || request.status !== "pending") {
    return NextResponse.json({ error: t.signUnavailable }, { status: 404 });
  }

  const signaturePng = decodeSignatureDataUrl(parsed.signatureDataUrl);
  if (!signaturePng) {
    return NextResponse.json({ error: t.signInvalid }, { status: 400 });
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  const member = memberId
    ? await getPartnerRoomMember({ roomId: room.id, memberId }).catch(() => null)
    : null;

  // Prefer frozen bytes; hash must match freeze when present.
  const docBytes = await fetchBytesForSignatureRequest({ token, request });
  const documentSha256 = docBytes ? sha256Hex(docBytes) : null;
  const integrity = assertFrozenHashMatch({
    frozenSha256AtRequest: request.documentSha256AtRequest,
    bytesSha256: documentSha256,
  });
  if (!integrity.ok) {
    return NextResponse.json({ error: t.signHashMismatch }, { status: 409 });
  }

  const signedAt = new Date();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const signatureImagePath = buildSigImagePath({
    workspaceId: room.workspaceId,
    roomId: room.id,
    requestId: request.id,
  });
  const sigUpload = await uploadBytes(signatureImagePath, signaturePng, "image/png");
  if (!sigUpload.ok) {
    return NextResponse.json({ error: t.signSaveFailed }, { status: 503 });
  }

  const isPdf = isPdfBytes(docBytes);
  // pending until stamp succeeds; non-pdf skips.
  const preStampStatus = isPdf ? "pending" : "skipped_non_pdf";

  const result = await createPartnerSignature({
    workspaceId: room.workspaceId,
    roomId: room.id,
    requestId: request.id,
    memberId: member?.id ?? null,
    signerName: parsed.signerName,
    signerEmail: parsed.signerEmail,
    signatureImagePath,
    documentSha256,
    signedPdfPath: null,
    ip,
    userAgent,
    signedAt,
    consentAccepted: true,
    consentTextKey: parsed.consentTextKey,
    consentLocale: room.locale ?? "es",
    consentAt: signedAt,
    placement: parsed.placement,
    stampStatus: preStampStatus,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  let signedPdfPath: string | null = null;
  let stampStatus = preStampStatus;
  if (isPdf && docBytes) {
    try {
      const stamped = await stampSignedPdf({
        pdfBytes: docBytes,
        signaturePng,
        title: request.titleSnapshot,
        signerName: parsed.signerName,
        signerEmail: parsed.signerEmail,
        signedAt,
        documentSha256: documentSha256 as string,
        ip,
        userAgent,
        placement: parsed.placement,
        consentLocale: room.locale ?? "es",
        consentTextKey: parsed.consentTextKey,
        requestId: request.id,
      });
      const path = buildSignedPdfPath({
        workspaceId: room.workspaceId,
        roomId: room.id,
        requestId: request.id,
      });
      const up = await uploadBytes(path, stamped, "application/pdf");
      if (up.ok) {
        signedPdfPath = path;
        stampStatus = "ready";
        await setSignatureStampResult({
          signatureId: result.signature.id,
          roomId: room.id,
          signedPdfPath: path,
          stampStatus: "ready",
          stampError: null,
          incrementAttempts: true,
        });
      } else {
        stampStatus = "failed";
        await setSignatureStampResult({
          signatureId: result.signature.id,
          roomId: room.id,
          signedPdfPath: null,
          stampStatus: "failed",
          stampError: up.error,
          incrementAttempts: true,
        });
      }
    } catch (e) {
      stampStatus = "failed";
      await setSignatureStampResult({
        signatureId: result.signature.id,
        roomId: room.id,
        signedPdfPath: null,
        stampStatus: "failed",
        stampError: e instanceof Error ? e.message : "stamp_failed",
        incrementAttempts: true,
      });
    }
  }

  // Completed email — never blocks signature success.
  void notifySignatureCompleted({
    workspaceId: room.workspaceId,
    roomId: room.id,
    requestId: request.id,
    title: request.titleSnapshot,
    locale: room.locale ?? "es",
    roomName: room.name,
    signerName: parsed.signerName,
    signerEmail: parsed.signerEmail,
    signedAt,
    documentSha256,
    hasSignedPdf: Boolean(signedPdfPath),
    ownerUserId: room.createdBy ?? null,
  });

  return NextResponse.json({
    id: result.signature.id,
    requestId: request.id,
    signerName: result.signature.signerName,
    signerEmail: result.signature.signerEmail,
    signedAt: result.signature.signedAt,
    hasSignedPdf: Boolean(signedPdfPath),
    stampStatus,
  });
}
