"use client";

import { useEffect } from "react";

/**
 * App-wide error boundary: a server-side exception used to surface as Next's
 * bare "Application error … Digest: NNNN" page (that is exactly what partners
 * saw when a room action crashed). Render a branded, recoverable screen
 * instead, and keep the digest visible so the operator can grep Vercel logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] px-6">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card,var(--background))] p-8 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Algo salió mal de nuestro lado. The error was logged — try again, and
          if it keeps happening let the team know.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-[var(--muted-foreground)]">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--secondary,transparent)]"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
