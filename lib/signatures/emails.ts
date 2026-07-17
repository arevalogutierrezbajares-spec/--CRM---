/**
 * Email copy for partner signature request + completed notifications.
 * Pure string builders — send via lib/resend separately.
 */

import { formatSignedAt } from "./signature-image";

export type SignatureEmailLocale = "es" | "en" | "pt" | "ru" | "ar" | string;

function isEs(locale: SignatureEmailLocale): boolean {
  return !locale || locale === "es" || locale.startsWith("es");
}

export function buildSignatureRequestEmail(opts: {
  locale: SignatureEmailLocale;
  roomName: string;
  title: string;
  message?: string | null;
  deepLink: string;
  ownerName?: string | null;
}): { subject: string; text: string; html: string } {
  const es = isEs(opts.locale);
  const subject = es
    ? `Firma requerida: ${opts.title} — ${opts.roomName}`
    : `Signature requested: ${opts.title} — ${opts.roomName}`;

  const intro = es
    ? `Te piden firmar un documento en la sala «${opts.roomName}».`
    : `You're asked to sign a document in the room “${opts.roomName}”.`;

  const docLine = es ? `Documento: ${opts.title}` : `Document: ${opts.title}`;
  const note =
    opts.message?.trim() &&
    (es
      ? `Nota: ${opts.message.trim()}`
      : `Note: ${opts.message.trim()}`);
  const cta = es ? "Abrir y firmar" : "Open and sign";
  const footer = es
    ? "Si no esperabas este mensaje, ignóralo o avisa a quien te compartió la sala."
    : "If you weren't expecting this, ignore it or contact whoever shared the room.";

  const text = [intro, docLine, note, `${cta}: ${opts.deepLink}`, footer]
    .filter(Boolean)
    .join("\n\n");

  const html = `
    <p>${escapeHtml(intro)}</p>
    <p><strong>${escapeHtml(docLine)}</strong></p>
    ${note ? `<p>${escapeHtml(note)}</p>` : ""}
    <p><a href="${escapeAttr(opts.deepLink)}" style="display:inline-block;padding:12px 18px;background:#1a1a2e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(cta)}</a></p>
    <p style="color:#666;font-size:12px">${escapeHtml(footer)}</p>
  `.trim();

  return { subject, text, html };
}

export function buildSignatureCompletedEmail(opts: {
  locale: SignatureEmailLocale;
  roomName: string;
  title: string;
  signerName: string;
  signerEmail: string;
  signedAt: Date;
  documentSha256: string | null;
  downloadLink: string | null;
  roomLink: string;
}): { subject: string; text: string; html: string } {
  const es = isEs(opts.locale);
  const when = formatSignedAt(opts.signedAt);
  const subject = es
    ? `Documento firmado: ${opts.title} — ${opts.roomName}`
    : `Document signed: ${opts.title} — ${opts.roomName}`;

  const intro = es
    ? `${opts.signerName} (${opts.signerEmail}) firmó «${opts.title}» en la sala ${opts.roomName}.`
    : `${opts.signerName} (${opts.signerEmail}) signed “${opts.title}” in room ${opts.roomName}.`;

  const timeLine = es
    ? `Fecha y hora: ${when.local} / ${when.utc}`
    : `Date and time: ${when.local} / ${when.utc}`;

  const hashLine = opts.documentSha256
    ? es
      ? `SHA-256: ${opts.documentSha256}`
      : `SHA-256: ${opts.documentSha256}`
    : null;

  const dl =
    opts.downloadLink &&
    (es
      ? `Descargar documento firmado: ${opts.downloadLink}`
      : `Download signed document: ${opts.downloadLink}`);

  const room =
    es
      ? `Ver en la sala: ${opts.roomLink}`
      : `View in room: ${opts.roomLink}`;

  const pendingStamp =
    !opts.downloadLink &&
    (es
      ? "La firma quedó registrada. El PDF firmado puede tardar un momento en generarse — descárgalo desde la sala."
      : "The signature was recorded. The signed PDF may take a moment to generate — download it from the room.");

  const text = [intro, timeLine, hashLine, dl, pendingStamp, room]
    .filter(Boolean)
    .join("\n\n");

  const html = `
    <p>${escapeHtml(intro)}</p>
    <p>${escapeHtml(timeLine)}</p>
    ${hashLine ? `<p style="font-family:monospace;font-size:12px;word-break:break-all">${escapeHtml(hashLine)}</p>` : ""}
    ${
      opts.downloadLink
        ? `<p><a href="${escapeAttr(opts.downloadLink)}">${escapeHtml(es ? "Descargar documento firmado" : "Download signed document")}</a></p>`
        : `<p>${escapeHtml(pendingStamp as string)}</p>`
    }
    <p><a href="${escapeAttr(opts.roomLink)}">${escapeHtml(es ? "Abrir la sala" : "Open the room")}</a></p>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
