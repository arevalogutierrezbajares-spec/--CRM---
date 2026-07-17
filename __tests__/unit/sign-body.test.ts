import { describe, expect, it } from "vitest";
import {
  assertFrozenHashMatch,
  DEFAULT_CONSENT_TEXT_KEY,
  isValidSignerEmail,
  nextStampStatusAfterAttempt,
  normalizePlacement,
  validateSignBody,
} from "@/lib/signatures/sign-body";

const VALID_UUID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
const PNG_DATA_URL =
  "data:image/png;base64," + "A".repeat(80);

describe("isValidSignerEmail", () => {
  it("accepts normal emails", () => {
    expect(isValidSignerEmail("partner@co.com")).toBe(true);
  });
  it("rejects missing @", () => {
    expect(isValidSignerEmail("not-an-email")).toBe(false);
  });
  it("rejects empty", () => {
    expect(isValidSignerEmail("")).toBe(false);
  });
});

describe("validateSignBody", () => {
  const base = {
    requestId: VALID_UUID,
    signerName: "Karen Brewer",
    signerEmail: "karen@example.com",
    signatureDataUrl: PNG_DATA_URL,
    consent: true as const,
  };

  it("accepts a complete body and defaults consentTextKey", () => {
    const out = validateSignBody(base);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.signerEmail).toBe("karen@example.com");
    expect(out.consentTextKey).toBe(DEFAULT_CONSENT_TEXT_KEY);
    expect(out.placement).toBeNull();
  });

  it("requires email", () => {
    const out = validateSignBody({ ...base, signerEmail: "" });
    expect(out).toEqual({
      ok: false,
      error: "email_required",
      field: "signerEmail",
    });
  });

  it("requires consent true", () => {
    const out = validateSignBody({ ...base, consent: false });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("consent_required");
  });

  it("requires full name", () => {
    const out = validateSignBody({ ...base, signerName: "ab" });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toBe("name_required");
  });

  it("normalizes placement when valid", () => {
    const out = validateSignBody({
      ...base,
      placement: { pageIndex: 1, x: 0.2, y: 0.3, width: 0.4 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.placement).toEqual({
      pageIndex: 1,
      x: 0.2,
      y: 0.3,
      width: 0.4,
    });
  });

  it("drops invalid placement rather than rejecting the body", () => {
    const out = validateSignBody({
      ...base,
      placement: { pageIndex: -1, x: 2, y: 0, width: 0.01 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.placement).toBeNull();
  });
});

describe("normalizePlacement", () => {
  it("returns null for out-of-range width", () => {
    expect(
      normalizePlacement({ pageIndex: 0, x: 0, y: 0, width: 0.01 }),
    ).toBeNull();
  });
});

describe("assertFrozenHashMatch", () => {
  it("passes when no freeze hash was recorded (legacy)", () => {
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: null,
        bytesSha256: "abc",
      }),
    ).toEqual({ ok: true });
  });

  it("passes when hashes match (case-insensitive)", () => {
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: "AbCd",
        bytesSha256: "abcd",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects mismatch", () => {
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: "aaa",
        bytesSha256: "bbb",
      }),
    ).toEqual({ ok: false, error: "hash_mismatch" });
  });

  it("rejects missing actual when freeze expected", () => {
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: "aaa",
        bytesSha256: null,
      }),
    ).toEqual({ ok: false, error: "missing_hash" });
  });
});

describe("nextStampStatusAfterAttempt", () => {
  it("skips non-pdf", () => {
    expect(
      nextStampStatusAfterAttempt({ isPdf: false, stampOk: true }),
    ).toBe("skipped_non_pdf");
  });
  it("ready when stamp ok", () => {
    expect(
      nextStampStatusAfterAttempt({ isPdf: true, stampOk: true }),
    ).toBe("ready");
  });
  it("failed when stamp fails", () => {
    expect(
      nextStampStatusAfterAttempt({ isPdf: true, stampOk: false }),
    ).toBe("failed");
  });
});
