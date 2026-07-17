/**
 * Emit factories for documentation nodes/edges (Phase 1).
 * Kept separate from emit.mjs to avoid coupling FN_MAP domain rules to docs.
 */

/**
 * @param {object} rec parseDocMarkdown record
 */
export function baseNodeLikeDoc(rec) {
  return {
    id: rec.id,
    level: 3,
    kind: rec.kind === "adr" ? "adr" : "doc",
    parentId: null,
    label: rec.label,
    system: rec.system ?? "crm",
    source: "docs",
    hosted_by: null,
    fn: null,
    state: "done",
    liveness: null,
    size: "sm",
    owner: null,
    branch: null,
    last_commit: null,
    docs_ref: rec.path,
    surfaces: [],
    meta: rec.doc_type ?? "doc",
    summary: rec.summary ?? null,
    pos: { x: 0, y: 0 },
  };
}

/**
 * Edge: documentation documents an architecture node.
 * Endpoints store full node ids in `domain` (same convention as contains).
 */
export function documentsEdge(o) {
  const targetSystem = o.targetSystem ?? o.system ?? "crm";
  return {
    id: `documents.${o.docId}.${o.targetId}`.slice(0, 180),
    kind: "documents",
    subtype: null,
    from: { system: o.system ?? "crm", domain: o.docId },
    to: { system: targetSystem, domain: o.targetId },
    contract_status: "live",
    purpose: "documents",
  };
}
