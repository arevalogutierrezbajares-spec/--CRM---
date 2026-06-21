/**
 * THE BRAIN — manifest-source extractor (FR-PIPE-14).
 *
 * Caney Academy is a PLANNED system (no code yet). Its nodes are derived from
 * the curriculum manifest under /Users/tomas/vz-avitourism-curriculum
 * (lms-integration-plan.md + CURRICULUM.md). Every node is `source:"manifest"`
 * and `state:"needed"` (fog-of-war) — the NFR-OBS-5 assertion FAILS the build if
 * any manifest node claims to be built.
 *
 * Emits: the academy L1 system node, its 7 domains (mapped to academy.* FN_MAP
 * slugs → all `education`), system→domain contains edges, and 3 PLANNED
 * interchange edges (academy→vav, academy→crm, vav→restaurants), each
 * contract_status:"planned", contract_hash:null.
 *
 * The manifest is read defensively — if the curriculum repo is absent the
 * domains still emit from the taxonomy (the operator decision requires Academy
 * populated, not gated on a checkout).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOTS } from "../config.mjs";
import {
  systemNode,
  domainNode,
  edge,
  interchange,
} from "../lib/emit.mjs";
import { sizeForCount } from "../../../lib/brain/types.ts";
import { ACADEMY_DOMAINS } from "../lib/taxonomy.mjs";
import { systemPos, domainPos } from "../lib/positions.mjs";

/** Locate the curriculum manifest; returns the doc ref string used for nodes. */
function resolveManifestRef() {
  const candidates = [
    join(REPO_ROOTS.academyCurriculum, "modules", "lms-integration-plan.md"),
    join(REPO_ROOTS.academyCurriculum, "CURRICULUM.md"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c.replace(`${REPO_ROOTS.academyCurriculum}/`, "vz-avitourism-curriculum/");
  }
  return "vz-avitourism-curriculum/modules/lms-integration-plan.md";
}

export function extractManifestSource() {
  const manifestRef = resolveManifestRef();
  const nodes = [];
  const edges = [];

  // L1 system node — planned/fog-of-war territory. commit stays null (no code).
  nodes.push(
    systemNode({
      system: "academy",
      state: "needed",
      source: "manifest",
      meta: `planned · from curriculum manifest · ${ACADEMY_DOMAINS.length} domains (14 courses, 4 trails)`,
      docs_ref: manifestRef,
      pos: systemPos("academy"),
    }),
  );

  ACADEMY_DOMAINS.forEach((d, i) => {
    const surfaces = d.surfaces ?? [];
    nodes.push(
      domainNode({
        id: d.id,
        label: d.label,
        system: "academy",
        source: "manifest",
        state: "needed", // NFR-OBS-5: manifest ⇒ needed
        surfaces,
        surfaceCount: surfaces.length,
        size: sizeForCount(surfaces.length),
        docs_ref: d.docs_ref ?? manifestRef,
        pos: domainPos("academy", i, ACADEMY_DOMAINS.length),
      }),
    );
    edges.push(
      edge({
        id: `contains.academy.${d.id}`,
        kind: "contains",
        from: { system: "academy", domain: "academy" },
        to: { system: "academy", domain: d.id },
        contract_status: "planned",
      }),
    );
  });

  // 3 PLANNED interchange edges (ix7..ix9). contract_status:"planned" ⇒ dashed,
  // contract_hash:null, excluded from hashing (FR-PIPE-6).
  edges.push(
    interchange({
      id: "ix7",
      from: { system: "vav", domain: "vav.specialized-content" },
      to: { system: "restaurants", domain: "restaurants.menu" },
      purpose: "Dining experiences from restaurants surface into the VAV marketplace (planned)",
      health: "dark",
      contract_status: "planned",
      contract_ref: "vz-avitourism-curriculum/modules/lms-integration-plan.md",
      breaks: ["no restaurant dining inventory in VAV marketplace"],
    }),
    interchange({
      id: "ix8",
      from: { system: "academy", domain: "academy.certification" },
      to: { system: "vav", domain: "vav.identity" },
      purpose: "Certified bird guides flow into VAV as verified providers (planned)",
      health: "dark",
      contract_status: "planned",
      contract_ref: "vz-avitourism-curriculum/modules/lms-integration-plan.md",
      breaks: ["guide certification not reflected in VAV provider profiles"],
    }),
    interchange({
      id: "ix9",
      from: { system: "academy", domain: "academy.enrollment" },
      to: { system: "crm", domain: "crm.contacts" },
      purpose: "Academy enrollment intake feeds CRM contacts/network (planned)",
      health: "dark",
      contract_status: "planned",
      contract_ref: "vz-avitourism-curriculum/modules/lms-integration-plan.md",
      breaks: ["learner enrollments not captured as CRM contacts"],
    }),
  );

  return { nodes, edges };
}
