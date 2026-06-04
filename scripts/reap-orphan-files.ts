/**
 * FR-DOC-19 — orphan blob reaper.
 *
 * Lists every object in the `agb-project-files` bucket, cross-references each
 * against `project_links.storage_path`, and deletes any object older than 24h
 * that has no matching DB row. Safe to run on a nightly cron.
 *
 * Usage:  npx tsx scripts/reap-orphan-files.ts [--dry-run]
 *
 * Reads DATABASE_URL + Supabase service creds from .env.local (or the process
 * env). Never hardcodes credentials.
 */
import { readFileSync } from "fs";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "agb-project-files";
const MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* rely on process env */
  }
}

type StorageObj = { path: string; createdAt: number };

type AnySupabase = {
  storage: {
    from: (b: string) => {
      list: (
        dir: string,
        opts: { limit: number; offset: number },
      ) => Promise<{ data: { name: string; id: string | null; created_at?: string }[] | null; error: unknown }>;
    };
  };
};

async function listAll(supabase: AnySupabase, prefix: string): Promise<StorageObj[]> {
  const out: StorageObj[] = [];
  const walk = async (dir: string) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(dir, { limit: 100, offset });
      if (error || !data || data.length === 0) break;
      for (const entry of data) {
        const full = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.id === null) {
          await walk(full); // folder
        } else {
          const ts = entry.created_at ? Date.parse(entry.created_at) : Date.now();
          out.push({ path: full, createdAt: ts });
        }
      }
      if (data.length < 100) break;
      offset += 100;
    }
  };
  await walk(prefix);
  return out;
}

async function main() {
  loadEnv();
  const dbUrl = process.env.DATABASE_URL;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !supaUrl || !serviceKey) {
    console.error("Missing DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const sql = postgres(dbUrl, { prepare: false });
  const supabase = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });

  // Known, live storage paths.
  const rows = await sql<{ storage_path: string }[]>`
    select storage_path from project_links
    where kind = 'file' and storage_path is not null
  `;
  const known = new Set(rows.map((r) => r.storage_path));

  const objects = await listAll(supabase as unknown as AnySupabase, "");
  const now = Date.now();
  const orphans = objects.filter(
    (o) => !known.has(o.path) && now - o.createdAt > MIN_AGE_MS,
  );

  console.log(
    `Scanned ${objects.length} objects · ${known.size} known · ${orphans.length} orphan(s) older than 24h`,
  );

  if (orphans.length === 0) {
    await sql.end();
    return;
  }
  for (const o of orphans) console.log(`  orphan: ${o.path}`);

  if (DRY_RUN) {
    console.log("--dry-run: not deleting");
    await sql.end();
    return;
  }

  // Delete in batches of 100.
  const paths = orphans.map((o) => o.path);
  let deleted = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) console.error("  batch remove failed:", error.message);
    else deleted += batch.length;
  }
  console.log(`Deleted ${deleted} orphan object(s)`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
