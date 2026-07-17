"use client";

/**
 * THE BRAIN — left rail (FR-AXIS-1,2 · FR-LENS-1,2,5 · FR-PRESET-1,2).
 *
 * The control surface. Sections:
 *  - View   : By System / By Function axis toggle      → actions.setAxis
 *  - Lenses : Navigation / State (active) + Topology / Liveness (disabled v0)
 *             + Function overlay                        → actions.setLens
 *  - Audience: Investor / Agent / Operator preset       → actions.setPreset
 *  - Legends: status double-encoding · system colors · the 7 function colors
 *             (default-collapsed; Insights lives under the same fold)
 *
 * Every control wires to a provider action; nothing here holds its own state
 * except the Legends open/closed toggle. Disabled lenses are real
 * <button disabled> with a tooltip explaining "v2" so the affordance is
 * discoverable but inert (degrade-safe).
 */

import { useState } from "react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { SearchTrigger } from "@/components/brain/canvas/chrome/search-trigger";
import { Insights } from "@/components/brain/canvas/chrome/insights";
import { getPreset, PRESET_LIST } from "@/lib/brain/presets";
import { FUNCS, FN_COLOR } from "@/lib/brain/functions";
import {
  STATE_GLYPH,
  STATE_LABEL,
  SYSTEM_ACCENT,
  SYSTEM_LABEL,
  type NodeState,
  type System,
} from "@/lib/brain/types";
import type { Axis } from "@/lib/brain/selectors";
import type { LensKey } from "@/lib/brain/lenses/types";

const STATE_VAR: Record<NodeState, string> = {
  done: "var(--done)",
  doing: "var(--doing)",
  needed: "var(--needed)",
};

interface LensDef {
  key: LensKey;
  label: string;
  icon: string;
  sub: string;
  enabled: boolean;
  /** Tooltip shown for disabled (scaffolded) lenses. */
  disabledHint?: string;
}

const LENSES: LensDef[] = [
  { key: "navigation", label: "Navigation", icon: "🗺", sub: "drill the map", enabled: true },
  { key: "state", label: "State", icon: "🌳", sub: "built / wip / needed", enabled: true },
  { key: "function", label: "Function overlay", icon: "🗂", sub: "recolor by capability", enabled: true },
  // Topology is live: dims non-linked nodes, keeps interchange threads bright.
  { key: "topology", label: "Topology", icon: "🚇", sub: "cross-system wiring", enabled: true },
  // Liveness stays gated until runtime telemetry populates node.liveness.
  { key: "liveness", label: "Liveness", icon: "🧠", sub: "v2 — telemetry", enabled: false, disabledHint: "Liveness lens — needs runtime telemetry (v2)" },
];

