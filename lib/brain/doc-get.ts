/**
 * Safe documentation body fetch for agent tools.
 * Reads only under docs/ of the CRM repo root. Pure path rules + FS.
 */

import { readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve, isAbsolute, sep } from "node:path";
import type { BrainGraph, BrainNode } from "./types";

const MAX_BYTES = 200_000;

export type BrainDocGetResult =
  | {
      ok: true;
      path: string;
      id: string | null;
      label: string | null;
      summary: string | null;
      kind: string | null;
      body: string;
      bytes: number;
      truncated: boolean;
      graphGeneratedAt: string;
    }
  | { ok: false; error: string; graphGeneratedAt?: string };

function crmRoot(): string {
  return process.env.BRAIN_ROOT_CRM ?? process.cwd();
}

function docsRoot(): string {
  return resolve(crmRoot(), "docs");
}

/**
 * True if `real` is the docs root or a path strictly under it (sep-bounded).
 * Prevents `docs-evil` from matching prefix `docs`.
 */
export function isPathInsideDocsRoot(real: string, realDocsRoot: string): boolean {
  const boundary = realDocsRoot.endsWith(sep) ? realDocsRoot : realDocsRoot + sep;
  return real === realDocsRoot || real.startsWith(boundary);
}

/**
 * Resolve a user-supplied path or doc node id to an absolute file under docs/.
 */
export function resolveDocsPath(
  input: { path?: string; id?: string },
  graph?: BrainGraph | null,
): { ok: true; abs: string; rel: string; node: BrainNode | null } | { ok: false; error: string } {
  let rel = (input.path ?? "").trim().replace(/\\/g, "/");
  let node: BrainNode | null = null;

  if (!rel && input.id && graph) {
    const n = graph.nodes.find((x) => x.id === input.id);
    if (!n) return { ok: false, error: `Unknown doc id: ${input.id}` };
    if (n.kind !== "doc" && n.kind !== "adr") {
      return { ok: false, error: `Node ${input.id} is not a documentation node` };
    }
    node = n;
    rel = (n.docs_ref ?? "").replace(/\\/g, "/");
  }

  if (!rel) return { ok: false, error: "path or id is required" };

  // Normalize: allow "docs/foo.md" or "foo.md"
  if (!rel.startsWith("docs/") && !rel.startsWith("/")) {
    rel = `docs/${rel}`;
  }
  if (rel.startsWith("/")) {
    return { ok: false, error: "absolute paths are not allowed" };
  }
  if (rel.includes("\0") || rel.split("/").some((p) => p === "..")) {
    return { ok: false, error: "path traversal is not allowed" };
  }

  const root = docsRoot();
  const abs = resolve(crmRoot(), rel);

  // Must stay under docs/
  const relToDocs = relative(root, abs);
  if (relToDocs.startsWith("..") || isAbsolute(relToDocs)) {
    return { ok: false, error: "path must resolve under docs/" };
  }

  if (!existsSync(abs)) {
    return { ok: false, error: `file not found: ${rel}` };
  }

  try {
    const real = realpathSync(abs);
    const realDocs = realpathSync(root);
    if (!isPathInsideDocsRoot(real, realDocs)) {
      return { ok: false, error: "path escapes docs/ (symlink)" };
    }
  } catch {
    return { ok: false, error: "unable to resolve path" };
  }

  return { ok: true, abs, rel: rel.replace(/\\/g, "/"), node };
}

/**
 * Load a documentation file for agents.
 */
export function getBrainDoc(
  graph: BrainGraph | null,
  input: { path?: string; id?: string },
): BrainDocGetResult {
  const graphGeneratedAt = graph?.generatedAt ?? "";
  const resolved = resolveDocsPath(input, graph);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, graphGeneratedAt };
  }

  let st;
  try {
    st = statSync(resolved.abs);
  } catch {
    return { ok: false, error: "stat failed", graphGeneratedAt };
  }
  if (!st.isFile()) {
    return { ok: false, error: "not a file", graphGeneratedAt };
  }

  let raw: string;
  try {
    const buf = readFileSync(resolved.abs);
    const truncated = buf.length > MAX_BYTES;
    raw = buf.subarray(0, MAX_BYTES).toString("utf8");
    const node = resolved.node;
    return {
      ok: true,
      path: resolved.rel,
      id: node?.id ?? null,
      label: node?.label ?? null,
      summary: node?.summary ?? null,
      kind: node?.kind ?? null,
      body: raw,
      bytes: Math.min(buf.length, MAX_BYTES),
      truncated,
      graphGeneratedAt,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "read failed",
      graphGeneratedAt,
    };
  }
}
