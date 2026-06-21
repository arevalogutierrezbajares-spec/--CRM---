/**
 * THE BRAIN — OpenAPI spec parser (shared by the surface extractor).
 *
 * Parses an OpenAPI 3.x document (YAML or JSON) into a flat, deterministic
 * shape the surface/domain extractors can consume. Read-only (NFR-SEC-3).
 *
 * Robustness contract: a MISSING file returns an empty result and NEVER throws
 * (so the orchestrator runs cleanly even when a source repo isn't checked out).
 * A present-but-malformed file also degrades to empty with a warning rather
 * than aborting the whole pipeline.
 */

import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "patch",
  "options",
  "head",
  "trace",
]);

/** @typedef {{ method: string, path: string, operationId: string|null, tags: string[] }} OpenApiPath */
/** @typedef {{ paths: OpenApiPath[], pathCount: number, tagCount: number, tags: string[] }} OpenApiResult */

/** The empty result returned when a file is missing or unparseable. */
function empty() {
  return { paths: [], pathCount: 0, tagCount: 0, tags: [] };
}

/**
 * Parse an OpenAPI document at an absolute path.
 * @param {string} absPath
 * @returns {OpenApiResult}
 */
export function parseOpenApi(absPath) {
  if (!absPath || !existsSync(absPath)) return empty();

  let doc;
  try {
    const raw = readFileSync(absPath, "utf8");
    const ext = extname(absPath).toLowerCase();
    doc = ext === ".json" ? JSON.parse(raw) : parseYaml(raw);
  } catch (err) {
    // Degrade, don't abort: a bad spec shouldn't kill the whole graph build.
    console.warn(
      `[openapi] failed to parse ${absPath}: ${err?.message ?? err}`,
    );
    return empty();
  }

  if (!doc || typeof doc !== "object" || !doc.paths) return empty();

  /** @type {OpenApiPath[]} */
  const paths = [];
  const tagSet = new Set();

  // Deterministic order: sort path keys, then methods in HTTP_METHODS order.
  const pathKeys = Object.keys(doc.paths).sort();
  for (const path of pathKeys) {
    const item = doc.paths[path];
    if (!item || typeof item !== "object") continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== "object") continue;
      const tags = Array.isArray(op.tags) ? op.tags.map(String) : [];
      for (const t of tags) tagSet.add(t);
      paths.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === "string" ? op.operationId : null,
        tags,
      });
    }
  }

  // Top-level `tags:` declarations contribute to the tag universe too.
  if (Array.isArray(doc.tags)) {
    for (const t of doc.tags) {
      const name = typeof t === "string" ? t : t?.name;
      if (name) tagSet.add(String(name));
    }
  }

  const tags = [...tagSet].sort();
  return {
    paths,
    pathCount: paths.length,
    tagCount: tags.length,
    tags,
  };
}

export { empty as emptyOpenApi };
