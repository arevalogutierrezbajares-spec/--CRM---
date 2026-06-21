"use client";

/**
 * THE BRAIN — surface detail (FR-DETAIL-5/6/7). The "micro" doorway-to-docs.
 *
 * Distinguishes surface kinds (FR-DETAIL-6):
 *  - route surfaces  → method + path, with an endpoint/contract code snippet,
 *  - file surfaces   → contract type + language badge.
 * Shows a Docs section (OpenAPI op / co-located MDX / the ADR that introduced
 * it where known) and the FR-DETAIL-7 actions ("Open in repo", "Open contract").
 *
 * Accepts either a real L3 surface BrainNode, or a synthetic surface derived
 * from a parent domain's `surfaces[]` string (the v0 sample has no L3 nodes).
 */

import { useBrain } from "@/components/brain/canvas/graph-provider";
import type { BrainNode, System } from "@/lib/brain/types";
import {
  contractUrlFor,
  repoUrlFor,
  shapeSurface,
  systemAccent,
  systemLabel,
} from "./panel-utils";

export interface SurfaceTarget {
  /** Raw surface string (e.g. "POST /api/quotes" or "/lib/auth"). */
  raw: string;
  system: System | null;
  /** Parent domain node (for the "in domain" context + back nav). */
  parent: BrainNode | null;
  /** docs_ref / contract_ref if known. */
  docsRef?: string | null;
}

export function SelSurface({ target }: { target: SurfaceTarget }) {
  const { actions } = useBrain();
  const accent = systemAccent(target.system);
  const s = shapeSurface(target.raw);

  const repoUrl = repoUrlFor(target.system, target.raw);
  const docsUrl = contractUrlFor(target.docsRef ?? null);

  return (
    <>
      <div className="d-head">
        <span className="d-kind">Surface · {s.isFile ? "File" : "Route"}</span>
        <h2 className="d-title">
          <span className="tdot" style={{ background: accent }} />
          {s.isFile ? lastSegment(s.path) : s.method}
        </h2>
        <div className="d-route">{s.isFile ? s.path : `${s.method} ${s.path}`}</div>
        <div className="d-badges">
          <span className="badge">
            <span className="gi" style={{ color: accent }} aria-hidden>
              ●
            </span>
            {systemLabel(target.system)}
          </span>
          {s.isFile ? (
            <span className="badge">
              <span className="gi" aria-hidden>
                ▤
              </span>
              {s.langBadge ?? "FILE"}
            </span>
          ) : (
            <span className="badge">
              <span className="gi" aria-hidden>
                ↳
              </span>
              {s.method}
            </span>
          )}
          {target.parent ? (
            <span className="badge">
              <span className="gi" aria-hidden>
                ⌂
              </span>
              {target.parent.label}
            </span>
          ) : null}
        </div>
      </div>

      <div className="d-scroll">
        {/* Endpoint / contract code snippet (FR-DETAIL-5) */}
        <section className="d-sec">
          <h5>{s.isFile ? "File" : "Endpoint"}</h5>
          <pre className="code">
            {s.isFile ? (
              <>
                <span className="c"># {s.langBadge ?? "file"} surface</span>
                {"\n"}
                <span className="k">path</span> ={" "}
                <span className="s">{`"${s.path}"`}</span>
              </>
            ) : (
              <>
                <span className="k">{s.method}</span> {s.path}
                {"\n"}
                <span className="c"># derived from the system OpenAPI map</span>
              </>
            )}
          </pre>
        </section>

        {/* Docs doorway (FR-DETAIL-5) */}
        <section className="d-sec" style={{ borderBottom: "none" }}>
          <h5>Docs</h5>
          {target.docsRef ? (
            <p>{target.docsRef}</p>
          ) : (
            <p>
              No co-located doc reference yet. The cartographer summary + ADR link
              are populated by the v2 extractor; in v0 the source file is the
              canonical reference.
            </p>
          )}
        </section>
      </div>

      {/* Actions (FR-DETAIL-7) */}
      <div className="d-actions">
        {repoUrl ? (
          <a className="btn" href={repoUrl} target="_blank" rel="noreferrer">
            Open in repo ↗
          </a>
        ) : null}
        {docsUrl ? (
          <a className="btn" href={docsUrl} target="_blank" rel="noreferrer">
            Open contract ↗
          </a>
        ) : null}
        {target.parent ? (
          <button
            type="button"
            className="btn"
            onClick={() =>
              actions.drillInto({
                nodeId: target.parent!.id,
                level: 2,
                system: target.parent!.system,
                domainId: target.parent!.id,
              })
            }
          >
            Back to {target.parent.label}
          </button>
        ) : null}
        <p className="hint">Surface = the doorway to its docs.</p>
      </div>
    </>
  );
}

function lastSegment(path: string): string {
  const clean = path.replace(/\(.*?\)/g, "").replace(/\/$/, "");
  const parts = clean.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
