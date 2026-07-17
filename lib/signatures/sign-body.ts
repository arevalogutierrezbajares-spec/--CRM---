/**
 * Pure validation for the public sign POST body and placement shape.
 * No server-only imports — unit-testable.
 */

export type SignaturePlacementInput = {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
};

export type SignBodyInput = {
  requestId: string;
  signerName: string;
  signerEmail: string;
  signatureDataUrl: string;
  consent: boolean;
  consentTextKey?: string | null;
  placement?: SignaturePlacementInput | null;
};

export type SignBodyOk = {
  ok: true;
  requestId: string;
  signerName: string;
  signerEmail: string;
  signatureDataUrl: string;
  consentTextKey: string;
  placement: SignaturePlacementInput | null;
};

export type SignBodyErr = { ok: false; error: string; field?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Canonical key for the consent copy shown in the modal (i18n `sign.consentText`). */
export const DEFAULT_CONSENT_TEXT_KEY = "sign.consentText";

export function isValidSignerEmail(email: string): boolean {
  const t = email.trim();
  return t.length >= 5 && t.length <= 200 && EMAIL_RE.test(t);
}

export function normalizePlacement(
  p: SignaturePlacementInput | null | undefined,
): SignaturePlacementInput | null {
  if (!p || typeof p !== "object") return null;
  const pageIndex = Number(p.pageIndex);
  const x = Number(p.x);
  const y = Number(p.y);
  const width = Number(p.width);
  if (!Number.isFinite(pageIndex) || pageIndex < 0 || pageIndex > 4999) return null;
  if (!Number.isFinite(x) || x < 0 || x > 1) return null;
  if (!Number.isFinite(y) || y < 0 || y > 1) return null;
  if (!Number.isFinite(width) || width < 0.05 || width > 1) return null;
  return {
    pageIndex: Math.floor(pageIndex),
    x,
    y,
    width,
  };
}

/**
 * Validates the client sign payload. Requires consent + email (P0).
 * Does not decode the PNG — that stays in decodeSignatureDataUrl.
 */
export function validateSignBody(raw: unknown): SignBodyOk | SignBodyErr {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_request" };
  }
  const b = raw as Record<string, unknown>;

  const requestId = typeof b.requestId === "string" ? b.requestId.trim() : "";
  if (!UUID_RE.test(requestId)) {
    return { ok: false, error: "invalid_request", field: "requestId" };
  }

  const signerName = typeof b.signerName === "string" ? b.signerName.trim() : "";
  if (signerName.length < 3 || signerName.length > 120) {
    return { ok: false, error: "name_required", field: "signerName" };
  }

  const signerEmail =
    typeof b.signerEmail === "string" ? b.signerEmail.trim().toLowerCase() : "";
  if (!isValidSignerEmail(signerEmail)) {
    return { ok: false, error: "email_required", field: "signerEmail" };
  }

  if (b.consent !== true) {
    return { ok: false, error: "consent_required", field: "consent" };
  }

  const signatureDataUrl =
    typeof b.signatureDataUrl === "string" ? b.signatureDataUrl : "";
  if (signatureDataUrl.length < 64 || signatureDataUrl.length > 450_000) {
    return { ok: false, error: "sign_invalid", field: "signatureDataUrl" };
  }

  const consentTextKey =
    typeof b.consentTextKey === "string" && b.consentTextKey.trim()
      ? b.consentTextKey.trim().slice(0, 80)
      : DEFAULT_CONSENT_TEXT_KEY;

  const placement = normalizePlacement(
    b.placement as SignaturePlacementInput | null | undefined,
  );

  return {
    ok: true,
    requestId,
    signerName,
    signerEmail,
    signatureDataUrl,
    consentTextKey,
    placement,
  };
}

/** Stamp lifecycle values stored on partner_signatures.stamp_status. */
export type StampStatus = "pending" | "ready" | "skipped_non_pdf" | "failed";

export function nextStampStatusAfterAttempt(opts: {
  isPdf: boolean;
  stampOk: boolean;
}): StampStatus {
  if (!opts.isPdf) return "skipped_non_pdf";
  return opts.stampOk ? "ready" : "failed";
}

/**
 * Integrity: the hash of bytes being signed must match the freeze hash when
 * a freeze was recorded at request time.
 */
export function assertFrozenHashMatch(opts: {
  frozenSha256AtRequest: string | null | undefined;
  bytesSha256: string | null | undefined;
}): { ok: true } | { ok: false; error: "hash_mismatch" | "missing_hash" } {
  const expected = opts.frozenSha256AtRequest?.trim() || null;
  const actual = opts.bytesSha256?.trim() || null;
  if (expected) {
    if (!actual) return { ok: false, error: "missing_hash" };
    if (expected.toLowerCase() !== actual.toLowerCase()) {
      return { ok: false, error: "hash_mismatch" };
    }
  }
  return { ok: true };
}
