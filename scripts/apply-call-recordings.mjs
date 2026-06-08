#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";
config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });
const sqlText = readFileSync(new URL("../db/migrations/0019_call_recordings.sql", import.meta.url).pathname, "utf8");
const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
try {
  await sql.unsafe(sqlText);
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='call_recordings' ORDER BY ordinal_position`;
  const ai = await sql`SELECT 1 FROM information_schema.columns WHERE table_name='action_items' AND column_name='call_recording_id'`;
  console.log("call_recordings columns:", cols.map((c) => c.column_name).join(", "));
  console.log("action_items.call_recording_id present:", ai.length === 1);
} catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
finally { await sql.end(); }
