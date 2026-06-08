/**
 * Unit tests for the MCP OAuth token primitives — the security-critical pure
 * logic: SHA-256 token hashing and PKCE S256 verification. No DB required.
 */
import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";

// token.server.ts begins with `import "server-only"`, a Next-provided alias
// that doesn't resolve under vitest. Stub it out.
vi.mock("server-only", () => ({}));

const { createToken, hashToken, verifyPkceS256 } = await import(
  "@/lib/mcp/token.server"
);

describe("MCP token primitives", () => {
  it("createToken returns unique, URL-safe, high-entropy strings", () => {
    const a = createToken();
    const b = createToken();
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashToken is deterministic and matches sha256 hex", () => {
    expect(hashToken("abc")).toEqual(hashToken("abc"));
    expect(hashToken("abc")).toEqual(
      createHash("sha256").update("abc").digest("hex"),
    );
    expect(hashToken("abc")).not.toEqual(hashToken("abd"));
  });

  it("verifyPkceS256 accepts a correct verifier/challenge pair", () => {
    const verifier = createToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("verifyPkceS256 rejects a wrong verifier", () => {
    const verifier = createToken();
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyPkceS256(createToken(), challenge)).toBe(false);
  });

  it("verifyPkceS256 rejects empty inputs", () => {
    expect(verifyPkceS256("", "x")).toBe(false);
    expect(verifyPkceS256("x", "")).toBe(false);
  });
});
