#!/usr/bin/env node
// Sync the "Investor Deck — Copy (source of truth)" CRM doc into
// ~/caneycloud-launch/investor-deck.html.
//
// Loop: edit the doc in the CRM (/lob/CaneyCloud/docs/...) -> run this script
// -> changed fields are applied to the HTML -> re-verify layout + regenerate
// the PDF (script prints a reminder; Claude does this when asked to
// "sync the deck copy").
//
// Mechanics: .deck-copy-snapshot.json maps field key -> exact current string
// in the HTML. For each doc field whose transformed value differs from the
// snapshot, the old string is replaced (must occur exactly once) and the
// snapshot updated. Fields prefixed s10.series- are raw JS strings (no HTML
// escaping; straight quotes are converted to ’ so they can't break the script).
import fs from "node:fs/promises";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: new URL("../.env.local", import.meta.url).pathname, override: true, quiet: true });

const LOB_ID = "953ff0d5-177e-4826-8bb2-ab917b170d2a"; // CaneyCloud
const DOC_LABEL = "Investor Deck — Copy (source of truth)";
const DECK = "/Users/tomas/caneycloud-launch/investor-deck.html";
const SNAP = "/Users/tomas/caneycloud-launch/.deck-copy-snapshot.json";

function toHtml(docText) {
  let t = docText.trim();
  t = t.replace(/&/g, "&amp;");
  t = t.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
  t = t.replace(/ \[br\] /g, "<br>").replace(/\[br\]/g, "<br>");
  t = t.replace(/\{hot:(.*?)\}/g, '<span class="hot">$1</span>');
  t = t.replace(/\{cc:(.*?)\}/g, '<span class="c1">$1</span>');
  t = t.replace(/\{vav:(.*?)\}/g, '<span class="c2">$1</span>');
  return t;
}
function toJs(docText) {
  return docText.trim().replace(/'/g, "’"); // straight ' would close the JS string
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require" });
const [link] = await sql`
  select pl.id, pdc.text
  from project_links pl
  join project_doc_contents pdc on pdc.link_id = pl.id
  where pl.lob_id = ${LOB_ID} and pl.label = ${DOC_LABEL}
  limit 1`;
await sql.end();
if (!link) { console.error(`CRM doc not found: ${DOC_LABEL}`); process.exit(1); }

const snap = JSON.parse(await fs.readFile(SNAP, "utf8"));
let html = await fs.readFile(DECK, "utf8");

const fields = [...link.text.matchAll(/^- \*\*([a-z0-9.‐-]+(?:-\w+)*(?:\.\w+)*):\*\* (.+)$/gm)];
let changed = 0, warned = 0, seen = 0;
for (const [, key, value] of fields) {
  const entry = snap[key];
  if (!entry) { console.log(`?  unknown key (skipped): ${key}`); warned++; continue; }
  seen++;
  const next = entry.js ? toJs(value) : toHtml(value);
  if (next === entry.raw) continue;
  const count = html.split(entry.raw).length - 1;
  if (count !== 1) {
    console.log(`!  NOT applied (${count} occurrences in HTML — needs Claude): ${key}`);
    warned++;
    continue;
  }
  html = html.replace(entry.raw, next);
  entry.raw = next;
  console.log(`✓  ${key}`);
  changed++;
}

if (changed) {
  await fs.writeFile(DECK, html);
  await fs.writeFile(SNAP, JSON.stringify(snap, null, 1));
}
console.log(`\n${seen} fields read · ${changed} applied · ${warned} warnings`);
if (changed) console.log("NEXT: re-verify the deck layout and regenerate investor-deck.pdf (ask Claude: 'sync the deck copy' does both).");
else console.log("No changes — deck already matches the CRM doc.");
