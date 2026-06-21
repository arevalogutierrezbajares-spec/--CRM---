"use client";

/**
 * THE BRAIN — system detail (FR-DETAIL-3).
 *
 * Meta line (routes/pages/migrations/stack), commit SHA, cartographer summary
 * (null in v0 → omitted), the interchange links-out count + list, and the
 * domain list with double-encoded states. Restaurants shows its host-mount note.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import { childrenOf } from "@/lib/brain/selectors";
import type { BrainNode } from "@/lib/brain/types";
import { STATE_GLYPH, STATE_LABEL } from "@/lib/brain/types";
import {
  contractUrlFor,
  healthGlyph,
  readinessPct,
  repoUrlFor,
  stateGlyph,
  stateLabel,
  systemAccent,
  systemLabel,
} from "./panel-utils";

export function SelSystem({ node }: { node: BrainNode }) {
  const { graph, actions } = useBrain();
  const accent = systemAccent(node.system);

  const domains = childrenOf(graph, node.id).filter((n) => n.level === 2);
  const pct = readinessPct(domains);

  // Interchanges touching this system (either endpoint), live first.
  const links = graph.edges
    .filter(
      (e) =>
        e.kind === "interchange" &&
        (e.from.system === node.system || e.to.system === node.system),
    )
    .slice()
    .sort((a, b) => (a.contract_status === "live" ? 0 : 1) - (b.contract_status === "live" ? 0 : 1));

  const commit = node.system ? graph.commit[node.system] : null;
  const repoUrl = repoUrlFor(node.system, null);

  return (
    <>
      <div className="d-head">
        <span className="d-kind">System</span>
        <h2 className="d-title">
          <span className="tdot" style={{ background: accent }} />
          {node.label}
        </h2>
        {node.meta ? <div className="d-route">{node.meta}</div> : null}
        <div className="d-badges">
          <span className={`badge ${node.state}`}>
            <span className="gi" aria-hidden>
              {STATE_GLYPH[node.state]}
            </span>
            {STATE_LABEL[node.state]}
          </span>
          <span className="badge">
            <span className="gi" style={{ color: accent }} aria-hidden>
              ●
            </span>
            {pct}% built
          </span>
          {node.hosted_by ? (
            <span className="badge">
              <span className="gi" aria-hidden>
                ⤿
              </span>
              hosted by {systemLabel(node.hosted_by)}
            </span>
          ) : null}
          {node.source === "manifest" ? (
            <span className="badge needed">
              <span className="gi" aria-hidden>
                ○
              </span>
              from manifest
            </span>
          ) : null}
        </div>
      </div>

      <div className="d-scroll">
        {node.summary ? (
          <section className="d-sec">
            <h5>Summary</h5>
            <p>{node.summary}</p>
          </section>
        ) : null}

        <section className="d-sec">
          <h5>Metadata</h5>
          <div className="kv">
            <span>Source</span>
            <b>{node.source}</b>
          </div>
          <div className="kv">
            <span>Domains</span>
            <b>{domains.length}</b>
          </div>
          {commit ? (
            <div className="kv">
              <span>Commit</span>
              <b>{commit}</b>
            </div>
          ) : null}
        </section>

        <section className="d-sec">
          <h5>Links out · {links.length}</h5>
          {links.length === 0 ? (
            <p>No cross-system interchanges.</p>
          ) : (
            links.map((e) => {
              const planned = e.contract_status === "planned";
              const outward = e.from.system === node.system;
              const other = outward ? e.to.system : e.from.system;
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
                      {outward ? "→" : "←"} {systemLabel(other)}
                      {planned ? "  (PLANNED)" : ""}
                    </span>
                    <span className="pp">{e.purpose ?? e.route ?? "interchange"}</span>
                  </span>
                </button>
              );
            })
          )}
        </section>

        <section className="d-sec" style={{ borderBottom: "none" }}>
          <h5>Domains · {domains.length}</h5>
          <div className="mini">
            {domains.map((d) => (
              <button
                key={d.id}
                type="button"
                className="m"
                data-state={d.state}
                onClick={() =>
                  actions.drillInto({
                    nodeId: d.id,
                    level: 2,
                    system: d.system,
                    domainId: d.id,
                  })
                }
              >
                <span className="si" aria-hidden>
                  {stateGlyph(d.state)}
                </span>
                <span className="ml">{d.label}</span>
                <span className="ct">{stateLabel(d.state)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="d-actions">
        {repoUrl ? (
          <a className="btn" href={repoUrl} target="_blank" rel="noreferrer">
            Open in repo ↗
          </a>
        ) : null}
        {node.docs_ref ? (
          <a
            className="btn"
            href={contractUrlFor(node.docs_ref) ?? "#"}
            target="_blank"
            rel="noreferrer"
          >
            Open docs ↗
          </a>
        ) : null}
        <button type="button" className="btn" onClick={() => actions.drillInto({ nodeId: node.id, level: 1, system: node.system })}>
          Drill into {node.label}
        </button>
      </div>
    </>
  );
}
