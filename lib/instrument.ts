/**
 * Lightweight server-side error capture.
 *
 * Forwards to Sentry when `SENTRY_DSN` is set; falls back to a structured
 * console.error otherwise. Keeps the dependency cost at zero until a key
 * lands. Shape matches the Sentry envelope so a future drop-in is one line.
 *
 * Usage:
 *
 *   import { captureError, withErrorCapture } from "@/lib/instrument";
 *
 *   try {
 *     // ... handler body
 *   } catch (e) {
 *     captureError(e, { route: "/api/cron/watchdogs" });
 *     throw e;
 *   }
 *
 * or wrap a whole route:
 *
 *   export const POST = withErrorCapture("/api/postmark/inbound", async (req) => {
 *     // ...
 *   });
 */

type CaptureContext = Record<string, string | number | boolean | null | undefined>;

const SENTRY_DSN = process.env.SENTRY_DSN;

function structuredLog(
  level: "error" | "warn",
  message: string,
  error: unknown,
  ctx: CaptureContext,
) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { message: String(error) },
    context: ctx,
    env: process.env.NODE_ENV,
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
}

async function postToSentry(
  message: string,
  error: unknown,
  ctx: CaptureContext,
) {
  if (!SENTRY_DSN) return;
  // Parse the DSN into projectId + publicKey + host.
  // DSN shape: https://<key>@<host>/<project_id>
  try {
    const url = new URL(SENTRY_DSN);
    const projectId = url.pathname.replace(/^\//, "");
    const publicKey = url.username;
    const host = url.host;
    const endpoint = `https://${host}/api/${projectId}/store/`;
    const auth = `Sentry sentry_version=7, sentry_client=agb-crm/1.0, sentry_key=${publicKey}`;
    const body = {
      event_id: crypto.randomUUID().replace(/-/g, ""),
      timestamp: Math.floor(Date.now() / 1000),
      level: "error",
      platform: "node",
      message,
      exception:
        error instanceof Error
          ? {
              values: [
                {
                  type: error.name,
                  value: error.message,
                  stacktrace: { frames: parseStack(error.stack) },
                },
              ],
            }
          : undefined,
      tags: ctx,
      environment: process.env.NODE_ENV ?? "production",
    };
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sentry-Auth": auth,
      },
      body: JSON.stringify(body),
      // best-effort; don't keep the function warm waiting
    });
  } catch {
    // Fail silent — don't let instrumentation crash callers.
  }
}

function parseStack(stack: string | undefined) {
  if (!stack) return [];
  // Sentry expects an array of { filename, function, lineno, colno }. Strip the
  // first line (the message) and split the rest.
  return stack
    .split("\n")
    .slice(1)
    .map((line) => {
      const m = line.match(/at (\S+) \((.+):(\d+):(\d+)\)/) ?? null;
      if (!m) return { function: line.trim() };
      return {
        function: m[1],
        filename: m[2],
        lineno: Number(m[3]),
        colno: Number(m[4]),
      };
    });
}

export function captureError(error: unknown, context: CaptureContext = {}) {
  const message =
    error instanceof Error ? error.message : "Non-Error captured";
  structuredLog("error", message, error, context);
  // Fire-and-forget Sentry post.
  void postToSentry(message, error, context);
}

export function captureWarn(message: string, context: CaptureContext = {}) {
  structuredLog("warn", message, null, context);
}

/**
 * Wrap a Next.js route handler so any thrown error is captured + the original
 * response shape is preserved.
 */
export function withErrorCapture<Args extends unknown[], R>(
  route: string,
  fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
  return async (...args: Args): Promise<R> => {
    try {
      return await fn(...args);
    } catch (e) {
      captureError(e, { route });
      throw e;
    }
  };
}

export function isInstrumentationConfigured(): boolean {
  return Boolean(SENTRY_DSN);
}