export function Rail() {
  const { view, actions } = useBrain();
  const [legendsOpen, setLegendsOpen] = useState(false);

  return (
    <aside
      className="brain-rail"
      aria-label="Brain controls"
      style={{
        flexShrink: 0,
        height: "100%",
        overflowY: "auto",
        padding: "16px 13px",
        borderRight: "1px solid var(--line)",
        background:
          "linear-gradient(180deg,rgba(255,255,255,.015),transparent 38%)",
      }}
    >
      {/* ── Search (discoverable jump palette · also ⌘⇧K / `/`) ───────── */}
      <SearchTrigger />

      {/* ── View / axis ───────────────────────────────────────────────── */}
      <Section title="View">
        <Segmented
          ariaLabel="Reading axis"
          options={[
            { value: "system", label: "By System" },
            { value: "function", label: "By Function" },
          ]}
          value={view.axis}
          onChange={(v) => actions.setAxis(v as Axis)}
        />
      </Section>

      {/* ── Lenses ────────────────────────────────────────────────────── */}
      <Section title="Lenses">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {LENSES.map((l) => {
            const active = view.lens === l.key;
            return (
              <button
                key={l.key}
                type="button"
                disabled={!l.enabled}
                aria-pressed={active}
                title={l.enabled ? l.sub : (l.disabledHint ?? l.sub)}
                onClick={() => l.enabled && actions.setLens(l.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 9px",
                  borderRadius: 9,
                  border: `1px solid ${active ? "var(--line-2)" : "transparent"}`,
                  background: active ? "var(--panel-s)" : "transparent",
                  color: !l.enabled
                    ? "var(--ink-faint)"
                    : active
                      ? "var(--ink)"
                      : "var(--ink-dim)",
                  cursor: l.enabled ? "pointer" : "not-allowed",
                  opacity: l.enabled ? 1 : 0.5,
                  transition: "background .18s var(--ease), color .18s var(--ease)",
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
                  {l.icon}
                </span>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{l.label}</span>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 11,
                      color: "var(--ink-faint)",
                    }}
                  >
                    {l.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Audience / preset ─────────────────────────────────────────── */}
      <Section title="Audience">
        <Segmented
          ariaLabel="Audience preset"
          options={PRESET_LIST.map((p) => ({ value: p.id, label: p.label }))}
          value={view.preset}
          onChange={(v) => actions.setPreset(v as (typeof PRESET_LIST)[number]["id"])}
        />
        {getPreset(view.preset).badge ? (
          <p
            style={{
              margin: "6px 2px 0",
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--ink-faint)",
              letterSpacing: "0.04em",
            }}
          >
            {getPreset(view.preset).badge}
          </p>
        ) : null}
      </Section>

      {/* ── Legends (default collapsed) + Insights ───────────────────── */}
      <section style={{ marginBottom: 20 }}>
        <button
          type="button"
          aria-expanded={legendsOpen}
          onClick={() => setLegendsOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            margin: "2px 0 9px",
            padding: "2px 4px",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--ink-faint)",
          }}
        >
          <span>Legends</span>
          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>
            {legendsOpen ? "▾" : "▸"}
          </span>
        </button>

        {legendsOpen ? (
          <>
            <Section title="Insights">
              <Insights />
            </Section>

            <Section title="Status">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(["done", "doing", "needed"] as NodeState[]).map((s) => (
                  <LegendRow
                    key={s}
                    glyph={STATE_GLYPH[s]}
                    glyphColor={STATE_VAR[s]}
                    label={STATE_LABEL[s]}
                  />
                ))}
                <LegendRow glyph="⇄" glyphColor="var(--warn)" label="CROSS-SYSTEM LINK" />
              </div>
            </Section>

            <Section title="Systems">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(Object.keys(SYSTEM_ACCENT) as System[]).map((sys) => (
                  <div
                    key={sys}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: SYSTEM_ACCENT[sys],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                      {SYSTEM_LABEL[sys]}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Functions">
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {FUNCS.map((f) => (
                  <div
                    key={f.id}
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 3,
                        background: FN_COLOR[f.id],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>
                      {f.name}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </>
        ) : null}
      </section>
    </aside>
  );
}

/* ── Building blocks ─────────────────────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h4
        style={{
          margin: "2px 4px 9px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
        }}
      >
        {title}
      </h4>
      {children}
    </section>
  );
}

function Segmented({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: 3,
        padding: 3,
        borderRadius: 10,
        background: "rgba(255,255,255,.035)",
        border: "1px solid var(--line-2)",
        boxShadow: "var(--gleam)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: "5px 6px",
              borderRadius: 7,
              border: "none",
              background: active ? "var(--panel-s)" : "transparent",
              color: active ? "var(--ink)" : "var(--ink-dim)",
              fontFamily: "var(--mono)",
              fontSize: 11,
              letterSpacing: ".03em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "background .18s var(--ease), color .18s var(--ease)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LegendRow({
  glyph,
  glyphColor,
  label,
}: {
  glyph: string;
  glyphColor: string;
  label: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 13,
          textAlign: "center",
          fontFamily: "var(--mono)",
          fontSize: 11,
          fontWeight: 600,
          color: glyphColor,
          flexShrink: 0,
        }}
      >
        {glyph}
      </span>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".06em",
          color: "var(--ink-dim)",
        }}
      >
        {label}
      </span>
    </div>
  );
}
