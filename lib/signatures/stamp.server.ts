/**
 * PDF stamping for partner-room e-signatures. Draws the signature into the
 * document page the signer chose (when a placement is provided), then appends
 * a certificate page: signer identity, server timestamp (UTC + Caracas), the
 * SHA-256 of the exact bytes that were signed, and request metadata.
 */
import "server-only";
import { createHash } from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatSignedAt } from "./signature-image";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Where the signer placed their signature, in page-relative fractions so the
 * client never needs to know real PDF point sizes. x/y are the top-left
 * corner measured from the page's top-left; width is a fraction of page
 * width. Height follows from the PNG's aspect ratio.
 */
export type SignaturePlacement = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export async function stampSignedPdf(opts: {
  pdfBytes: Uint8Array;
  signaturePng: Uint8Array;
  title: string;
  signerName: string;
  signerEmail: string | null;
  signedAt: Date;
  documentSha256: string;
  ip: string | null;
  userAgent: string | null;
  placement?: SignaturePlacement | null;
  /** Optional consent / request metadata for the certificate page. */
  consentLocale?: string | null;
  consentTextKey?: string | null;
  requestId?: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(opts.pdfBytes, { ignoreEncryption: true });
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sig = await doc.embedPng(opts.signaturePng);
  const when = formatSignedAt(opts.signedAt);

  if (opts.placement) {
    const pages = doc.getPages();
    const target =
      pages[clamp(Math.round(opts.placement.pageIndex), 0, pages.length - 1)];
    const { width: pw, height: ph } = target.getSize();
    const w = clamp(opts.placement.width, 0.05, 1) * pw;
    const h = w * (sig.height / sig.width);
    const x = clamp(clamp(opts.placement.x, 0, 1) * pw, 0, Math.max(pw - w, 0));
    // placement.y is measured from the page top; pdf-lib's origin is bottom-left.
    const y = clamp(ph - clamp(opts.placement.y, 0, 1) * ph - h, 0, Math.max(ph - h, 0));
    target.drawImage(sig, { x, y, width: w, height: h });
    target.drawText(`${opts.signerName} · ${when.local}`, {
      x,
      y: Math.max(y - 9, 2),
      size: 6,
      font: helvetica,
      color: rgb(0.42, 0.42, 0.46),
    });
  }

  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 56;
  const ink = rgb(0.1, 0.1, 0.12);
  const dim = rgb(0.42, 0.42, 0.46);
  let y = height - margin - 12;

  const text = (
    value: string,
    opts2: { size?: number; font?: typeof helvetica; color?: typeof ink; gap?: number } = {},
  ) => {
    const size = opts2.size ?? 10;
    page.drawText(value, {
      x: margin,
      y,
      size,
      font: opts2.font ?? helvetica,
      color: opts2.color ?? ink,
      maxWidth: width - margin * 2,
      lineHeight: size * 1.35,
    });
    y -= opts2.gap ?? size * 1.9;
  };

  text("ACTA DE FIRMA ELECTRÓNICA", { size: 16, font: bold, gap: 30 });
  text(`Documento: ${opts.title}`, { size: 11, font: bold, gap: 26 });

  const rows: [string, string][] = [
    ["Firmante", opts.signerName],
    ["Correo", opts.signerEmail ?? "—"],
    ["Fecha y hora", when.local],
    ["Marca de tiempo (UTC)", when.utc],
    ["SHA-256 del documento", opts.documentSha256],
    ["Dirección IP", opts.ip ?? "—"],
    ["Dispositivo", (opts.userAgent ?? "—").slice(0, 110)],
    [
      "Consentimiento",
      opts.consentTextKey
        ? `Sí · ${opts.consentLocale ?? "—"} · ${opts.consentTextKey}`
        : "Sí",
    ],
    ...(opts.requestId
      ? ([["ID de solicitud", opts.requestId]] as [string, string][])
      : []),
  ];
  for (const [label, value] of rows) {
    page.drawText(label.toUpperCase(), {
      x: margin,
      y,
      size: 7.5,
      font: bold,
      color: dim,
    });
    y -= 12;
    page.drawText(value, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: ink,
      maxWidth: width - margin * 2,
      lineHeight: 13,
    });
    // The hash wraps onto a second line at this width.
    y -= value.length > 80 ? 34 : 22;
  }

  y -= 14;
  page.drawText("FIRMA", { x: margin, y, size: 7.5, font: bold, color: dim });
  y -= 8;
  const sigMaxW = 220;
  const sigMaxH = 90;
  const scale = Math.min(sigMaxW / sig.width, sigMaxH / sig.height, 1);
  const sigW = sig.width * scale;
  const sigH = sig.height * scale;
  y -= sigH;
  page.drawImage(sig, { x: margin, y, width: sigW, height: sigH });
  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: margin + Math.max(sigW, 180), y },
    thickness: 0.8,
    color: ink,
  });
  y -= 14;
  page.drawText(opts.signerName, { x: margin, y, size: 10, font: helvetica, color: ink });

  page.drawText(
    "Firmado electrónicamente desde la sala privada. La marca de tiempo la asigna el servidor al recibir la firma.",
    {
      x: margin,
      y: margin - 14,
      size: 7.5,
      font: helvetica,
      color: dim,
      maxWidth: width - margin * 2,
      lineHeight: 10,
    },
  );

  return doc.save();
}
