"use client";

/**
 * THE BRAIN — interchange (station) detail (FR-XSYS-5/6/7/8/11).
 *
 *  - producer → consumer flow, both endpoints labeled + navigable (FR-XSYS-5),
 *  - contract_ref path + version + key facts (route/auth) + a contract code
 *    snippet (FR-XSYS-6),
 *  - health double-encoded: glyph ✓/!/· + text label + color; dark dashed
 *    (FR-XSYS-8),
 *  - "what breaks" list (FR-XSYS-7); planned/dark edges render as PLANNED
 *    fog-of-war (not warn/red) and state the build blocker (FR-XSYS-11).
 *  - live platforms health + deep-links into control-plane pages.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { nodeById } from "@/lib/brain/selectors";
import type { BrainEdge, System } from "@/lib/brain/types";
import {
  contractUrlFor,
  healthGlyph,
  healthLabel,
  systemAccent,
  systemLabel,
} from "./panel-utils";

type LiveHealth = {
  status: string;
  detail: string;
  path?: string;
};

export function SelStation({ edge }: { edge: BrainEdge }) {
  const { graph, actions } = useBrain();
  const planned = edge.contract_status === "planned";
  const [live, setLive] = useState<LiveHealth | null>(null);

  useEffect(() => {
    if (planned) return;
    let cancelled = false;
    fetch("/api/brain/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body?.stations?.[edge.id]) return;
        setLive(body.stations[edge.id] as LiveHealth);
      })
      .catch(() => {
        /* offline / unauth — leave structural health only */
      });
    return () => {
      cancelled = true;
    };
  }, [edge.id, planned]);

  const fromNode = nodeById(graph, `${edge.from.system}.${edge.from.domain}`);
  const toNode = nodeById(graph, `${edge.to.system}.${edge.to.domain}`);

  // Health badge class: planned → "dark" treatment + PLANNED label.
  const healthClass = planned ? "dark" : edge.health ?? "warn";
  const glyph = planned ? "·" : healthGlyph(edge.health);
  const label = planned ? "PLANNED" : healthLabel(edge.health);

  const contractUrl = contractUrlFor(edge.contract_ref);
  const breaks = edge.breaks ?? [];

  function drillToEndpoint(system: System, domainId: string) {
    actions.drillInto({ nodeId: system, level: 1, system });
    // Then select the domain endpoint so the panel follows the trace.
    actions.select(domainId);
  }

  return (
    <>
      <div className="d-head">
        <span className="d-kind">Interchange · {edge.subtype === "host_mount" ? "Host mount" : "Cross-system"}</span>
        <h2 className="d-title">
          <span className="tdot" style={{ background: systemAccent(edge.from.system) }} />
          {systemLabel(edge.from.system)} → {systemLabel(edge.to.system)}
        </h2>
        {edge.route ? <div className="d-route">{edge.route}</div> : null}
        <div className="d-badges">
          <span className={`badge ${healthClass}`}>
            <span className="gi" aria-hidden>
              {glyph}
            </span>
            {label}
          </span>
          {edge.version ? (
            <span className="badge">
              <span className="gi" aria-hidden>
                #
              </span>
              v{edge.version}
            </span>
          ) : null}
          {edge.subtype === "host_mount" ? (
            <span className="badge">
              <span className="gi" aria-hidden>
                ⤿
              </span>
              host mount
            </span>
          ) : null}
          {live ? (
            <span
              className={`badge ${live.status === "ok" ? "ok" : live.status === "down" ? "dark" : "warn"}`}
              title={live.detail}
            >
              <span className="gi" aria-hidden>
                📡
              </span>
              live {live.status}
            </span>
          ) : null}
        </div>
      </div>

      <div className="d-scroll">
        {/* Producer → Consumer flow, both navigable (FR-XSYS-5) */}
        <section className="d-sec">
          <h5>Flow</h5>
          <button
            type="button"
            className="xrow"
            data-health={healthClass}
            onClick={() => drillToEndpoint(edge.from.system, `${edge.from.system}.${edge.from.domain}`)}
          >
            <span className="g" aria-hidden>
              ▲
            </span>
            <span className="xbody">
              <span className="to">Producer · {systemLabel(edge.from.system)}</span>
              <span className="pp">{fromNode?.label ?? edge.from.domain}</span>
            </span>
          </button>
          <button
            type="button"
            className="xrow"
            data-health={healthClass}
            onClick={() => drillToEndpoint(edge.to.system, `${edge.to.system}.${edge.to.domain}`)}
          >
            <span className="g" aria-hidden>
              ▼
            </span>
            <span className="xbody">
              <span className="to">Consumer · {systemLabel(edge.to.system)}</span>
              <span className="pp">{toNode?.label ?? edge.to.domain}</span>
            </span>
          </button>
        </section>

        {/* Key facts (FR-XSYS-6) */}
        <section className="d-sec">
          <h5>Contract</h5>
          {edge.purpose ? <p>{edge.purpose}</p> : null}
          <div style={{ height: 8 }} />
          <div className="kv">
            <span>Status</span>
            <b>{edge.contract_status}</b>
          </div>
          {edge.route ? (
            <div className="kv">
              <span>Route</span>
              <b>{edge.route}</b>
            </div>
          ) : null}
          {edge.version ? (
            <div className="kv">
              <span>Version</span>
              <b>{edge.version}</b>
            </div>
          ) : null}
          {edge.contract_ref ? (
            <div className="kv">
              <span>Contract ref</span>
              <b>{edge.contract_ref}</b>
            </div>
          ) : null}
          <div className="kv">
            <span>Hash</span>
            <b>{edge.contract_hash ?? "— (v1)"}</b>
          </div>
        </section>

        {/* Contract code snippet (FR-XSYS-6) */}
        {edge.route ? (
          <section className="d-sec">
            <h5>Signature</h5>
            <pre className="code">
              <span className="k">{producerVerb(edge.route)}</span>{" "}
              {edge.route.replace(/^\w+\s+/, "")}
              {"\n"}
              <span className="c"># {systemLabel(edge.from.system)} → {systemLabel(edge.to.system)}</span>
              {edge.contract_ref ? (
                <>
                  {"\n"}
                  <span className="c"># {edge.contract_ref}</span>
                </>
              ) : null}
            </pre>
          </section>
        ) : null}

        {/* What breaks (FR-XSYS-7) */}
        <section className="d-sec" style={{ borderBottom: "none" }}>
          <h5>Impact</h5>
          <div className="breaks">
            <p className="bt">⚠ what breaks if this changes</p>
            {planned ? (
              <ul>
                <li>
                  Build blocker — this interchange is <code>PLANNED</code>. The
                  consumer ({systemLabel(edge.to.system)}) cannot integrate until
                  the producer ships the contract.
                </li>
              </ul>
            ) : breaks.length > 0 ? (
              <ul>
                {breaks.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            ) : (
              <ul>
                <li>
                  Removing this contract breaks{" "}
                  <code>{systemLabel(edge.to.system)}</code>&apos;s consumption of{" "}
                  <code>{systemLabel(edge.from.system)}</code>. No typed-field
                  diff is computed in v0 ({"contract_hash"} null).
                </li>
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Actions (FR-XSYS-9 trace + FR-DETAIL-7 open contract + control-plane) */}
      <div className="d-actions">
        {contractUrl ? (
          <a className="btn" href={contractUrl} target="_blank" rel="noreferrer">
            Open contract ↗
          </a>
        ) : null}
        <Link className="btn" href="/platforms">
          Platforms health
        </Link>
        {live?.path && live.path.startsWith("/") ? (
          <Link className="btn" href={live.path}>
            Open fix path
          </Link>
        ) : null}
        <Link className="btn" href="/overlord">
          Overlord
        </Link>
        <button
          type="button"
          className="btn"
          onClick={() => drillToEndpoint(edge.from.system, `${edge.from.system}.${edge.from.domain}`)}
        >
          Trace producer → consumer
        </button>
      </div>
    </>
  );
}

/** First token of a route string ("POST /…") for the code snippet. */
function producerVerb(route: string): string {
  const m = route.match(/^(\w+)/);
  return (m?.[1] ?? "CALL").toUpperCase();
}
