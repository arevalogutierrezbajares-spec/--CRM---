/**
 * THE BRAIN — CRM (+ optional sibling) markdown docs corpus extractor (Phase 1).
 *
 * Walks REPO_ROOTS.crm/docs for markdown files, parses frontmatter, emits
 * doc/adr nodes and documents edges when brain_node joins match.
 * Keeps cartographer join via extractDocsRef() for sibling caney docs/brain.
 *
 * Missing docs root → empty result (never throws).
 */

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import { docRecordsFromFiles, docTypeJoinRank } from "../lib/docs-corpus.mjs";
import { baseNodeLikeDoc, documentsEdge } from "../lib/docs-emit.mjs";

/**
 * Recursively list markdown files under dir.
 * @param {string} absDir
 * @param {string} baseAbs
 * @returns {{ relPath: string, raw: string }[]}
 */
function walkMarkdown(absDir, baseAbs) {
  /** @type {{ relPath: string, raw: string }[]} */
  const out = [];
  if (!existsSync(absDir)) return out;

  /** @param {string} dir */
  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.name === "node_modules" || ent.name === ".git") continue;
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      if (!/\.mdx?$/i.test(ent.name)) continue;
      // Skip enormous dumps
      try {
        const st = statSync(full);
        if (st.size > 400_000) continue;
      } catch {
        continue;
      }
      let raw;
      try {
        raw = readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const rel = relative(baseAbs, full).replace(/\\/g, "/");
      out.push({ relPath: rel.startsWith("docs/") ? rel : `docs/${rel}`, raw });
    }
  }
  walk(absDir);
  return out;
}

/**
 * @param {object} [opts]
 * @param {Iterable<string>|Set<string>} [opts.existingNodeIds]
 * @returns {{
 *   nodes: object[],
 *   edges: object[],
 *   joins: Record<string, { summary: string|null, docs_ref: string, doc_type: string, rank: number }>,
 *   stats: { scanned: number, docs: number, joins: number }
 * }}
 */
export function extractDocsCorpus(opts = {}) {
  const crmRoot = REPO_ROOTS.crm;
  const docsRoot = join(crmRoot, "docs");
  const files = walkMarkdown(docsRoot, crmRoot);
  const existing = opts.existingNodeIds
    ? opts.existingNodeIds instanceof Set
      ? opts.existingNodeIds
      : new Set(opts.existingNodeIds)
    : new Set();

  const records = docRecordsFromFiles(files, {
    repo: "crm",
    existingNodeIds: existing,
  });

  /** @type {object[]} */
  const nodes = [];
  /** @type {object[]} */
  const edges = [];
  /** @type {Record<string, { summary: string|null, docs_ref: string, doc_type: string, rank: number }>} */
  const joins = {};

  for (const rec of records) {
    nodes.push(baseNodeLikeDoc(rec));
    if (rec.brain_node && existing.has(rec.brain_node)) {
      edges.push(
        documentsEdge({
          docId: rec.id,
          targetId: rec.brain_node,
          system: rec.system,
          targetSystem: rec.brain_node.split(".")[0],
        }),
      );
      // Architecture paint: never use failure-mode prose as domain summary/docs_ref.
      // Rank howto/explanation/reference above generic docs; FM rank is 0 → skip.
      const rank = docTypeJoinRank(rec.doc_type);
      if (rank <= 0) continue;
      const prev = joins[rec.brain_node];
      if (!prev || rank > prev.rank) {
        joins[rec.brain_node] = {
          summary: rec.summary,
          docs_ref: rec.path,
          doc_type: rec.doc_type,
          rank,
        };
      }
    }
  }

  return {
    nodes,
    edges,
    joins,
    stats: {
      scanned: files.length,
      docs: nodes.length,
      joins: edges.length,
    },
  };
}
