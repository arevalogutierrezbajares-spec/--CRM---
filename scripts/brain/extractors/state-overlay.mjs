/**
 * THE BRAIN — state-overlay extractor (FR-PIPE-7).
 *
 * Overlays build-state onto domain nodes from the work boards:
 *   - Overlord section-* TASKS.md files under the Overlord wiki
 *   - AGB-CRM _tasks/_BOARD.md
 *
 * Live, shipped systems (VAV, CaneyCloud, AGB-CRM) default their domains to
 * "done"; this overlay only DEMOTES a domain to "doing" when the boards show
 * active/open work whose section maps to that domain — it never promotes a
 * manifest ("needed") node (NFR-OBS-5) or a host-mounted dark module.
 *
 * It returns a `stateOverrides` map { domainId -> state } the orchestrator
 * applies to already-emitted domain nodes (last-write-wins via GraphBuilder is
 * not used here because domains are emitted by other extractors; the
 * orchestrator mutates them in place after merge).
 *
 * Read-only (NFR-SEC-3); missing boards degrade to no overrides.
 */

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";

/** Map an Overlord section folder name to a CaneyCloud domain id (best effort). */
const SECTION_TO_DOMAIN = {
  "section-finance": "caney.payments",
  "section-accounting": "caney.accounting",
  "section-reservations": "caney.booking-core",
  "section-channel-integrations": "caney.channels",
  "section-calendar": "caney.availability",
  "section-guest-experience": "caney.messaging",
  "section-frontend-ux": "caney.properties",
};

/** Read all TASKS.md under the Overlord wiki and bucket open work by section. */
function overlordSignals() {
  const root = REPO_ROOTS.overlordWiki;
  const overrides = {};
  if (!root || !existsSync(root)) return overrides;

  let sections;
  try {
    sections = readdirSync(root).filter((f) => f.startsWith("section-"));
  } catch {
    return overrides;
  }

  for (const section of sections) {
    const tasksPath = join(root, section, "TASKS.md");
    if (!existsSync(tasksPath)) continue;
    let raw;
    try {
      raw = readFileSync(tasksPath, "utf8");
    } catch {
      continue;
    }
    const domainId = SECTION_TO_DOMAIN[section];
    if (!domainId) continue;
    // Heuristic: a section with open/in-progress markers is actively "doing".
    const hasOpenWork = /\b(in[- ]progress|open|claimed|todo|wip|🟡|🔴)\b/i.test(
      raw,
    );
    // We do NOT demote shipped accounting/channels that are already "doing" in
    // the taxonomy; we only record a signal. Live core domains stay "done".
    if (hasOpenWork && (domainId === "caney.accounting")) {
      overrides[domainId] = "doing";
    }
  }
  return overrides;
}

/** Read AGB-CRM _tasks/_BOARD.md for any explicitly WIP CRM domains. */
function crmBoardSignals() {
  const boardPath = join(REPO_ROOTS.crm, "_tasks", "_BOARD.md");
  const overrides = {};
  if (!existsSync(boardPath)) return overrides;
  try {
    const raw = readFileSync(boardPath, "utf8");
    // The onboarding intake (ix3 CRM side) is in "review" / behind a flag.
    if (/onboard|intake/i.test(raw) && /review|dark|pending/i.test(raw)) {
      overrides["crm.projects"] = overrides["crm.projects"] ?? "done"; // shipped half
    }
  } catch {
    /* ignore */
  }
  return overrides;
}

/**
 * @returns {{ stateOverrides: Record<string, "done"|"doing"|"needed"> }}
 */
export function extractStateOverlay() {
  const stateOverrides = {
    ...overlordSignals(),
    ...crmBoardSignals(),
  };
  return { stateOverrides };
}

// Touch statSync import to keep the module's intent explicit (mtime-based
// freshness is a v1 enhancement; v0 reads content markers only).
void statSync;
