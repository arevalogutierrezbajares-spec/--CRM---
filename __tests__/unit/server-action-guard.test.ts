/**
 * Regression for the prod digest-4214350264 class of failure: a partner-access
 * server action threw a raw Postgres FK violation and the client crashed to
 * Next's opaque error page. withActionGuard must (1) pass results through,
 * (2) convert unexpected throws into { ok: false } with a friendly message,
 * (3) map known Postgres codes, and (4) re-throw Next control-flow errors
 * (redirect/notFound) untouched.
 */
import { describe, it, expect } from "vitest";
import { redirect, notFound } from "next/navigation";
import { pgErrorCode, withActionGuard } from "@/lib/server-action-guard";

function pgError(code: string, depth = 2): Error {
  // drizzle wraps the driver error in .cause (sometimes nested) — mirror that.
  let inner: Error & { code?: string } = new Error("driver failure");
  inner.code = code;
  for (let i = 1; i < depth; i++) {
    inner = new Error("wrapper", { cause: inner }) as Error & { code?: string };
  }
  return inner;
}

describe("pgErrorCode", () => {
  it("finds the code on the error itself", () => {
    expect(pgErrorCode(pgError("23503", 1))).toBe("23503");
  });

  it("walks nested cause chains (drizzle wrapping)", () => {
    expect(pgErrorCode(pgError("23505", 3))).toBe("23505");
  });

  it("returns null when no postgres code exists", () => {
    expect(pgErrorCode(new Error("plain"))).toBeNull();
    expect(pgErrorCode(undefined)).toBeNull();
  });
});

describe("withActionGuard", () => {
  it("passes successful results through untouched", async () => {
    const action = withActionGuard("t", async (n: number) => ({ ok: true as const, n }));
    await expect(action(7)).resolves.toEqual({ ok: true, n: 7 });
  });

  it("converts an FK violation into ok:false with a friendly message", async () => {
    const action = withActionGuard("t", async () => {
      throw pgError("23503");
    });
    const res = await action();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no longer exists/i);
  });

  it("converts unknown throws into ok:false (never crashes the client)", async () => {
    const action = withActionGuard("t", async () => {
      throw new Error("boom");
    });
    const res = await action();
    expect(res.ok).toBe(false);
  });

  it("re-throws redirect() so Next control flow still works", async () => {
    const action = withActionGuard("t", async () => {
      redirect("/login");
    });
    await expect(action()).rejects.toThrow();
  });

  it("re-throws notFound() so Next control flow still works", async () => {
    const action = withActionGuard("t", async () => {
      notFound();
    });
    await expect(action()).rejects.toThrow();
  });
});
