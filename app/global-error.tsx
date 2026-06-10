"use client";

/**
 * Last-resort boundary for crashes in the root layout itself. Must render its
 * own <html>/<body> because the layout is gone at this point.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 420 }}>
          <p style={{ fontSize: 36, margin: 0 }}>⚠️</p>
          <h1 style={{ fontSize: 18, marginTop: 16 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, opacity: 0.7 }}>
            Algo salió mal. The error was logged — try again in a moment.
          </p>
          {error.digest && (
            <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.5 }}>
              Ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#fafafa",
              color: "#0a0a0a",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
