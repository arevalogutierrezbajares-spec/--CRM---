"use client";

/**
 * THE BRAIN — Insights panel (Concern 3: gap-finding made visible).
 *
 * Renders the graphology analytics overlay (computeInsights) as a compact rail
 * section. Turns the pretty map into an analytical one: surfaces cross-system
 * dependency CYCLES, integration HUBS / god-objects, and the domains with no
 * mapped data-flow (BLIND SPOTS). Every row is clickable → selects the node so
 * the detail panel opens. Computed once from the static graph (deterministic),
 * memoized so it never recomputes on view changes.
 */

import { useMemo } from "react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { graph } from "@/lib/brain";
import { SYSTEM_ACCENT, type System } from "@/lib/brain/types";
import { computeInsights, type NodeRef } from "@/lib/brain/analytics";

export function Insights() {
  const { actions } = useBrain();
  const ins = useMemo(() => computeInsights(graph), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Coverage meter ─────────────────────────────────────────────── */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 5,
          }}
        >
          <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
            Data-flow coverage
          </span>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink)",
            }}
          >
            {ins.coverage.pct}%
          </span>
        </div>
        <div
          aria-hidden="true"
          style={{
            height: 5,
            borderRadius: 3,
            background: "rgba(255,255,255,.07)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${ins.coverage.pct}%`,
              height: "100%",
              borderRadius: 3,
              background:
                "linear-gradient(90deg,var(--done),var(--doing))",
            }}
          />
        </div>
        <p
          style={{
            margin: "5px 1px 0",
            fontFamily: "var(--mono)",
            fontSize: 10.5,
            color: "var(--ink-faint)",
          }}
        >
          {ins.coverage.mapped}/{ins.coverage.domains} domains have mapped edges ·{" "}
          {ins.semanticEdgeCount} data-flow links
        </p>
      </div>

      {/* ── Dependency cycles (the architectural smell) ────────────────── */}
      {ins.crossSystemCycles.length > 0 && (
        <Block label="Dependency cycles" warn>
          {ins.crossSystemCycles.map((c) => (
            <div key={c.label} style={{ marginBottom: 6 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--warn)",
                }}
              >
                <span aria-hidden="true">⚠</span>
                <span>{c.label}</span>
              </div>
              {c.via.map((v) => (
                <button
                  key={`${v.from.id}->${v.to.id}`}
                  type="button"
                  onClick={() => actions.select(v.from.id)}
                  title={v.purpose ?? undefined}
                  style={rowBtn}
                >
                  <Dot system={v.from.system} />
                  <span style={rowLabel}>
                    {short(v.from.label)} → {short(v.to.label)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </Block>
      )}

      {/* ── Hubs / god-objects ─────────────────────────────────────────── */}
      {ins.hubs.length > 0 && (
        <Block label="Hubs">
          {ins.hubs.slice(0, 5).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => actions.select(h.id)}
              style={rowBtn}
            >
              <Dot system={h.system} />
              <span style={rowLabel}>{short(h.label)}</span>
              <Badge>{h.degree}</Badge>
            </button>
          ))}
        </Block>
      )}

      {/* ── Blind spots (coverage gaps) ────────────────────────────────── */}
      {ins.coverageGaps.length > 0 && (
        <Block label={`Blind spots (${ins.coverageGaps.length})`}>
          {ins.coverageGaps.slice(0, 5).map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => actions.select(g.id)}
              title={g.reason}
              style={rowBtn}
            >
              <Dot system={g.system} />
              <span style={rowLabel}>{short(g.label)}</span>
              {g.childCount > 0 && <Badge dim>{g.childCount}</Badge>}
            </button>
          ))}
        </Block>
      )}
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────── */

const rowBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  textAlign: "left",
  padding: "4px 5px",
  borderRadius: 7,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--ink-dim)",
  cursor: "pointer",
  transition: "background .15s var(--ease), color .15s var(--ease)",
};

const rowLabel: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

function Block({
  label,
  warn,
  children,
}: {
  label: string;
  warn?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h5
        style={{
          margin: "0 4px 5px",
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: warn ? "var(--warn)" : "var(--ink-faint)",
        }}
      >
        {label}
      </h5>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {children}
      </div>
    </div>
  );
}

function Dot({ system }: { system: System | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 8,
        height: 8,
        borderRadius: 2,
        flexShrink: 0,
        background: system ? SYSTEM_ACCENT[system] : "var(--ink-faint)",
      }}
    />
  );
}

function Badge({
  children,
  dim,
}: {
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--mono)",
        fontSize: 10,
        fontWeight: 600,
        padding: "1px 5px",
        borderRadius: 5,
        flexShrink: 0,
        color: dim ? "var(--ink-faint)" : "var(--ink)",
        background: "rgba(255,255,255,.06)",
      }}
    >
      {children}
    </span>
  );
}

/** Trim long route/domain labels so rows never wrap. */
function short(label: string): string {
  return label.length > 30 ? label.slice(0, 29) + "…" : label;
}

export type { NodeRef };
