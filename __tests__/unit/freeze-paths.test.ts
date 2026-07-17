import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import {
  SIGN_DOC_MAX_BYTES,
  extForMime,
  frozenDocumentPath,
  legacySignatureImagePath,
  legacySignedPdfPath,
  mimeFromPdfMagic,
  signatureImagePath,
  signatureRequestBasePath,
  signedPdfPath,
} from "@/lib/signatures/freeze-paths";
import { sha256Hex } from "@/lib/signatures/stamp.server";
import { assertFrozenHashMatch } from "@/lib/signatures/sign-body";
import {
  buildSignatureCompletedEmail,
  buildSignatureRequestEmail,
} from "@/lib/signatures/emails";

const IDS = {
  workspaceId: "ws-1111",
  roomId: "room-2222",
  requestId: "req-3333",
};

describe("freeze path builders", () => {
  it("builds a stable folder base for a request", () => {
    expect(signatureRequestBasePath(IDS)).toBe(
      "ws-1111/partner-signatures/room-2222/req-3333",
    );
  });

  it("builds frozen source, signature image, and signed pdf paths", () => {
    expect(frozenDocumentPath({ ...IDS, ext: "pdf" })).toBe(
      "ws-1111/partner-signatures/room-2222/req-3333/source.pdf",
    );
    expect(signatureImagePath(IDS)).toBe(
      "ws-1111/partner-signatures/room-2222/req-3333/firma.png",
    );
    expect(signedPdfPath(IDS)).toBe(
      "ws-1111/partner-signatures/room-2222/req-3333/firmado.pdf",
    );
  });

  it("keeps legacy path helpers for old rows", () => {
    expect(legacySignatureImagePath(IDS)).toContain("-firma.png");
    expect(legacySignedPdfPath(IDS)).toContain("-firmado.pdf");
  });

  it("detects PDF magic and maps mime to ext", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(mimeFromPdfMagic(pdf)).toBe("application/pdf");
    expect(extForMime("application/pdf")).toBe("pdf");
    expect(extForMime("image/png")).toBe("png");
    expect(mimeFromPdfMagic(new Uint8Array([1, 2, 3]))).toBe(
      "application/octet-stream",
    );
  });

  it("exports a 30MB max", () => {
    expect(SIGN_DOC_MAX_BYTES).toBe(30 * 1024 * 1024);
  });
});

describe("freeze hash integrity (shipped helpers)", () => {
  it("sha256Hex matches node crypto and assertFrozenHashMatch accepts it", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hex = sha256Hex(bytes);
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(hex).toBe(expected);
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: hex,
        bytesSha256: expected,
      }),
    ).toEqual({ ok: true });
    expect(
      assertFrozenHashMatch({
        frozenSha256AtRequest: hex,
        bytesSha256: "deadbeef",
      }).ok,
    ).toBe(false);
  });
});

describe("signature email builders", () => {
  it("builds ES request email with deep link", () => {
    const mail = buildSignatureRequestEmail({
      locale: "es",
      roomName: "Sala Ucaima",
      title: "Contrato MSA",
      message: "Por favor revisa",
      deepLink: "https://example.com/access/tok?sign=req-1",
    });
    expect(mail.subject).toContain("Firma requerida");
    expect(mail.subject).toContain("Contrato MSA");
    expect(mail.text).toContain("https://example.com/access/tok?sign=req-1");
    expect(mail.html).toContain("href=");
  });

  it("builds EN completed email with hash", () => {
    const mail = buildSignatureCompletedEmail({
      locale: "en",
      roomName: "Room",
      title: "NDA",
      signerName: "Alex",
      signerEmail: "a@b.com",
      signedAt: new Date("2026-06-12T17:30:00.000Z"),
      documentSha256: "abc123",
      downloadLink: "https://example.com/dl",
      roomLink: "https://example.com/room",
    });
    expect(mail.subject).toMatch(/signed|Document/i);
    expect(mail.text).toContain("abc123");
    expect(mail.text).toContain("a@b.com");
  });
});
