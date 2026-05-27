// Scan Obsidian-style brains on disk and index them into research_notes.
// Maps top-level folders to projects via convention.
// Idempotent — re-running detects changes via content_hash.

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });
const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";

/**
 * Each entry = a brain root on disk. We map sub-folders → project titles.
 * `default` = applied when no folder-specific rule matches.
 */
const BRAIN_SOURCES = [
  {
    rootKey: "vz-docs",
    rootPath: "/Users/tomas/vz-docs",
    folderToProject: {
      "Posada-PMS": "CaneyCloud",
      "RUTA-Platform": "RUTA — Secure Transport Venezuela",
      "VZ-Platform": "VAV — Vamos a Venezuela",
      "Enhancements VZ": "VAV — Vamos a Venezuela",
    },
    default: "VAV — Vamos a Venezuela",
  },
  {
    rootKey: "VZ_Tourism_Project/docs",
    rootPath: "/Users/tomas/VZ_Tourism_Project/docs",
    folderToProject: {
      "caco-brain": "Cosecha",
      "land-intel": "MIRO Intelligence",
      research: "MIRO Intelligence",
      "VAV-Commission-Hardening": "VAV — Vamos a Venezuela",
      "pms-integration": "Stays",
      "OTA - PMS": "Stays",
      "Posada-PMS": "Stays",
    },
    default: "VAV — Vamos a Venezuela",
  },
];

const SKIP_DIRS = new Set([
  ".obsidian",
  ".git",
  "node_modules",
  "_local-backup-before-merge",
  ".trash",
]);

async function walkMarkdown(root, prefix = "") {
  let out = [];
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".obsidian") continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(root, e.name);
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out = out.concat(await walkMarkdown(full, rel));
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      out.push({ full, rel });
    }
  }
  return out;
}

function extractTitle(content, fallback) {
  const m = content.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  // Try frontmatter title:
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const t = fm[1].match(/^title:\s*(.+)$/m);
    if (t) return t[1].trim().replace(/^['"]|['"]$/g, "");
  }
  return fallback;
}

function extractSummary(content) {
  // Strip frontmatter
  const noFm = content.replace(/^---\n[\s\S]*?\n---\n?/, "");
  // First non-heading paragraph
  const paras = noFm.split(/\n\n+/);
  for (const p of paras) {
    const cleaned = p.replace(/^#+\s+.*$/m, "").trim();
    if (cleaned && cleaned.length > 30) {
      const flat = cleaned.replace(/\s+/g, " ").trim();
      return flat.length > 300 ? `${flat.slice(0, 297)}…` : flat;
    }
  }
  return null;
}

function extractTags(content) {
  const tags = new Set();
  // Frontmatter tags: tags: [a, b] OR tags:\n  - a
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const inline = fm[1].match(/^tags:\s*\[([^\]]+)\]/m);
    if (inline) {
      for (const t of inline[1].split(",")) tags.add(t.trim().replace(/^['"]|['"]$/g, ""));
    }
    const block = fm[1].match(/^tags:\n((?:\s+-\s+.+\n?)+)/m);
    if (block) {
      for (const line of block[1].split("\n")) {
        const m = line.match(/^\s+-\s+(.+)$/);
        if (m) tags.add(m[1].trim().replace(/^['"]|['"]$/g, ""));
      }
    }
  }
  // Inline #tag
  for (const m of content.matchAll(/(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{2,})/g)) {
    tags.add(m[1]);
  }
  return Array.from(tags).slice(0, 20);
}

function wordCount(content) {
  return content.replace(/```[\s\S]*?```/g, "").split(/\s+/).filter(Boolean).length;
}

async function getProjectIdByTitle(title) {
  const rows = await sql`
    SELECT id FROM projects WHERE workspace_id = ${WORKSPACE_ID} AND title = ${title} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function main() {
  console.log("Syncing research brains…\n");

  // Pre-resolve project IDs
  const titleToId = new Map();
  for (const src of BRAIN_SOURCES) {
    for (const t of [...Object.values(src.folderToProject), src.default]) {
      if (t && !titleToId.has(t)) {
        const id = await getProjectIdByTitle(t);
        titleToId.set(t, id);
        if (!id) console.log(`  ! no project found for "${t}" (notes will be unassigned)`);
      }
    }
  }

  let scanned = 0;
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const seenIds = new Set();

  for (const src of BRAIN_SOURCES) {
    console.log(`\nScanning ${src.rootKey}…`);
    const files = await walkMarkdown(src.rootPath);
    for (const { full, rel } of files) {
      scanned++;
      const content = await fs.readFile(full, "utf8");
      const stat = await fs.stat(full);
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      const topFolder = rel.includes("/") ? rel.split("/")[0] : null;
      const projectTitle = topFolder && src.folderToProject[topFolder] !== undefined
        ? src.folderToProject[topFolder]
        : src.default;
      const projectId = projectTitle ? titleToId.get(projectTitle) ?? null : null;

      const fallback = path.basename(rel, ".md").replace(/[-_]/g, " ");
      const title = extractTitle(content, fallback);
      const summary = extractSummary(content);
      const tags = extractTags(content);
      const wc = wordCount(content);

      // Upsert
      const existing = await sql`
        SELECT id, content_hash FROM research_notes
        WHERE workspace_id = ${WORKSPACE_ID}
          AND source_root = ${src.rootKey}
          AND rel_path = ${rel}
        LIMIT 1
      `;

      if (existing[0]) {
        seenIds.add(existing[0].id);
        if (existing[0].content_hash === hash) {
          unchanged++;
          continue;
        }
        await sql`
          UPDATE research_notes SET
            project_id = ${projectId},
            title = ${title},
            summary = ${summary},
            folder = ${topFolder},
            word_count = ${wc},
            tags = ${sql.json(tags)},
            last_modified = ${stat.mtime.toISOString()},
            content_hash = ${hash},
            indexed_at = NOW()
          WHERE id = ${existing[0].id}
        `;
        updated++;
      } else {
        const [row] = await sql`
          INSERT INTO research_notes (
            workspace_id, project_id, source_root, rel_path,
            title, summary, folder, word_count, tags,
            last_modified, content_hash
          ) VALUES (
            ${WORKSPACE_ID}, ${projectId}, ${src.rootKey}, ${rel},
            ${title}, ${summary}, ${topFolder}, ${wc}, ${sql.json(tags)},
            ${stat.mtime.toISOString()}, ${hash}
          )
          RETURNING id
        `;
        seenIds.add(row.id);
        inserted++;
      }
    }
    console.log(`  scanned ${files.length} files`);
  }

  // Prune notes that no longer exist on disk
  const allRows = await sql`SELECT id FROM research_notes WHERE workspace_id = ${WORKSPACE_ID}`;
  const stale = allRows.filter((r) => !seenIds.has(r.id));
  for (const r of stale) {
    await sql`DELETE FROM research_notes WHERE id = ${r.id}`;
  }

  console.log(`
─── Summary ───
scanned   : ${scanned}
inserted  : ${inserted}
updated   : ${updated}
unchanged : ${unchanged}
pruned    : ${stale.length}
`);

  await sql.end();
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
