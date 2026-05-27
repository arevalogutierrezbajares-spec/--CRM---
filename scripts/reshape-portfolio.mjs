// One-shot reshape:
// - Merge BMAD VZ Explorer (Mija) into VAV as a "Future vision" link
// - Move Gigachad + GigaPaul under AGB-CRM as enterprise AI tools
// - Add new projects: Cosecha + MIRO Intelligence
// Safe to re-run; uses idempotent UPSERTs.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const USER_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";

async function getProjectIdByTitle(title) {
  const rows = await sql`
    SELECT id FROM projects WHERE workspace_id = ${WORKSPACE_ID} AND title = ${title} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function deleteProjectByTitle(title) {
  const id = await getProjectIdByTitle(title);
  if (!id) {
    console.log(`  - ${title} (already gone)`);
    return;
  }
  await sql`DELETE FROM projects WHERE id = ${id}`;
  console.log(`  - removed: ${title}`);
}

async function addLinkIfMissing(projectId, link) {
  const existing = await sql`
    SELECT id FROM project_links
    WHERE project_id = ${projectId}
      AND category = ${link.category}
      AND label = ${link.label}
    LIMIT 1
  `;
  if (existing[0]) return;
  // Compute next sortOrder
  const maxRow = await sql`
    SELECT COALESCE(MAX(sort_order), -1) AS max FROM project_links
    WHERE project_id = ${projectId} AND category = ${link.category}
  `;
  const next = (maxRow[0]?.max ?? -1) + 1;
  await sql`
    INSERT INTO project_links (
      workspace_id, project_id, category, label, url, description, sort_order
    ) VALUES (
      ${WORKSPACE_ID}, ${projectId}, ${link.category}, ${link.label},
      ${link.url ?? null}, ${link.description ?? null}, ${next}
    )
  `;
  console.log(`    + link [${link.category}] ${link.label}`);
}

async function upsertProject(p) {
  const existing = await getProjectIdByTitle(p.title);
  if (existing) {
    await sql`
      UPDATE projects SET
        tagline = ${p.tagline},
        summary = ${p.summary},
        cover_emoji = ${p.coverEmoji},
        cover_color = ${p.coverColor},
        status_text = ${p.statusText ?? null},
        primary_url = ${p.primaryUrl ?? null},
        updated_at = NOW()
      WHERE id = ${existing}
    `;
    console.log(`  ~ updated: ${p.title}`);
    return existing;
  }
  const [row] = await sql`
    INSERT INTO projects (
      workspace_id, title, status, tagline, summary,
      cover_emoji, cover_color, status_text, primary_url, created_by
    ) VALUES (
      ${WORKSPACE_ID}, ${p.title}, 'active', ${p.tagline}, ${p.summary},
      ${p.coverEmoji}, ${p.coverColor}, ${p.statusText ?? null},
      ${p.primaryUrl ?? null}, ${USER_ID}
    )
    RETURNING id
  `;
  console.log(`  + created: ${p.title}`);
  return row.id;
}

async function main() {
  console.log("Reshaping portfolio…\n");

  // ─── 1. Add new projects ─────────────────────────────────────────
  console.log("New ventures:");

  const cosechaId = await upsertProject({
    title: "Cosecha",
    tagline: "Agro venture — Venezuelan harvest, sourcing, and supply.",
    summary:
      "Venezuelan agricultural/harvest venture. Connecting growers to buyers, supply-chain transparency, and produce sourcing. (Stub — edit summary with the real thesis.)",
    coverEmoji: "🌾",
    coverColor: "#854F0B",
    statusText: "Active · stub — fill in real strategy",
  });
  await addLinkIfMissing(cosechaId, {
    category: "business",
    label: "Product thesis",
    description: "What Cosecha is building and for whom",
  });
  await addLinkIfMissing(cosechaId, {
    category: "business",
    label: "Grower pipeline",
    description: "Active sourcing partners",
  });
  await addLinkIfMissing(cosechaId, {
    category: "business",
    label: "Buyer relationships",
    description: "Off-take agreements + B2B clients",
  });
  await addLinkIfMissing(cosechaId, {
    category: "marketing",
    label: "Brand identity",
  });
  await addLinkIfMissing(cosechaId, {
    category: "marketing",
    label: "Landing page",
  });
  await addLinkIfMissing(cosechaId, {
    category: "tech",
    label: "Repo (when built)",
  });
  await addLinkIfMissing(cosechaId, {
    category: "ops",
    label: "Supply-chain SOP",
  });

  const miroId = await upsertProject({
    title: "MIRO Intelligence",
    tagline: "Intelligence product — Venezuela market, security, and ops data.",
    summary:
      "Intelligence product line covering Venezuela market signals, security advisories, operational data feeds. Complements RUTA's Alerta/Diario/Campo/Embebido tiers. (Stub — edit with the real product spec.)",
    coverEmoji: "👁️",
    coverColor: "#534AB7",
    statusText: "Active · stub — fill in real product spec",
  });
  await addLinkIfMissing(miroId, {
    category: "business",
    label: "Product tiers + pricing",
    description: "What MIRO sells and at what price points",
  });
  await addLinkIfMissing(miroId, {
    category: "business",
    label: "Client pipeline",
    description: "Energy, mining, diplomatic, corporate prospects",
  });
  await addLinkIfMissing(miroId, {
    category: "business",
    label: "Data sources + licensing",
  });
  await addLinkIfMissing(miroId, {
    category: "marketing",
    label: "Product brief / sample report",
  });
  await addLinkIfMissing(miroId, {
    category: "marketing",
    label: "Positioning vs RUTA intel products",
    description: "Alerta/Diario/Campo/Embebido relationship",
  });
  await addLinkIfMissing(miroId, {
    category: "tech",
    label: "Data ingestion pipeline",
  });
  await addLinkIfMissing(miroId, {
    category: "tech",
    label: "Delivery format (PDF/API/portal)",
  });
  await addLinkIfMissing(miroId, {
    category: "ops",
    label: "Editorial cadence",
    description: "How often each tier ships",
  });

  // ─── 2. Merge BMAD VZ Explorer (Mija) → VAV ──────────────────────
  console.log("\nMerging BMAD VZ Explorer (Mija) → VAV:");
  const vavId = await getProjectIdByTitle("VAV — Vamos a Venezuela");
  if (vavId) {
    await addLinkIfMissing(vavId, {
      category: "business",
      label: "Future vision: Mija AI concierge (BMAD VZ Explorer)",
      description:
        "Next-gen evolution: invisible AI concierge platform, creator ecosystem, livestream network. Planning complete via BMAD method, dev not started. Lives in _bmad-output/ artifacts.",
    });
    await addLinkIfMissing(vavId, {
      category: "business",
      label: "Creator ecosystem economics (Mija)",
      description: "Wave 6 invite system, portal, dashboard, earnings, codes shipped",
    });
    await addLinkIfMissing(vavId, {
      category: "tech",
      label: "BMAD planning artifacts (_bmad/)",
      description: "Mija architecture stubs + product briefs",
    });
  } else {
    console.log("  ! VAV not found; skipping merge");
  }
  await deleteProjectByTitle("BMAD VZ Explorer (Mija)");

  // ─── 3. Move Gigachad + GigaPaul → AGB-CRM as enterprise AI tools ──
  console.log("\nMerging Gigachad + GigaPaul → AGB-CRM:");
  const crmId = await getProjectIdByTitle("AGB-CRM");
  if (crmId) {
    // Gigachad
    await addLinkIfMissing(crmId, {
      category: "tech",
      label: "Enterprise AI Tool: GigaChad Test Manager",
      description:
        "Cross-repo test orchestrator covering 277 tests across 6 repos / 4 frameworks. 27 commands. Registry at ~/.claude/agents/test-registry.json. Coordinates with GigaPaul for sprint state.",
    });
    await addLinkIfMissing(crmId, {
      category: "tech",
      label: "GigaChad agent definition (~/.claude/agents/)",
    });
    await addLinkIfMissing(crmId, {
      category: "tech",
      label: "GigaChad test registry JSON",
    });
    // GigaPaul
    await addLinkIfMissing(crmId, {
      category: "tech",
      label: "Enterprise AI Tool: GigaPaul PMO Agent",
      description:
        "Cross-project PMO managing 6 projects, 36-month roadmap, sprint coordination. Peer to GigaChad. State at ~/.claude/agents/.",
    });
    await addLinkIfMissing(crmId, {
      category: "ops",
      label: "GigaPaul portfolio coverage matrix",
    });
    await addLinkIfMissing(crmId, {
      category: "ops",
      label: "Daily PMO standup template (GigaPaul)",
    });
    await addLinkIfMissing(crmId, {
      category: "ops",
      label: "GigaChad ↔ GigaPaul coordination protocol",
    });
  } else {
    console.log("  ! AGB-CRM not found; skipping merge");
  }
  await deleteProjectByTitle("Gigachad Test Manager");
  await deleteProjectByTitle("GigaPaul PMO Agent");

  // ─── Done ────────────────────────────────────────────────────────
  console.log("\nFinal project list:");
  const finalList = await sql`
    SELECT title, cover_emoji FROM projects
    WHERE workspace_id = ${WORKSPACE_ID}
    ORDER BY title
  `;
  for (const p of finalList) {
    console.log(`  ${p.cover_emoji ?? "📁"}  ${p.title}`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Reshape failed:", e);
  process.exit(1);
});
