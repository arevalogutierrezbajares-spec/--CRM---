import { describe, expect, it } from "vitest";
import { decodeBase64Upload } from "@/lib/wa-agent/tools/_upload";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("decodeBase64Upload", () => {
  it("decodes a plain base64 string", () => {
    const res = decodeBase64Upload(b64("hello world"), 1024);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Buffer.from(res.result.bytes).toString()).toBe("hello world");
      expect(res.result.sizeBytes).toBe(11);
    }
  });

  it("strips a data: URL prefix", () => {
    const res = decodeBase64Upload(`data:image/png;base64,${b64("PNGDATA")}`, 1024);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Buffer.from(res.result.bytes).toString()).toBe("PNGDATA");
  });

  it("tolerates whitespace and newlines in the payload", () => {
    const raw = b64("wrapped content here");
    const wrapped = raw.replace(/(.{4})/g, "$1\n  ");
    const res = decodeBase64Upload(wrapped, 1024);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Buffer.from(res.result.bytes).toString()).toBe("wrapped content here");
  });

  it("rejects missing content", () => {
    expect(decodeBase64Upload(undefined, 1024).ok).toBe(false);
    expect(decodeBase64Upload("", 1024).ok).toBe(false);
    expect(decodeBase64Upload("   ", 1024).ok).toBe(false);
  });

  it("enforces the byte ceiling", () => {
    const res = decodeBase64Upload(b64("x".repeat(2048)), 1024);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/i);
  });
});
