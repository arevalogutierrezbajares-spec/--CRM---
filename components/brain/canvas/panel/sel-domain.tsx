"use client";

/**
 * THE BRAIN — domain detail (FR-DETAIL-4).
 *
 * State badge (double-encoded), function assignment, owner/branch, docs_ref,
 * cross-system links touching the domain, and the surfaces list (each a doorway
 * to its surface detail). `needed` domains with no surfaces show the
 * fog-of-war "no surfaces yet" message. Roadmap-cluster pseudo-nodes list the
 * collapsed members instead.
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import { childrenOf, isClusterNode, nodeById } from "@/lib/brain/selectors";
import { FN_COLOR, FN_LABEL } from "@/lib/brain/functions";
import type { BrainNode, Fn } from "@/lib/brain/types";
import { STATE_GLYPH, STATE_LABEL } from "@/lib/brain/types";
import {
  contractUrlFor,
  healthGlyph,
  repoUrlFor,
  shapeSurface,
  stateGlyph,
  stateLabel,
  systemAccent,
  systemLabel,
} from "./panel-utils";

export function SelDomain({ node }: { node: BrainNode }) {
  const { graph, actions } = useBrain();
  const accent = systemAccent(node.system);
  const cluster = isClusterNode(node);
  const clusterKind = cluster && isClusterNode(node) ? node.clusterKind ?? "roadmap" : null;

  // Cross-system interchanges whose endpoint matches this domain id
  // (full dotted id — artifact stores domain as full node id).
  const links = graph.edges.filter(
    (e) =>
      e.kind === "interchange" &&
      (e.from.domain === node.id || e.to.domain === node.id),
  );

  // Real surface/entity (L3) children, if extracted; else fall back to node.surfaces.
  const surfaceNodes = childrenOf(graph, node.id).filter((n) => n.level === 3);
  const surfaceStrings = node.surfaces ?? [];
  const fog =
    !cluster &&
    surfaceNodes.length === 0 &&
    surfaceStrings.length === 0;

  const fn = node.fn as Fn | null;
  const repoUrl = repoUrlFor(node.system, surfaceStrings[0] ?? null);

  return (
    <>
      <div className="d-head">
        <span className="d-kind">
          {clusterKind === "overflow"
            ? "Overflow cluster"
            : clusterKind === "portal"
              ? "Portal"
              : cluster
                ? "Roadmap cluster"
                : "Domain"}
        </span>
        <h2 className="d-title">
          <span className="tdot" style={{ background: accent }} />
          {node.label}
        </h2>
        <div className="d-route">{systemLabel(node.system)}</div>
        <div className="d-badges">
          <span className={`badge ${node.state}`}>
            <span className="gi" aria-hidden>
              {STATE_GLYPH[node.state]}
            </span>
            {STATE_LABEL[node.state]}
          </span>
          {fn ? (
            <span className="badge" style={{ borderColor: FN_COLOR[fn] }}>
              <span className="gi" style={{ color: FN_COLOR[fn] }} aria-hidden>
                ◆
              </span>
              {FN_LABEL[fn]}
            </span>
          ) : null}
          {links.length > 0 ? (
            <span className="badge warn">
              <span className="gi" aria-hidden>
                ⇄
              </span>
              {links.length} cross-link{links.length > 1 ? "s" : ""}
            </span>
          ) : null}
        </div>
      </div>

      <div className="d-scroll">
        {/* Empty domain (no L3 yet) */}
        {fog ? (
          <section className="d-sec">
            <h5>Surfaces</h5>
            <p className="d-route" style={{ opacity: 0.7 }}>
              No route/entity surfaces under this domain yet — fog of war. Search
              the Brain or expand inventory after the next regen.
            </p>
          </section>
        ) : null}

        {/* Cluster: list collapsed members */}
        {cluster && isClusterNode(node) ? (
          <section className="d-sec" style={{ borderBottom: "none" }}>
            <h5>
              {clusterKind === "overflow"
                ? `Hidden · ${node.clusterMembers.length} more`
                : `Roadmap · ${node.clusterMembers.length} needed`}
            </h5>
            <div className="mini">
              {node.clusterMembers.map((id) => {
                const m = nodeById(graph, id);
                if (!m) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="m"
                    data-state={m.state}
                    onClick={() =>
                      actions.drillInto({
                        nodeId: m.id,
                        level: 2,
                        system: m.system,
                        domainId: m.id,
                      })
                    }
                  >
                    <span className="si" aria-hidden>
                      {stateGlyph(m.state)}
                    </span>
                    <span className="ml">{m.label}</span>
                    <span className="ct">{stateLabel(m.state)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {(node.owner || node.branch) ? (
              <section className="d-sec">
                <h5>Ownership</h5>
                {node.owner ? (
                  <div className="kv">
                    <span>Owner</span>
                    <b>{node.owner}</b>
                  </div>
                ) : null}
                {node.branch ? (
                  <div className="kv">
                    <span>Branch</span>
                    <b>{node.branch}</b>
                  </div>
                ) : null}
              </section>
            ) : null}

            {links.length > 0 ? (
              <section className="d-sec">
                <h5>Cross-system links · {links.length}</h5>
                {links.map((e) => {
                  const planned = e.contract_status === "planned";
                  const outward = e.from.domain === node.id;
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
                })}
              </section>
            ) : null}

            <section className="d-sec" style={{ borderBottom: "none" }}>
              <h5>
                Surfaces · {surfaceNodes.length || surfaceStrings.length}
              </h5>
              {fog ? (
                <p>
                  Fog of war — no surfaces yet. This domain is planned; nothing has
                  been built to map.
                </p>
              ) : surfaceNodes.length > 0 ? (
                <div className="mini">
                  {surfaceNodes.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="m"
                      data-state={s.state}
                      onClick={() =>
                        actions.drillInto({
                          nodeId: s.id,
                          level: 3,
                          system: s.system,
                          domainId: node.id,
                        })
                      }
                    >
                      <span className="si" aria-hidden>
                        {stateGlyph(s.state)}
                      </span>
                      <span className="ml">{s.label}</span>
                      <SurfaceBadge raw={s.label} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mini">
                  {surfaceStrings.map((raw, i) => (
                    <button
                      key={`${raw}-${i}`}
                      type="button"
                      className="m"
                      data-state={node.state}
                      onClick={() => actions.select(`${node.id}::surface::${i}`)}
                    >
                      <span className="si" aria-hidden>
                        {stateGlyph(node.state)}
                      </span>
                      <span className="ml">{raw}</span>
                      <SurfaceBadge raw={raw} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {!cluster ? (
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
        </div>
      ) : null}
    </>
  );
}

function SurfaceBadge({ raw }: { raw: string }) {
  const s = shapeSurface(raw);
  return (
    <span className="ct">{s.isFile ? s.langBadge ?? "FILE" : s.method}</span>
  );
}
