/**
 * Classify a markdown note as research / product / note based on its path
 * within the source brain.
 *
 *   research = inspiration, knowledge, references, brainstorming, data sources,
 *              whitepapers, business plans, concepts, vendor entities, methodology
 *   product  = specs, PRDs, FRs, handoffs, sprint logs, plans, audits, migrations,
 *              architecture docs, _tasks/, _BOARD, RUNBOOK, TODO
 *   note     = anything that doesn't match either bucket
 */

export type NoteKind = "research" | "product" | "note";

/** Path-segment exact matches (any segment of relPath). */
const RESEARCH_FOLDERS = new Set([
  "research",
  "caco-brain",
  "brainstorming",
  "Sources",
  "Concepts",
  "Entities",
  "Comparisons",
]);

const PRODUCT_FOLDERS = new Set([
  "_tasks",
  "handoffs",
  "VAV-Commission-Hardening",
  "pms-integration",
  "OTA - PMS",
  "Posada-PMS",
  "Data-Schemas",
  "Operations",
]);

/** Substring matches on the basename (lowercased) — product. */
const PRODUCT_NAME_PARTS = [
  "fr-",
  "task-",
  "prd",
  "wave",
  "handoff",
  "migration",
  "audit",
  "sprint",
  "session-log",
  "runbook",
  "todo",
  "build-plan",
  "remaining",
  "roadmap",
  "implementation-plan",
  "hardening-plan",
  "test-plan",
  "sequencing",
  "contract-freeze",
  "nfr-report",
  "_board",
  "_dag",
  "_contracts",
  "_protocol",
  "goal-runbook",
  "claude-md",
  "project-instructions",
];

/** Substring matches on the basename (lowercased) — research. */
const RESEARCH_NAME_PARTS = [
  "whitepaper",
  "knowledge-base",
  "reference",
  "standards",
  "industry",
  "methodology",
  "business-plan",
  "vision",
  "playbook",
  "index", // brain hubs
  "agent-profile",
  "framework",
];

export function classifyNote(relPath: string): NoteKind {
  const parts = relPath.split("/");
  const base = parts[parts.length - 1].toLowerCase();

  // 1. Folder-based product signals (highest precedence)
  for (const segment of parts) {
    if (PRODUCT_FOLDERS.has(segment)) {
      // Carve-out: research/ is ALWAYS research even if nested under something else
      if (parts.includes("research")) return "research";
      if (parts.includes("caco-brain")) return "research";
      return "product";
    }
  }

  // 2. Folder-based research signals
  for (const segment of parts) {
    if (RESEARCH_FOLDERS.has(segment)) return "research";
  }

  // 3. Filename-based product signals
  for (const part of PRODUCT_NAME_PARTS) {
    if (base.includes(part)) return "product";
  }

  // 4. Numbered chapter files (00-, 01-, 02-, ...) — usually structured product spec
  //    UNLESS the parent folder is a known research hub (caught above).
  if (/^\d{2}[-_]/.test(base)) return "product";

  // 5. Filename-based research signals
  for (const part of RESEARCH_NAME_PARTS) {
    if (base.includes(part)) return "research";
  }

  return "note";
}
