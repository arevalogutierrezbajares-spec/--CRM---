import { describe, expect, it } from "vitest";
import {
  decodeSignatureDataUrl,
  formatSignedAt,
  SIGNATURE_PNG_MAX_BYTES,
} from "@/lib/signatures/signature-image";

// Smallest valid PNG header + IHDR start — enough to pass the magic check.
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const pngDataUrl = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;

describe("decodeSignatureDataUrl", () => {
  it("decodes a well-formed PNG data URL", () => {
    const out = decodeSignatureDataUrl(pngDataUrl);
    expect(out).not.toBeNull();
    expect(Array.from(out!.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("rejects non-PNG mime types", () => {
    const jpeg = `data:image/jpeg;base64,${Buffer.from(PNG_BYTES).toString("base64")}`;
    expect(decodeSignatureDataUrl(jpeg)).toBeNull();
  });

  it("rejects content whose bytes are not PNG (renamed payloads)", () => {
    const fake = `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
    expect(decodeSignatureDataUrl(fake)).toBeNull();
  });

  it("rejects garbage and empty strings", () => {
    expect(decodeSignatureDataUrl("")).toBeNull();
    expect(decodeSignatureDataUrl("data:image/png;base64,@@@@")).toBeNull();
    expect(decodeSignatureDataUrl("hola")).toBeNull();
  });

  it("rejects payloads above the size cap", () => {
    const big = Buffer.concat([
      Buffer.from(PNG_BYTES),
      Buffer.alloc(SIGNATURE_PNG_MAX_BYTES),
    ]);
    const url = `data:image/png;base64,${big.toString("base64")}`;
    expect(decodeSignatureDataUrl(url)).toBeNull();
  });
});

describe("formatSignedAt", () => {
  it("returns the exact UTC instant plus a Caracas-local rendering", () => {
    const date = new Date("2026-06-12T17:30:00.000Z");
    const out = formatSignedAt(date);
    expect(out.utc).toBe("2026-06-12T17:30:00.000Z");
    expect(out.local).toContain("(Caracas)");
    // Caracas is UTC-4 → 1:30 p.m.
    expect(out.local).toMatch(/1:30/);
  });
});
