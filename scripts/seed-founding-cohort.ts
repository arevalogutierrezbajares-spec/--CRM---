#!/usr/bin/env tsx
/**
 * Seed the Diagnóstico Nacional founding-cohort posadas (Wave 0-1 outreach targets).
 * Source: ~/caneycloud-launch/campaign-targets/founding-cohort.csv (48 posadas,
 * built 2026-07-11 from the Los Roques/Canaima directories + lodging harvest).
 *
 * Idempotent — stable UUIDs + ON CONFLICT DO NOTHING (channels get stable ids too,
 * so re-runs don't duplicate). Pattern: scripts/seed-leads-batch-1.ts.
 *
 *   npx tsx scripts/seed-founding-cohort.ts
 *
 * Per posada: org contact (prospect) + whatsapp/instagram channels + tags
 * `caney` + `founding-cohort`. The per-posada survey link + region live in
 * introChainFromText so they're visible on the contact card for the send.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1"; // AGB workspace (verified live)
const TOMAS_ID = "a408e392-1337-4cb3-acc5-f8c1881f1522"; // Tomas Gutierrez (verified via find_member — the id in seed-leads-batch-1.ts is stale)

const { tags, contacts, contactTags, contactChannels } = schema;

const CSV = path.join(os.homedir(), "caneycloud-launch/campaign-targets/founding-cohort.csv");

// Deterministic UUID from a seed string → idempotent re-runs (RFC-4122-shaped).
function stableId(seed: string): string {
  const h = createHash("sha256").update(`diagnostico-founding-cohort:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// +58-normalised E.164 for wa.me links ("0412 123 4567" → "+584121234567").
function toE164(phone: string): string | null {
  const d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("58")) return `+${d}`;
  if (d.startsWith("0")) return `+58${d.slice(1)}`;
  if (d.length === 10) return `+58${d}`;
  return `+${d}`;
}

// Quote-aware CSV line split (row 35's name contains a comma).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type Row = { name: string; region: string; instagram: string; phone: string; email: string; source: string; pid: string; link: string };

function loadRows(): Row[] {
  const lines = readFileSync(CSV, "utf8").trim().split("\n");
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const [name, region, instagram, phone, email, source, pid, link] = splitCsvLine(line);
    if (!name) continue;
    rows.push({ name, region, instagram, phone, email, source, pid, link });
  }
  return rows;
}

async function main() {
  const rows = loadRows();
  console.log(`=== Diagnóstico founding cohort — ${rows.length} posadas ===\n`);

  // 1. Tags: `caney` must already exist (venture tag); `founding-cohort` is ours.
  const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney")).limit(1);
  if (!caneyTag) throw new Error("'caney' venture tag missing — run db:seed first");

  await db.insert(tags).values({ name: "founding-cohort", kind: "custom" }).onConflictDoNothing();
  const [cohortTag] = await db.select().from(tags).where(eq(tags.name, "founding-cohort")).limit(1);
  console.log(`Tags ready: caney=${caneyTag.id.slice(0, 8)}…  founding-cohort=${cohortTag.id.slice(0, 8)}…\n`);

  // 2. One org contact + channels + tags per posada.
  let created = 0;
  for (const r of rows) {
    const contactId = stableId(`contact:${r.name}`);
    await db
      .insert(contacts)
      .values({
        id: contactId,
        workspaceId: WS,
        createdBy: TOMAS_ID,
        name: r.name,
        type: "org",
        organization: r.name,
        relationshipType: "prospect",
        introChainFromText: [
          "Diagnóstico Nacional founding cohort (Wave 0-1).",
          r.region ? `Región: ${r.region}.` : "",
          r.link ? `Link de encuesta: ${r.link}` : "",
          r.email ? `Email: ${r.email}.` : "",
          r.source ? `Fuente: ${r.source}.` : "",
        ].filter(Boolean).join(" "),
      })
      .onConflictDoNothing();

    const wa = r.phone ? toE164(r.phone) : null;
    if (wa) {
      await db
        .insert(contactChannels)
        .values({ id: stableId(`wa:${r.name}`), contactId, kind: "whatsapp", value: wa, isPrimary: true })
        .onConflictDoNothing();
    }
    if (r.instagram) {
      await db
        .insert(contactChannels)
        .values({ id: stableId(`ig:${r.name}`), contactId, kind: "instagram", value: r.instagram.replace(/^@/, "") })
        .onConflictDoNothing();
    }
    if (r.email) {
      await db
        .insert(contactChannels)
        .values({ id: stableId(`em:${r.name}`), contactId, kind: "email", value: r.email })
        .onConflictDoNothing();
    }
    for (const tagId of [caneyTag.id, cohortTag.id]) {
      await db.insert(contactTags).values({ contactId, tagId }).onConflictDoNothing();
    }
    created++;
    console.log(`✓ ${r.name} (${r.region})${wa ? ` · ${wa}` : ""}${r.instagram ? ` · ${r.instagram}` : ""}`);
  }

  console.log(`\nDone: ${created} posadas as prospect, tagged caney + founding-cohort.`);
  console.log("Who's left to contact = tag founding-cohort ordered by lastTouchAt (null first).");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
