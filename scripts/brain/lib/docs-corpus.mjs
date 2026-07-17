/**
 * THE BRAIN — pure docs-corpus helpers (Phase 1).
 *
 * Deterministic parse/join rules for markdown → doc records.
 * No filesystem, no network, no LLM — unit-testable on fixtures.
 *
 * Frontmatter contract (optional):
 *   id, brain_node, type, system, summary, title
 * Without frontmatter: title from first H1 or filename; type inferred from path.
 */

/**
 * @param {string} raw
 * @returns {string|null}
 */
export function frontMatterBlock(raw) {
  const m = raw.match(/^﻿?\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? m[1] : null;
}

/**
 * Minimal front-matter reader (scalar + folded/literal blocks).
 * @param {string} block
 * @returns {Record<string, string>}
 */
export function parseFrontMatter(block) {
  const out = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_]+):(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let rest = kv[2].trim();

    if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-") {
      const folded = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j];
        if (next.trim() === "") {
          folded.push("");
          continue;
        }
        if (/^\s+/.test(next)) {
          folded.push(next.trim());
        } else {
          break;
        }
      }
      i = j - 1;
      const joiner = rest.startsWith("|") ? "\n" : " ";
      out[key] = folded.join(joiner).replace(/\s+\n/g, "\n").trim();
    } else {
      out[key] = rest.replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

/**
 * Body after frontmatter (or full text if none).
 * @param {string} raw
 */
export function bodyAfterFrontMatter(raw) {
  const m = raw.match(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return (m ? m[1] : raw).trim();
}

/**
 * @param {string} relPath posix-ish relative path
 */
export function slugFromPath(relPath) {
  return relPath
    .replace(/\\/g, "/")
    .replace(/^docs\//, "")
    .replace(/\.mdx?$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

/**
 * @param {string} relPath
 * @param {Record<string,string>} fm
 * @returns {"howto"|"explanation"|"reference"|"adr"|"failure-mode"|"doc"}
 */
export function inferDocType(relPath, fm = {}) {
  const t = (fm.type || "").toLowerCase();
  if (
    t === "howto" ||
    t === "explanation" ||
    t === "reference" ||
    t === "adr" ||
    t === "failure-mode"
  ) {
    return t;
  }
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  if (p.includes("/adr/") || /(^|\/)adr[-_]/.test(p)) return "adr";
  if (p.includes("runbook") || p.includes("howto") || p.includes("protocol"))
    return "howto";
  if (p.includes("requirements") || p.includes("/hlr") || p.includes("fr-"))
    return "reference";
  if (p.includes("failure") || p.includes("postmortem") || p.includes("rca"))
    return "failure-mode";
  return "doc";
}

/**
 * @param {string} body
 * @param {string} relPath
 * @param {Record<string,string>} fm
 */
export function inferTitle(body, relPath, fm = {}) {
  if (fm.title?.trim()) return fm.title.trim();
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim().replace(/\s+/g, " ").slice(0, 120);
  const base = relPath.replace(/\\/g, "/").split("/").pop() ?? relPath;
  return base
    .replace(/\.mdx?$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * First meaningful paragraph as summary.
 * @param {string} body
 * @param {Record<string,string>} fm
 */
export function inferSummary(body, fm = {}) {
  if (fm.summary?.trim()) return fm.summary.trim().slice(0, 400);
  const lines = body.split(/\r?\n/);
  const paras = [];
  let buf = [];
  for (const line of lines) {
    if (line.startsWith("#")) {
      if (buf.length) break;
      continue;
    }
    if (line.trim() === "") {
      if (buf.length) {
        paras.push(buf.join(" ").trim());
        buf = [];
        if (paras.length) break;
      }
      continue;
    }
    if (/^[-*|`]/.test(line.trim()) && !buf.length) continue;
    buf.push(line.trim());
  }
  if (buf.length) paras.push(buf.join(" ").trim());
  const s = paras[0] ?? "";
  return s.replace(/\s+/g, " ").slice(0, 400) || null;
}

/**
 * Resolve brain_node join against known architecture node ids.
 * @param {string|null|undefined} candidate
 * @param {Set<string>|string[]} existingNodeIds
 * @returns {string|null}
 */
export function resolveBrainNodeJoin(candidate, existingNodeIds) {
  if (!candidate || !String(candidate).trim()) return null;
  const id = String(candidate).trim();
  const set =
    existingNodeIds instanceof Set
      ? existingNodeIds
      : new Set(existingNodeIds ?? []);
  if (set.has(id)) return id;
  // Allow system-only joins
  if (set.has(id.split(".")[0]) && !id.includes(".")) return id;
  return set.has(id) ? id : null;
}

/**
 * Heuristic join when frontmatter lacks brain_node: match path tokens to node ids.
 * @param {string} relPath
 * @param {string} body
 * @param {Set<string>|string[]} existingNodeIds
 */
export function inferBrainNode(relPath, body, existingNodeIds) {
  const set =
    existingNodeIds instanceof Set
      ? existingNodeIds
      : new Set(existingNodeIds ?? []);
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  const slug = slugFromPath(relPath);

  // Explicit mentions in body: `brain_node: foo` already handled; also `crm.x`
  const mentioned = body.match(
    /\b((?:vav|caney|crm|restaurants|academy)(?:\.[a-z0-9-]+)+)\b/gi,
  );
  if (mentioned) {
    for (const m of mentioned) {
      if (set.has(m)) return m;
    }
  }

  // Path contains domain slug after crm/vav/caney
  for (const id of set) {
    if (id.split(".").length < 2) continue;
    const tail = id.slice(id.indexOf(".") + 1);
    if (tail.length >= 4 && (p.includes(tail) || slug.includes(tail))) {
      return id;
    }
  }

  // System-level docs
  if (p.includes("brain") && set.has("crm")) return "crm";
  if (p.includes("email") && set.has("crm")) {
    for (const id of ["crm.email", "crm.inbox"]) {
      if (set.has(id)) return id;
    }
  }
  if (p.includes("posada") && set.has("crm")) {
    for (const id of set) {
      if (id.includes("posada") || id.includes("partner")) return id;
    }
  }

  return null;
}

/**
 * Build one doc record from a relative path + raw markdown.
 * @param {object} o
 * @param {string} o.relPath  e.g. "docs/brain-ops.md"
 * @param {string} o.raw
 * @param {string} [o.repo]   "crm" | "caney" | ...
 * @param {Set<string>|string[]} [o.existingNodeIds]
 */
/**
 * Rank for architecture join preference (higher wins).
 * Failure-modes must never paint domain truth.
 */
export function docTypeJoinRank(docType) {
  switch (docType) {
    case "howto":
      return 50;
    case "explanation":
      return 40;
    case "reference":
      return 35;
    case "adr":
      return 30;
    case "doc":
      return 20;
    case "failure-mode":
      return 0; // never apply as architecture docs_ref/summary
    default:
      return 10;
  }
}

/**
 * Fold symptoms (and similar) frontmatter into a search-facing summary.
 * FR-BA-102: symptom tokens must be findable via searchBrain haystack.
 */
export function foldSymptomsIntoSummary(summary, fm = {}) {
  const symptoms = String(fm.symptoms ?? fm.symptom ?? "").trim();
  if (!symptoms) return summary ?? null;
  const base = (summary ?? "").trim();
  if (!base) return symptoms.slice(0, 500);
  if (base.toLowerCase().includes(symptoms.toLowerCase())) return base;
  return `${base} Symptoms: ${symptoms}`.slice(0, 600);
}

export function parseDocMarkdown(o) {
  const relPath = o.relPath.replace(/\\/g, "/");
  const repo = o.repo ?? "crm";
  const raw = o.raw ?? "";
  const block = frontMatterBlock(raw);
  const fm = block ? parseFrontMatter(block) : {};
  const body = bodyAfterFrontMatter(raw);
  const type = inferDocType(relPath, fm);
  const title = inferTitle(body, relPath, fm);
  const baseSummary = inferSummary(body, fm);
  const summary = foldSymptomsIntoSummary(baseSummary, fm);
  const symptoms = String(fm.symptoms ?? fm.symptom ?? "").trim() || null;
  const slug = slugFromPath(relPath);
  const id =
    (fm.id && fm.id.trim()) ||
    `${repo}.doc.${slug}`.replace(/[^a-z0-9._-]+/gi, "-");

  // Integrity: if system is set, id must be namespaced — we use system null for docs
  // OR system crm with id starting with crm.
  // Prefer crm.doc.* ids with system "crm".
  const system =
    fm.system &&
    ["vav", "caney", "crm", "restaurants", "academy"].includes(fm.system)
      ? fm.system
      : repo === "crm"
        ? "crm"
        : repo === "caney"
          ? "caney"
          : repo === "vav"
            ? "vav"
            : "crm";

  const nodeId = id.startsWith(`${system}.`)
    ? id
    : `${system}.doc.${slug}`.slice(0, 120);

  let brainNode =
    resolveBrainNodeJoin(fm.brain_node, o.existingNodeIds ?? []) ??
    inferBrainNode(relPath, body, o.existingNodeIds ?? []);

  return {
    id: nodeId,
    kind: type === "adr" ? "adr" : "doc",
    label: title,
    summary,
    symptoms,
    path: relPath,
    system,
    brain_node: brainNode,
    doc_type: type,
    source: "docs",
  };
}

/**
 * @param {{ relPath: string, raw: string }[]} files
 * @param {{ repo?: string, existingNodeIds?: Set<string>|string[] }} [opts]
 */
export function docRecordsFromFiles(files, opts = {}) {
  const out = [];
  const seen = new Set();
  for (const f of files ?? []) {
    if (!f?.relPath || f.raw == null) continue;
    if (!/\.mdx?$/i.test(f.relPath)) continue;
    // Skip generated index noise if any
    if (f.relPath.replace(/\\/g, "/").endsWith("llms.txt")) continue;
    const rec = parseDocMarkdown({
      relPath: f.relPath,
      raw: f.raw,
      repo: opts.repo ?? "crm",
      existingNodeIds: opts.existingNodeIds,
    });
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  // Stable order by id
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}
