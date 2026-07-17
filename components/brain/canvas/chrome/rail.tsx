"use client";

/**
 * THE BRAIN — left rail (CRM-native chrome).
 *
 * Search lives here (primary), not floating over the graph.
 * Lucide icons · Inter section labels · collapsed legends.
 */

import { useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  Map,
  Network,
  type LucideIcon,
} from "lucide-react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { BrainSearch } from "@/components/brain/canvas/chrome/brain-search";
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
  Icon: LucideIcon;
  sub: string;
  enabled: boolean;
  disabledHint?: string;
}

const LENSES: LensDef[] = [
  {
    key: "navigation",
    label: "Navigation",
    Icon: Map,
    sub: "drill the map",
    enabled: true,
  },
  {
    key: "state",
    label: "State",
    Icon: GitBranch,
    sub: "built / wip / needed",
    enabled: true,
  },
  {
    key: "function",
    label: "Function overlay",
    Icon: Layers,
    sub: "recolor by capability",
    enabled: true,
  },
  {
    key: "topology",
    label: "Topology",
    Icon: Network,
    sub: "cross-system wiring",
    enabled: true,
  },
  {
    key: "liveness",
    label: "Liveness",
    Icon: Activity,
    sub: "v2 — telemetry",
    enabled: false,
    disabledHint: "Liveness lens — needs runtime telemetry (v2)",
  },
];

export function Rail() {
  const { view, actions } = useBrain();
  const [legendsOpen, setLegendsOpen] = useState(false);

  return (
    <aside className="brain-rail" aria-label="Brain controls">
      <BrainSearch variant="rail" />

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

      <Section title="Lenses">
        <div className="brain-rail__stack">
          {LENSES.map((l) => {
            const active = view.lens === l.key;
            const Icon = l.Icon;
            return (
              <button
                key={l.key}
                type="button"
                disabled={!l.enabled}
                aria-pressed={active}
                title={l.enabled ? l.sub : (l.disabledHint ?? l.sub)}
                onClick={() => l.enabled && actions.setLens(l.key)}
                className={`brain-rail__lens${active ? " is-active" : ""}${
                  !l.enabled ? " is-disabled" : ""
                }`}
              >
                <Icon size={16} strokeWidth={2} aria-hidden />
                <span className="brain-rail__lens-text">
                  <span className="brain-rail__lens-label">{l.label}</span>
                  <span className="brain-rail__lens-sub">{l.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Audience">
        <Segmented
          ariaLabel="Audience preset"
          options={PRESET_LIST.map((p) => ({ value: p.id, label: p.label }))}
          value={view.preset}
          onChange={(v) =>
            actions.setPreset(v as (typeof PRESET_LIST)[number]["id"])
          }
        />
        {getPreset(view.preset).badge ? (
          <p className="brain-rail__badge">{getPreset(view.preset).badge}</p>
        ) : null}
      </Section>

      <section className="brain-rail__legends">
        <button
          type="button"
          aria-expanded={legendsOpen}
          onClick={() => setLegendsOpen((o) => !o)}
          className="brain-rail__legends-toggle"
        >
          <span>Legends</span>
          {legendsOpen ? (
            <ChevronDown size={14} aria-hidden />
          ) : (
            <ChevronRight size={14} aria-hidden />
          )}
        </button>

        {legendsOpen ? (
          <>
            <Section title="Insights">
              <Insights />
            </Section>

            <Section title="Status">
              <div className="brain-rail__stack">
                {(["done", "doing", "needed"] as NodeState[]).map((s) => (
                  <LegendRow
                    key={s}
                    glyph={STATE_GLYPH[s]}
                    glyphColor={STATE_VAR[s]}
                    label={STATE_LABEL[s]}
                  />
                ))}
                <LegendRow
                  glyph="⇄"
                  glyphColor="var(--warn)"
                  label="CROSS-SYSTEM LINK"
                />
              </div>
            </Section>

            <Section title="Systems">
              <div className="brain-rail__stack">
                {(Object.keys(SYSTEM_ACCENT) as System[]).map((sys) => (
                  <div key={sys} className="brain-rail__swatch-row">
                    <span
                      aria-hidden
                      className="brain-rail__swatch"
                      style={{ background: SYSTEM_ACCENT[sys] }}
                    />
                    <span className="brain-rail__swatch-label">
                      {SYSTEM_LABEL[sys]}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Functions">
              <div className="brain-rail__stack">
                {FUNCS.map((f) => (
                  <div key={f.id} className="brain-rail__swatch-row">
                    <span
                      aria-hidden
                      className="brain-rail__swatch"
                      style={{ background: FN_COLOR[f.id] }}
                    />
                    <span className="brain-rail__swatch-label">{f.name}</span>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="brain-rail__section">
      <h3 className="brain-rail__section-title">{title}</h3>
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
    <div className="brain-rail__seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`brain-rail__seg-btn${active ? " is-active" : ""}`}
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
    <div className="brain-rail__swatch-row">
      <span
        aria-hidden
        style={{
          width: 14,
          textAlign: "center",
          color: glyphColor,
          fontFamily: "var(--mono)",
          fontSize: 11,
        }}
      >
        {glyph}
      </span>
      <span className="brain-rail__swatch-label">{label}</span>
    </div>
  );
}
