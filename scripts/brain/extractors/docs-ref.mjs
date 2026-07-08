/**
 * THE BRAIN — docs-ref extractor (Workstream B4, docs→node join).
 *
 * Scans the CaneyCloud repo's `docs/brain/*.md` cartographer docs and joins
 * them onto already-emitted Brain nodes by the doc's front-matter `brain_node:`
 * key. For each match it supplies two fields the v0 pipeline left null:
 *   - `summary`  ← the front-matter `summary:` (plain-English node summary, v2)
 *   - `docs_ref` ← the repo-relative doc path (an `mdx`-kind docs_ref)
 *
 * Deterministic + read-only (NFR-SEC-3). Missing docs dir → zero overrides
 * (a stale caney clone with no docs/brain simply yields nothing, never throws).
 *
 * ⚠️ DRIFT TRAP: `REPO_ROOTS.caney` defaults to /Users/tomas/tour-pms-main,
 * which does NOT contain docs/brain. Run the regen with
 * `BRAIN_ROOT_CANEY=/Users/tomas/--TOURISM--` (the clone that has both the
 * OTA/VAV storefront work AND these docs) or this extractor no-ops silently.
 * See --TOURISM--/docs/brain/_INVENTORY.md for the full rationale.
 *
 * Like state-overlay.mjs, this returns a map the orchestrator applies to
 * already-merged nodes in place (docs are joined onto nodes other extractors
 * emit; there is no node to add here).
 *
 * @returns {{ docRefs: Record<string, { summary: string|null, docs_ref: string }>,
 *             stats: { scanned: number, matched: number } }}
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";

/** The docs directory holding per-domain cartographer docs, relative to caney root. */
const DOCS_SUBDIR = join("docs", "brain");

/**
 * Extract the YAML front-matter block (between the first pair of `---` fences)
 * as raw text, or null when the file has no front-matter.
 * @param {string} raw
 * @returns {string|null}
 */
function frontMatterBlock(raw) {
  // Must start at byte 0 (allow a leading BOM/newline) with a `---` fence.
  const m = raw.match(/^﻿?\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return m ? m[1] : null;
}

/**
 * Minimal front-matter reader for the two shapes these docs use:
 *   key: scalar value            → returns the trimmed scalar
 *   key: >-                      → folded block; joins the following
 *     more indented lines...       more-indented lines into one space-joined
 *                                   string (YAML `>-` chomps the trailing NL).
 * Deliberately tiny — no external YAML dep, no nested structures. Unknown keys
 * are ignored. Quotes around scalars are stripped.
 * @param {string} block
 * @returns {Record<string,string>}
 */
function parseFrontMatter(block) {
  const out = {};
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Top-level `key:` only (no leading indentation → not a continuation line).
    const kv = line.match(/^([A-Za-z0-9_]+):(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let rest = kv[2].trim();

    if (rest === ">-" || rest === ">" || rest === "|" || rest === "|-") {
      // Folded/literal block scalar: consume following more-indented lines.
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
          break; // dedent → block ends
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

export function extractDocsRef() {
  /** @type {Record<string, { summary: string|null, docs_ref: string }>} */
  const docRefs = {};
  const stats = { scanned: 0, matched: 0 };

  const caneyRoot = REPO_ROOTS.caney;
  const docsDir = join(caneyRoot, DOCS_SUBDIR);
  if (!existsSync(docsDir)) return { docRefs, stats };

  let files;
  try {
    files = readdirSync(docsDir).filter((f) => f.endsWith(".md"));
  } catch {
    return { docRefs, stats };
  }

  for (const file of files) {
    const path = join(docsDir, file);
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const block = frontMatterBlock(raw);
    if (!block) continue;
    const fm = parseFrontMatter(block);

    const nodeId = fm.brain_node;
    if (!nodeId) continue; // only domain/system docs carry a node join key
    // Only NODE docs join here. `interchange` docs describe an edge (their
    // brain_node points at the owning domain but they must not overwrite that
    // domain's own summary/docs_ref), and `inventory` docs are session notes.
    const kind = fm.brain_doc_kind ?? "domain";
    if (kind !== "domain" && kind !== "system") continue;
    stats.scanned++;

    // Repo-relative docs_ref (portable, matches the caney repo layout).
    const docsRef = `${DOCS_SUBDIR.replace(/\\/g, "/")}/${file}`;
    docRefs[nodeId] = {
      summary: fm.summary && fm.summary.length ? fm.summary : null,
      docs_ref: docsRef,
    };
    stats.matched++;
  }

  return { docRefs, stats };
}
