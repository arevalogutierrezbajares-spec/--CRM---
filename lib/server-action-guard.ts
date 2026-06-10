import "server-only";
import { unstable_rethrow } from "next/navigation";

type Failure = { ok: false; error: string };

const GENERIC_ERROR =
  "Something went wrong on our side. It's been logged — try again in a moment.";

/** Walk an error's cause chain and return the Postgres error code, if any. */
export function pgErrorCode(err: unknown): string | null {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

function friendlyDbMessage(err: unknown): string | null {
  switch (pgErrorCode(err)) {
    case "23503": // foreign_key_violation
      return "That record points at something that no longer exists. Refresh and try again.";
    case "23505": // unique_violation
      return "That already exists — refresh to see the latest state.";
    case "42P01": // undefined_table
    case "42703": // undefined_column
      return "The database is behind the app (pending migration). Ping the operator.";
    default:
      return null;
  }
}

/**
 * Wraps a server action so an unexpected throw becomes a `{ ok: false }`
 * result instead of crashing the client to Next's opaque digest error page.
 * Next control-flow throws (redirect/notFound) are re-thrown untouched.
 */
export function withActionGuard<Args extends unknown[], R>(
  label: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R | Failure> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      unstable_rethrow(err);
      console.error(`[action:${label}]`, err);
      return { ok: false, error: friendlyDbMessage(err) ?? GENERIC_ERROR };
    }
  };
}
