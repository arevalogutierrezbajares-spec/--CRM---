"use client";

/**
 * THE BRAIN — always-visible search affordance (P1 discoverability).
 *
 * A full-width search field rendered at the TOP OF THE RAIL (collision-free —
 * it never overlaps canvas nodes, unlike a top-center overlay) that opens the
 * Brain command palette. Shows a search glyph, placeholder text, and a `/` kbd
 * hint so the keyboard shortcut is self-documenting. Also wires the bare `/`
 * key (guard: skipped when a text input is focused) — the existing ⌘⇧K binding
 * is preserved in command-palette.tsx. The global app ⌘K is NOT overridden.
 */

import { useEffect } from "react";
import { openBrainCommandPalette } from "./command-palette";

export function SearchTrigger() {
  // Bare `/` key opens palette — only when the user is not typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (!el) return;
      const tag = el.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      )
        return;
      e.preventDefault();
      openBrainCommandPalette();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      type="button"
      onClick={openBrainCommandPalette}
      aria-label="Search nodes (press / or ⌘⇧K)"
      title="Search nodes"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        width: "100%",
        height: 34,
        marginBottom: 14,
        padding: "0 10px",
        borderRadius: 9,
        border: "1px solid var(--line-2)",
        background: "var(--panel-2)",
        boxShadow: "var(--gleam)",
        cursor: "pointer",
        color: "var(--ink-faint)",
        fontFamily: "var(--mono)",
        fontSize: 12,
        letterSpacing: ".01em",
        whiteSpace: "nowrap",
        transition: "border-color .18s var(--ease), color .18s var(--ease)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--line-2, rgba(255,255,255,.12))";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-dim)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "var(--line-2)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--ink-faint)";
      }}
    >
      {/* Search glyph */}
      <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>
        ⌕
      </span>

      {/* Placeholder text */}
      <span style={{ color: "var(--ink-faint)", fontSize: 12 }}>
        Search nodes
      </span>

      {/* kbd hint — purely decorative, stays smaller */}
      <kbd
        aria-hidden="true"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          padding: "1px 5px",
          borderRadius: 5,
          border: "1px solid var(--line-2)",
          color: "var(--ink-faint)",
          background: "rgba(255,255,255,.04)",
          marginLeft: "auto",
        }}
      >
        /
      </kbd>
    </button>
  );
}
