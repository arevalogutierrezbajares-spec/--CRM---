import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getPartnerRoomMember,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  countRecentSignatures,
  createPartnerSignature,
  getSignatureRequest,
  setSignaturePdfPath,
} from "@/db/queries/partner-signatures";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { getRoomDict } from "@/lib/partner-room-i18n";
import { decodeSignatureDataUrl } from "@/lib/signatures/signature-image";
import { sha256Hex, stampSignedPdf } from "@/lib/signatures/stamp.server";
import {
  fetchSignatureTargetBytes,
  isPdfBytes,
} from "@/lib/signatures/target.server";
import { uploadBytes } from "@/lib/project-files/storage";

const Body = z.object({
  requestId: z.string().uuid(),
  signerName: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
  signerEmail: z.string().trim().email().max(200).optional().nullable(),
  // data:image/png;base64,… — decoded + magic-checked server-side.
  signatureDataUrl: z.string().min(64).max(450_000),
  consent: z.literal(true),
  // Where the signer dropped their signature on the document, in page-relative
  // fractions (in-document signing). Absent for pad-only fallback signing.
  placement: z
    .object({
      pageIndex: z.number().int().min(0).max(4999),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().min(0.05).max(1),
    })
    .optional()
    .nullable(),
});

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
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
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
    requestId: parsed.data.requestId,
  });
  if (!request || request.status !== "pending") {
    return NextResponse.json({ error: t.signUnavailable }, { status: 404 });
  }

  const signaturePng = decodeSignatureDataUrl(parsed.data.signatureDataUrl);
  if (!signaturePng) {
    return NextResponse.json({ error: t.signInvalid }, { status: 400 });
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  const member = memberId
    ? await getPartnerRoomMember({ roomId: room.id, memberId }).catch(() => null)
    : null;

  // Resolve the exact bytes being signed so the audit record carries their
  // SHA-256 — and, for PDFs, so we can stamp a signed copy.
  const docBytes = await fetchSignatureTargetBytes({
    token,
    roomId: room.id,
    targetKind: request.targetKind,
    targetId: request.targetId,
  });
  const documentSha256 = docBytes ? sha256Hex(docBytes) : null;

  // The server clock IS the signature timestamp — never client-supplied.
  const signedAt = new Date();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;

  const basePath = `${room.workspaceId}/partner-signatures/${room.id}/${request.id}`;
  const signatureImagePath = `${basePath}-firma.png`;
  const sigUpload = await uploadBytes(signatureImagePath, signaturePng, "image/png");
  if (!sigUpload.ok) {
    return NextResponse.json({ error: t.signSaveFailed }, { status: 503 });
  }

  // Commit the signature record FIRST — it (hash + server timestamp + image)
  // is the legal artifact. Stamping is best-effort decoration; a pdf-lib
  // failure after this point can degrade the download, never the signature.
  const result = await createPartnerSignature({
    workspaceId: room.workspaceId,
    roomId: room.id,
    requestId: request.id,
    memberId: member?.id ?? null,
    signerName: parsed.data.signerName,
    signerEmail: parsed.data.signerEmail ?? member?.email ?? null,
    signatureImagePath,
    documentSha256,
    signedPdfPath: null,
    ip,
    userAgent,
    signedAt,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // PDF targets get a stamped signed copy: the signature drawn into the page
  // the signer chose (when placed in-document) + the appended certificate page.
  let signedPdfPath: string | null = null;
  if (isPdfBytes(docBytes)) {
    try {
      const stamped = await stampSignedPdf({
        pdfBytes: docBytes,
        signaturePng,
        title: request.titleSnapshot,
        signerName: parsed.data.signerName,
        signerEmail: parsed.data.signerEmail ?? member?.email ?? null,
        signedAt,
        documentSha256: documentSha256 as string,
        ip,
        userAgent,
        placement: parsed.data.placement ?? null,
      });
      const path = `${basePath}-firmado.pdf`;
      const up = await uploadBytes(path, stamped, "application/pdf");
      if (up.ok) {
        const recorded = await setSignaturePdfPath({
          signatureId: result.signature.id,
          roomId: room.id,
          signedPdfPath: path,
        });
        if (recorded) signedPdfPath = path;
      }
    } catch {
      signedPdfPath = null;
    }
  }

  return NextResponse.json({
    id: result.signature.id,
    requestId: request.id,
    signerName: result.signature.signerName,
    signedAt: result.signature.signedAt,
    hasSignedPdf: Boolean(signedPdfPath),
  });
}
