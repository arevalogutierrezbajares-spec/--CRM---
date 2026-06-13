#!/usr/bin/env node
// Import CaneyCloud sales/brand materials (Jun 11 2026 batch).
// NOTE: founder legal docs (stockholders agreement, Brewer equity) were uploaded
// then removed by request 2026-06-11 — do not re-add them here.
// to the CaneyCloud Line of Business. Modeled on import-ucaima-avitourism-deck.mjs.
import fs from "node:fs/promises";
import { config } from "dotenv";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";

config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });

const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";
const LOB_ID = "953ff0d5-177e-4826-8bb2-ab917b170d2a"; // CaneyCloud
const BUCKET = "agb-project-files";
const DL = "/Users/tomas/Downloads";

const FILES = [
  {
    label: "CaneyCloud — Operator Deck (ES, 9 slides)",
    category: "marketing",
    filePath: `${DL}/CaneyCloud-Deck.html`,
    storageName: "caneycloud-operator-deck-es.html",
    mimeType: "text/html",
    description: "Spanish operator-facing deck — 'Hecho por venezolanos, para venezolanos'. Slide 8 'Quiénes somos' has founder bios + photos; slide 9 contact (+1 786 527 5970).",
  },
  {
    label: "CaneyCloud — Folleto (ES brochure)",
    category: "marketing",
    filePath: `${DL}/CaneyCloud Folleto - Standalone.html`,
    storageName: "caneycloud-folleto-es.html",
    mimeType: "text/html",
    description: "Operator brochure: 'El sistema operativo de tu posada' — WhatsApp AI agent, +300 OTA channels, reservas/pagos/huéspedes in one place.",
  },
  {
    label: "CaneyCloud vs Cloudbeds — comparativa",
    category: "marketing",
    filePath: `${DL}/CaneyCloud vs Cloudbeds (standalone).html`,
    storageName: "caneycloud-vs-cloudbeds-es.html",
    mimeType: "text/html",
    description: "Competitive one-pager: 4 currencies one system (Bs/USD/Zelle/Pago móvil), WhatsApp-native, 100% Venezuelan team — 'lo que no se puede copiar'.",
  },
  {
    label: "CaneyCloud — Alianza C (partner program)",
    category: "business",
    filePath: `${DL}/CaneyCloud - Alianza C (standalone).html`,
    storageName: "caneycloud-alianza-c-es.html",
    mimeType: "text/html",
    description: "Partner/referral program: tiered revenue share per referred posada, affiliate links (first-year commission), founder-partner preferred terms.",
  },
];

const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [member] = await sql`
  select wm.user_id from workspace_members wm
  join users u on u.id = wm.user_id
  where wm.workspace_id = ${WORKSPACE_ID}
  order by case wm.role when 'owner' then 0 when 'admin' then 1 else 2 end, u.created_at asc
  limit 1`;
if (!member?.user_id) throw new Error("no workspace user");
const actor = member.user_id;

for (const f of FILES) {
  const data = await fs.readFile(f.filePath);
  const storagePath = `${WORKSPACE_ID}/${LOB_ID}/${f.storageName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, data, { contentType: f.mimeType, upsert: true });
  if (error) throw new Error(`upload ${f.storageName}: ${error.message}`);

  const [existing] = await sql`
    select id from project_links
    where workspace_id = ${WORKSPACE_ID} and lob_id = ${LOB_ID} and label = ${f.label} limit 1`;
  if (existing?.id) {
    await sql`
      update project_links set kind='file', category=${f.category}, url=null,
        storage_path=${storagePath}, mime_type=${f.mimeType}, size_bytes=${data.byteLength},
        original_filename=${f.storageName}, description=${f.description},
        updated_at=now(), updated_by=${actor}
      where id=${existing.id}`;
    console.log("updated:", f.label, `(${Math.round(data.byteLength/1024)} KB)`);
  } else {
    const [{ next_order }] = await sql`
      select coalesce(max(sort_order), -1) + 1 as next_order
      from project_links where lob_id=${LOB_ID} and category=${f.category}`;
    await sql`
      insert into project_links (workspace_id, lob_id, kind, category, label, url, description,
        storage_path, mime_type, size_bytes, original_filename, sort_order, created_by, updated_at, updated_by)
      values (${WORKSPACE_ID}, ${LOB_ID}, 'file', ${f.category}, ${f.label}, null, ${f.description},
        ${storagePath}, ${f.mimeType}, ${data.byteLength}, ${f.storageName}, ${next_order}, ${actor}, now(), ${actor})`;
    console.log("inserted:", f.label, `(${Math.round(data.byteLength/1024)} KB)`);
  }
}
await sql.end();
console.log("done — 4 files on CaneyCloud LoB");
