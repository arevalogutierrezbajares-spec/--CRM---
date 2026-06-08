#!/usr/bin/env node
// One-off: apply db/migrations/0018_meeting_materials.sql to the configured DB.
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const sqlText = readFileSync(
  new URL("../db/migrations/0018_meeting_materials.sql", import.meta.url).pathname,
  "utf8",
);

const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });

try {
  await sql.unsafe(sqlText);
  const [{ exists }] = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'meeting_materials'
    ) AS exists`;
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'meeting_materials' ORDER BY ordinal_position`;
  console.log("meeting_materials exists:", exists);
  console.log("columns:", cols.map((c) => c.column_name).join(", "));
} catch (e) {
  console.error("FAILED:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
