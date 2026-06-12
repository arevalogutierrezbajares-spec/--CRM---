import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import {
  getPartnerRoomMember,
  getPublicPartnerShareByToken,
  resolvePartnerRoomByToken,
} from "@/db/queries/partner-access";
import {
  countRecentSignatures,
  createPartnerSignature,
  getSignatureRequest,
} from "@/db/queries/partner-signatures";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { decodeSignatureDataUrl } from "@/lib/signatures/signature-image";
import { sha256Hex, stampSignedPdf } from "@/lib/signatures/stamp.server";
import { createSignedDownloadUrl, uploadBytes } from "@/lib/project-files/storage";

const Body = z.object({
  requestId: z.string().uuid(),
  signerName: z.string().trim().min(3, "Escribe tu nombre completo").max(120),
  signerEmail: z.string().trim().email().max(200).optional().nullable(),
  // data:image/png;base64,… — decoded + magic-checked server-side.
  signatureDataUrl: z.string().min(64).max(450_000),
  consent: z.literal(true),
});

const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_IN_WINDOW = 5;
const DOC_FETCH_MAX_BYTES = 30 * 1024 * 1024;

type Params = Promise<{ token: string }>;

export async function POST(req: NextRequest, props: { params: Params }) {
  const { token } = await props.params;
  const room = await resolvePartnerRoomByToken(token).catch(() => null);
  if (!room) {
    return NextResponse.json(
      { error: "Sala no encontrada o acceso expirado" },
      { status: 404 },
    );
  }
  if (!(await isPartnerRoomUnlocked(room))) {
    return NextResponse.json({ error: "La sala está bloqueada" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Solicitud inválida" },
      { status: 400 },
    );
  }

  const recent = await countRecentSignatures({
    roomId: room.id,
    seconds: RATE_WINDOW_SECONDS,
  }).catch(() => 0);
  if (recent >= RATE_MAX_IN_WINDOW) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera un momento." },
      { status: 429 },
    );
  }

  const request = await getSignatureRequest({
    roomId: room.id,
    requestId: parsed.data.requestId,
  });
  if (!request || request.status !== "pending") {
    return NextResponse.json(
      { error: "Esta solicitud de firma ya no está disponible." },
      { status: 404 },
    );
  }

  const signaturePng = decodeSignatureDataUrl(parsed.data.signatureDataUrl);
  if (!signaturePng) {
    return NextResponse.json(
      { error: "La firma no es válida. Dibuja tu firma e intenta de nuevo." },
      { status: 400 },
    );
  }

  const memberId = await getPartnerMemberIdFromCookies(room.id);
  const member = memberId
    ? await getPartnerRoomMember({ roomId: room.id, memberId }).catch(() => null)
    : null;

  // Resolve the exact bytes being signed so the audit record carries their
  // SHA-256 — and, for PDFs, so we can stamp a signed copy.
  let storagePath: string | null = null;
  if (request.targetKind === "item") {
    const [item] = await db
      .select({ storagePath: schema.partnerRoomItems.storagePath })
      .from(schema.partnerRoomItems)
      .where(
        and(
          eq(schema.partnerRoomItems.id, request.targetId),
          eq(schema.partnerRoomItems.roomId, room.id),
        ),
      )
      .limit(1);
    storagePath = item?.storagePath ?? null;
  } else {
    const row = await getPublicPartnerShareByToken({
      token,
      shareId: request.targetId,
    }).catch(() => null);
    storagePath = row?.storagePath ?? null;
  }

  let docBytes: Uint8Array | null = null;
  if (storagePath) {
    const signed = await createSignedDownloadUrl(storagePath);
    if (signed.ok) {
      try {
        const res = await fetch(signed.url);
        if (res.ok) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength <= DOC_FETCH_MAX_BYTES) docBytes = new Uint8Array(buf);
        }
      } catch {
        docBytes = null;
      }
    }
  }
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
    return NextResponse.json(
      { error: "No se pudo guardar la firma. Intenta de nuevo." },
      { status: 503 },
    );
  }

  // PDF targets get a stamped signed copy (original pages + certificate page).
  let signedPdfPath: string | null = null;
  const isPdf =
    docBytes &&
    docBytes.length > 4 &&
    docBytes[0] === 0x25 && // %PDF
    docBytes[1] === 0x50 &&
    docBytes[2] === 0x44 &&
    docBytes[3] === 0x46;
  if (docBytes && isPdf) {
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
      });
      const path = `${basePath}-firmado.pdf`;
      const up = await uploadBytes(path, stamped, "application/pdf");
      if (up.ok) signedPdfPath = path;
    } catch {
      // The signature record (with hash + timestamp) is the legal artifact;
      // a failed stamp must not block signing.
      signedPdfPath = null;
    }
  }

  const result = await createPartnerSignature({
    workspaceId: room.workspaceId,
    roomId: room.id,
    requestId: request.id,
    memberId: member?.id ?? null,
    signerName: parsed.data.signerName,
    signerEmail: parsed.data.signerEmail ?? member?.email ?? null,
    signatureImagePath,
    documentSha256,
    signedPdfPath,
    ip,
    userAgent,
    signedAt,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    id: result.signature.id,
    requestId: request.id,
    signerName: result.signature.signerName,
    signedAt: result.signature.signedAt,
    hasSignedPdf: Boolean(signedPdfPath),
  });
}
