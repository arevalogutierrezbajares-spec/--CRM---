import { describe, expect, it } from "vitest";
import {
  decodeSignatureDataUrl,
  formatSignedAt,
  SIGNATURE_PNG_MAX_BYTES,
} from "@/lib/signatures/signature-image";
import { makeTestSignaturePng } from "../helpers/png";

const PNG_BYTES = makeTestSignaturePng();
const pngDataUrl = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

describe("decodeSignatureDataUrl", () => {
  it("decodes a well-formed PNG data URL", () => {
    const out = decodeSignatureDataUrl(pngDataUrl);
    expect(out).not.toBeNull();
    expect(Array.from(out!.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("rejects non-PNG mime types", () => {
    const jpeg = `data:image/jpeg;base64,${PNG_BYTES.toString("base64")}`;
    expect(decodeSignatureDataUrl(jpeg)).toBeNull();
  });

  it("rejects content whose bytes are not PNG (renamed payloads)", () => {
    const fake = `data:image/png;base64,${Buffer.from("<script>alert(1)</script>").toString("base64")}`;
    expect(decodeSignatureDataUrl(fake)).toBeNull();
  });

  it("rejects a PNG magic header with a truncated body", () => {
    const truncated = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const url = `data:image/png;base64,${Buffer.from(truncated).toString("base64")}`;
    expect(decodeSignatureDataUrl(url)).toBeNull();
  });

  it("rejects the malformed-body payload that sends pdf-lib into an infinite loop", () => {
    // Valid magic, garbage chunk structure — embedPng() never returns on this.
    const malicious =
      "iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAACzg5PFAAAAvElEQVR4nO3YsQ3CMBRF0e+IBVKzCDOwCh0bMAgSEjuwAT0DUNAgKjpqGsQOLpDcurOLnNNYsq3vd2XLSimlYrvdPquqOiL+VVU9R8RzRDxFxENE3EfEXUTcRsRNRFxHxFVEXEbERUScR8RZRJxGxElEHEfEUUQcRsRBROxHxF5E7EbETkRsR8RWRGxGxEZErEfEWkSsRsRKRCxHxFJELEbEQkTMR8RcRMxGxExETEfEVERMRsRERIxHxFhE/AAmrnFGq1iU0wAAAABJRU5ErkJggg==";
    expect(decodeSignatureDataUrl(`data:image/png;base64,${malicious}`)).toBeNull();
  });

  it("rejects payloads above the size cap", () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(SIGNATURE_PNG_MAX_BYTES)]);
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
