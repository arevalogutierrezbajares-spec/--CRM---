"use client";

/**
 * THE BRAIN — portfolio detail (FR-DETAIL-2).
 *
 * Shown when nothing is selected at L0 (the portfolio overview). Surfaces:
 *  - aggregate portfolio % built + per-system % (system axis readiness),
 *  - the 7-function readiness map (FR-AXIS-4 / By-Function),
 *  - the full list of cross-system interchanges with double-encoded health +
 *    purpose (FR-DETAIL-2 / FR-XSYS-8). Clicking a system or interchange routes
 *    the canvas selection through the provider.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import { FN_COLOR, FN_LABEL } from "@/lib/brain/functions";
import type { BrainNode, Fn } from "@/lib/brain/types";
import { healthGlyph, readinessPct, systemAccent, systemLabel } from "./panel-utils";

export function SelPortfolio() {
  const { graph, actions } = useBrain();

  const systems = graph.nodes.filter((n) => n.level === 1);
  const domains = graph.nodes.filter((n) => n.level === 2);
  const aggregate = readinessPct(domains);

  // LIVE interchanges first (rendered as stations); planned listed after.
  const interchanges = graph.edges
    .filter((e) => e.kind === "interchange")
    .slice()
    .sort((a, b) => {
      const order = (s: string) => (s === "live" ? 0 : 1);
      return order(a.contract_status) - order(b.contract_status);
    });

  return (
    <>
      <div className="d-head">
        <span className="d-kind">Portfolio</span>
        <h2 className="d-title">
          <span className="tdot" style={{ background: "var(--ink-dim)" }} />
          The Brain
        </h2>
        <div className="d-route">
          {systems.length} systems · {graph.functions.length} functions ·{" "}
          {interchanges.length} interchanges
        </div>
      </div>

      <div className="d-scroll">
        {/* Aggregate + per-system readiness */}
        <section className="d-sec">
          <h5>Readiness</h5>
          <div className="kv">
            <span>Portfolio built</span>
            <b>{aggregate}%</b>
          </div>
          <div style={{ height: 6 }} />
          {systems.map((s) => {
            const sysDomains = domains.filter((d) => d.system === s.system);
            const pct = readinessPct(sysDomains);
            return (
              <button
                key={s.id}
                type="button"
                className="sysrow"
                style={
                  {
                    "--accent": systemAccent(s.system),
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    width: "100%",
                  } as React.CSSProperties
                }
                onClick={() =>
                  actions.drillInto({
                    nodeId: s.id,
                    level: 1,
                    system: s.system,
                  })
                }
              >
                <span className="swatch" style={{ background: systemAccent(s.system) }} />
                <span className="fname">{s.label}</span>
                <span className="fbar">
                  <span style={{ width: `${pct}%`, background: systemAccent(s.system) }} />
                </span>
                <span className="fpct">{pct}%</span>
              </button>
            );
          })}
        </section>

        {/* 7-function readiness map (FR-AXIS-4) */}
        <section className="d-sec">
          <h5>Function readiness</h5>
          {graph.functions.map((fn) => {
            const color = FN_COLOR[fn.id as Fn] ?? "var(--ink-dim)";
            return (
              <div key={fn.id} className="fnrow" style={{ "--fc": color } as React.CSSProperties}>
                <span className="fdot" />
                <span className="fname">{FN_LABEL[fn.id as Fn] ?? fn.name}</span>
                <span className="fbar">
                  <span style={{ width: `${fn.pct}%` }} />
                </span>
                <span className="fpct">{fn.pct}%</span>
              </div>
            );
          })}
        </section>

        {/* All interchanges (FR-DETAIL-2 / FR-XSYS-8) */}
        <section className="d-sec" style={{ borderBottom: "none" }}>
          <h5>Interchanges · {interchanges.length}</h5>
          {interchanges.map((e) => {
            const planned = e.contract_status === "planned";
            const fromNode = endpointNode(graph.nodes, e.from.system, e.from.domain);
            const toNode = endpointNode(graph.nodes, e.to.system, e.to.domain);
            return (
              <button
                key={e.id}
                type="button"
                className="xrow"
                data-health={e.health ?? "warn"}
                onClick={() => actions.select(e.id)}
              >
                <span className="g" aria-hidden>
                  {planned ? "·" : healthGlyph(e.health)}
                </span>
                <span className="xbody">
                  <span className="to">
                    {systemLabel(e.from.system)} → {systemLabel(e.to.system)}
                    {planned ? "  (PLANNED)" : ""}
                  </span>
                  <span className="pp">
                    {e.purpose ??
                      `${fromNode?.label ?? e.from.domain} ↔ ${toNode?.label ?? e.to.domain}`}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      </div>
    </>
  );
}

function endpointNode(
  nodes: BrainNode[],
  system: string,
  domain: string,
): BrainNode | undefined {
  return nodes.find((n) => n.system === system && n.id === `${system}.${domain}`);
}
