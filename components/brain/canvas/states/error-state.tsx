"use client";

/**
 * THE BRAIN — error state (NFR-OBS-4: degrade visibly, never a blank/white
 * screen). Rendered by an error boundary OR when graph load fails. Surfaces a
 * human message + an optional retry, and (in dev) the underlying error detail.
 * Styled from `.brain-root` tokens so it matches the canvas even on a hard fail.
 */

export function ErrorState({
  title = "The map couldn’t load",
  message = "The architecture graph failed to render. The data is fine — this is a display fault.",
  error,
  onRetry,
}: {
  title?: string;
  message?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : error
          ? String(error)
          : null;

  return (
    <div
      className="brain-root"
      role="alert"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        className="glass-detail"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          maxWidth: 380,
          padding: "22px 24px",
          borderRadius: 14,
          border: "1px solid var(--line-2)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 11,
            display: "grid",
            placeItems: "center",
            border: "2px solid var(--warn)",
            color: "var(--warn)",
            fontFamily: "var(--mono)",
            fontWeight: 600,
            fontSize: 20,
            boxShadow: "var(--shadow-med), var(--gleam)",
          }}
        >
          !
        </div>

        <div
          style={{
            fontFamily: "var(--disp)",
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-.01em",
            color: "var(--ink)",
          }}
        >
          {title}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.55,
            color: "var(--ink-dim)",
          }}
        >
          {message}
        </p>

        {detail && (
          <code
            style={{
              maxWidth: "100%",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#070b12",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: "8px 11px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--ink-dim)",
            }}
          >
            {detail}
          </code>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 2,
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: ".03em",
              textTransform: "uppercase",
              color: "#06121a",
              background: "var(--caney)",
              border: "1px solid transparent",
              borderRadius: 9,
              padding: "7px 15px",
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "var(--shadow-med), var(--gleam)",
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
