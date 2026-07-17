"use client";

/**
 * Always-visible trust chip: when was the graph built, and which SHAs.
 * No live sibling-repo check in the browser (that is CI / brain:check).
 */

import { useMemo } from "react";
import { graph, isGenerated } from "@/lib/brain/data/graph";

function ageLabel(iso: string, nowMs: number): { text: string; stale: boolean } {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return { text: "unknown age", stale: true };
  const days = Math.floor((nowMs - t) / 86_400_000);
  const hours = Math.floor((nowMs - t) / 3_600_000);
  if (hours < 1) return { text: "just now", stale: false };
  if (hours < 48) return { text: `${hours}h ago`, stale: hours > 24 };
  return { text: `${days}d ago`, stale: days > 3 };
}

export function FreshnessBadge() {
  const now = useMemo(() => Date.now(), []);
  const { text, stale } = ageLabel(graph.generatedAt, now);
  const commits = graph.commit ?? {};
  const bits = (["crm", "vav", "caney", "restaurants"] as const)
    .map((k) => {
      const sha = commits[k];
      return sha ? `${k}@${String(sha).slice(0, 7)}` : null;
    })
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="brain-freshness"
      title={
        isGenerated
          ? `Derived graph · built ${graph.generatedAt}${bits ? `\n${bits}` : ""}`
          : "Using SAMPLE graph — run pnpm brain:build"
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${stale ? "rgba(212,160,64,.45)" : "var(--line)"}`,
        background: stale ? "rgba(212,160,64,.08)" : "rgba(255,255,255,.03)",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 10,
        letterSpacing: "0.04em",
        color: stale ? "var(--doing, #d4a040)" : "var(--ink-dim)",
        maxWidth: "100%",
      }}
    >
      <span aria-hidden>{stale ? "⚠" : "◎"}</span>
      <span>
        Graph {text}
        {!isGenerated ? " · SAMPLE" : ""}
      </span>
      {bits ? (
        <span
          style={{
            opacity: 0.7,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 280,
          }}
        >
          {bits}
        </span>
      ) : null}
    </div>
  );
}
