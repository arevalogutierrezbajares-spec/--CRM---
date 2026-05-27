// Consolidate the three CaneyCloud projects into one parent with 3 child modules:
//   CaneyCloud (parent)
//     ├── Stays           (was: CaneyCloud Tour PMS)
//     ├── Restaurants     (was: CaneyCloud Restaurant)
//     └── WA Concierge    (was: CaneyCloud WhatsApp Concierge)
// Idempotent: re-running detects an existing parent and re-points children.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const USER_ID = "9d543a9c-3dfe-4f2b-aa73-e0156d478dce";

const PARENT_TITLE = "CaneyCloud";
const PARENT_DEF = {
  title: PARENT_TITLE,
  tagline: "Hospitality OS for Venezuela — Stays, Restaurants, and WA Concierge.",
  summary:
    "Vertical hospitality SaaS for the Venezuelan market. One platform across three modules: a posada PMS (Stays), a restaurant-ops platform (Restaurants), and a multilingual concierge agent over WhatsApp (WA Concierge). Lives in --TOURISM-- (co-owned with JEAV) plus the standalone restaurant + edge-function repos.",
  coverEmoji: "☁️",
  coverColor: "#185FA5",
  statusText: "Active · 3 modules · Stays at 92/155, Restaurants Wave 4 done",
  primaryUrl: "https://caneycloud.com",
};

const MODULE_RENAMES = [
  {
    fromTitles: ["CaneyCloud Tour PMS", "Stays"],
    newTitle: "Stays",
    coverEmoji: "🏨",
    coverColor: "#185FA5",
    tagline: "Property management for Venezuelan posadas.",
  },
  {
    fromTitles: ["CaneyCloud Restaurant", "Restaurants"],
    newTitle: "Restaurants",
    coverEmoji: "🍽️",
    coverColor: "#A32D2D",
    tagline: "Restaurant ops platform — Beli + Resy + Toast for LATAM.",
  },
  {
    fromTitles: [
      "CaneyCloud WhatsApp Concierge",
      "WA Concierge",
    ],
    newTitle: "WA Concierge",
    coverEmoji: "💬",
    coverColor: "#0F6E56",
    tagline: "Multilingual concierge agent over WhatsApp Cloud API.",
  },
];

async function getProjectByAnyTitle(titles) {
  for (const t of titles) {
    const rows = await sql`
      SELECT * FROM projects
      WHERE workspace_id = ${WORKSPACE_ID} AND title = ${t}
      LIMIT 1
    `;
    if (rows[0]) return rows[0];
  }
  return null;
}

async function upsertParent() {
  const existing = await getProjectByAnyTitle([PARENT_TITLE]);
  if (existing) {
    await sql`
      UPDATE projects SET
        tagline = ${PARENT_DEF.tagline},
        summary = ${PARENT_DEF.summary},
        cover_emoji = ${PARENT_DEF.coverEmoji},
        cover_color = ${PARENT_DEF.coverColor},
        status_text = ${PARENT_DEF.statusText},
        primary_url = ${PARENT_DEF.primaryUrl},
        parent_project_id = NULL,
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;
    console.log(`  ~ parent updated: ${PARENT_TITLE}`);
    return existing.id;
  }
  const [row] = await sql`
    INSERT INTO projects (
      workspace_id, title, status, tagline, summary,
      cover_emoji, cover_color, status_text, primary_url, created_by
    ) VALUES (
      ${WORKSPACE_ID}, ${PARENT_TITLE}, 'active',
      ${PARENT_DEF.tagline}, ${PARENT_DEF.summary},
      ${PARENT_DEF.coverEmoji}, ${PARENT_DEF.coverColor},
      ${PARENT_DEF.statusText}, ${PARENT_DEF.primaryUrl}, ${USER_ID}
    )
    RETURNING id
  `;
  console.log(`  + parent created: ${PARENT_TITLE}`);
  return row.id;
}

async function main() {
  console.log("Consolidating CaneyCloud modules…\n");

  const parentId = await upsertParent();

  console.log("\nModules:");
  for (const m of MODULE_RENAMES) {
    const existing = await getProjectByAnyTitle(m.fromTitles);
    if (!existing) {
      console.log(`  ! no project found for: ${m.fromTitles.join(" / ")}`);
      continue;
    }
    if (existing.id === parentId) {
      console.log(`  ! would alias parent for ${m.newTitle}; skipping`);
      continue;
    }
    await sql`
      UPDATE projects SET
        title = ${m.newTitle},
        tagline = ${m.tagline},
        cover_emoji = ${m.coverEmoji},
        cover_color = ${m.coverColor},
        parent_project_id = ${parentId},
        updated_at = NOW()
      WHERE id = ${existing.id}
    `;
    console.log(
      `  ~ ${existing.title} → ${m.newTitle} (parent: ${PARENT_TITLE})`,
    );
  }

  console.log("\nFinal project list:");
  const finalList = await sql`
    SELECT title, cover_emoji, parent_project_id FROM projects
    WHERE workspace_id = ${WORKSPACE_ID}
    ORDER BY parent_project_id NULLS FIRST, title
  `;
  for (const p of finalList) {
    const indent = p.parent_project_id ? "    └─ " : "";
    console.log(`  ${indent}${p.cover_emoji ?? "📁"}  ${p.title}`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error("Consolidate failed:", e);
  process.exit(1);
});
