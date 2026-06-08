/**
 * One-time importer: load the EMPLOY VENEZUELA business-model docs into AGB-CRM
 * as a single flat project whose docs are editable in the BlockNote editor.
 *
 * - Each markdown file → project_links(kind='doc') + project_doc_contents
 *   (ydoc = BlockNote Yjs state seeded from the markdown, so the editor opens
 *    with real, editable rich-text; text = markdown mirror for search/preview).
 * - The xlsx model + key CSVs → project_links(kind='file') uploaded to the
 *   agb-project-files Supabase Storage bucket.
 *
 * Run:  cd ~/AGB-CRM && set -a && . ./.env.local && set +a && \
 *       DATABASE_URL="$DATABASE_URL" npx tsx scripts/import-employ-venezuela.mts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq, and } from "drizzle-orm";
import * as Y from "yjs";
import { ServerBlockNoteEditor } from "@blocknote/server-util";
import { createClient } from "@supabase/supabase-js";
import { db, schema } from "../db";

const SRC = join(homedir(), "Downloads", "employ-venezuela");
const OWNER = "a408e392-1337-4cb3-acc5-f8c1881f1522"; // tg.2000@icloud.com
const BUCKET = "agb-project-files";

type Cat = "business" | "marketing" | "tech" | "ops" | "design" | "finance" | "other";

const DOCS: { path: string; label: string; category: Cat }[] = [
  { path: "README.md", label: "Overview — Employ Venezuela", category: "business" },
  // research/
  { path: "research/01-employ-venezuela-master-plan.md", label: "01 · Master Plan (macro employment)", category: "business" },
  { path: "research/02-data-sources-and-ai.md", label: "02 · Data Sources & AI", category: "business" },
  { path: "research/03-icg-flared-gas-to-compute.md", label: "03 · Flared-Gas-to-Compute (ICG)", category: "business" },
  { path: "research/04-tourism-recovery-study.md", label: "04 · Tourism Recovery Study", category: "business" },
  { path: "research/05-tourism-community-impact.md", label: "05 · Tourism Community Impact", category: "business" },
  { path: "research/06-tourism-stress-test-audit.md", label: "06 · Stress-Test / Red-Team", category: "business" },
  { path: "research/07-productive-linkages-market-access.md", label: "07 · Productive Linkages & Market Access", category: "business" },
  { path: "research/08-tourism-subsector-strategy.md", label: "08 · Tourism Sub-Sector Strategy", category: "business" },
  { path: "research/09-gastronomy-tourism-accelerator.md", label: "09 · Gastronomy Tourism Accelerator", category: "business" },
  { path: "research/10-investment-architecture.md", label: "10 · Investment Architecture", category: "business" },
  // business-plan/
  { path: "business-plan/00-business-plan.md", label: "Business Plan (capstone)", category: "business" },
  { path: "business-plan/01-market-sizing.md", label: "Market Sizing (TAM/SAM/SOM)", category: "business" },
  { path: "business-plan/02-los-roques-cluster.md", label: "Los Roques Cluster (worked case)", category: "business" },
  { path: "business-plan/03-financial-appendix.md", label: "Financial Appendix (computed)", category: "finance" },
  { path: "business-plan/04-team-cap-table-use-of-funds.md", label: "Team, Cap Table & Use of Funds", category: "finance" },
  { path: "business-plan/_computed_exhibits.md", label: "Computed Exhibits (model output)", category: "finance" },
  // investor/
  { path: "investor/teaser.md", label: "Investor Teaser", category: "finance" },
  { path: "investor/one-pager-diaspora-retail.md", label: "One-Pager · Diaspora & Retail", category: "finance" },
  { path: "investor/one-pager-family-office.md", label: "One-Pager · Family Office", category: "finance" },
  { path: "investor/one-pager-institutional-dfi.md", label: "One-Pager · Institutional / DFI", category: "finance" },
  { path: "investor/pitch-deck-outline.md", label: "Pitch Deck Outline", category: "finance" },
  // creators/
  { path: "creators/00-methodology.md", label: "Creators · Methodology", category: "marketing" },
  { path: "creators/01-leaderboard.md", label: "Creators · Leaderboard", category: "marketing" },
  { path: "creators/02-activation-map.md", label: "Creators · Activation Map", category: "marketing" },
  { path: "creators/03-outreach-playbook.md", label: "Creators · Outreach Playbook", category: "marketing" },
  { path: "creators/05-analytics-procurement.md", label: "Creators · Analytics Procurement", category: "marketing" },
  // registers/
  { path: "registers/assumptions-evidence-register.md", label: "Assumptions & Evidence Register", category: "business" },
];

const FILES: { path: string; label: string; category: Cat; mime: string }[] = [
  { path: "financial-models/Posada_Investment_Models.xlsx", label: "Financial Model (xlsx)", category: "finance", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  { path: "creators/venezuelan-creators.csv", label: "Creators DB (csv)", category: "marketing", mime: "text/csv" },
  { path: "creators/04-outreach-tracker.csv", label: "Outreach Tracker (csv)", category: "marketing", mime: "text/csv" },
];

function slugFilename(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot === -1 ? name : name.slice(0, dot))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  const ext = (dot === -1 ? "" : name.slice(dot)).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${base}${ext}`;
}

async function main() {
  const editor: ReturnType<typeof ServerBlockNoteEditor.create> = ServerBlockNoteEditor.create();

  // workspace id from an existing project (all live in one workspace)
  const [anyProj] = await db.select({ ws: schema.linesOfBusiness.workspaceId }).from(schema.linesOfBusiness).limit(1);
  if (!anyProj) throw new Error("No existing project to read workspaceId from");
  const workspaceId = anyProj.ws;

  // guard against duplicate runs
  const existing = await db.select({ id: schema.linesOfBusiness.id })
    .from(schema.linesOfBusiness)
    .where(and(eq(schema.linesOfBusiness.workspaceId, workspaceId), eq(schema.linesOfBusiness.title, "Employ Venezuela")))
    .limit(1);
  if (existing.length) {
    throw new Error(`Project "Employ Venezuela" already exists (${existing[0].id}). Delete it first to re-import.`);
  }

  // 1. create the project
  const [proj] = await db.insert(schema.linesOfBusiness).values({
    workspaceId,
    title: "Employ Venezuela",
    createdBy: OWNER,
    status: "active",
    tagline: "Bring employment back to Venezuela via private capital that also earns returns",
    summary:
      "The business case + business model for the Venezuela tourism investment platform — the bankable 'floor' beneath the Venezuela First World vision. Posada connectivity-and-tech anchors, a local supply-chain layer, and a retail→institutional investment ladder. A bet on post-2026 stabilization. Figures illustrative; not an offering.",
    coverEmoji: "🇻🇪",
    coverColor: "#B8913F",
    objectives: [
      "Underwrite toward ~1M arrivals (red-teamed floor), capture upside toward the 6M ceiling",
      "High-value, low-volume: compete on yield per visitor, not headcount",
      "Locally-owned posada anchors + financed local supply chains",
      "Retail→institutional instrument ladder de-risked by blended finance",
      "Phase-0 ask: instrument a 10–20 posada lighthouse pilot to convert the model from illustrative to underwritten",
    ],
    featured: true,
  }).returning({ id: schema.linesOfBusiness.id });

  const projectId = proj.id;
  console.log(`PROJECT Employ Venezuela = ${projectId}`);

  // 2. import docs (markdown → editable Yjs)
  const orderByCat: Record<string, number> = {};
  let docCount = 0;
  for (const d of DOCS) {
    const md = readFileSync(join(SRC, d.path), "utf8");
    const blocks = await editor.tryParseMarkdownToBlocks(md);
    const ydoc = editor.blocksToYDoc(blocks, "document-store");
    const b64 = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString("base64");
    const sortOrder = (orderByCat[d.category] ??= 0);
    orderByCat[d.category]++;

    const [link] = await db.insert(schema.projectLinks).values({
      workspaceId, lobId: projectId, kind: "doc", category: d.category,
      label: d.label, url: null, sortOrder, createdBy: OWNER,
    }).returning({ id: schema.projectLinks.id });

    await db.insert(schema.projectDocContents).values({
      linkId: link.id, workspaceId, ydoc: b64, text: md, updatedBy: OWNER,
    });
    await db.insert(schema.projectLinkAudits).values({
      workspaceId, lobId: projectId, linkId: link.id, actorId: OWNER,
      action: "create", before: null,
      after: { kind: "doc", label: d.label, category: d.category, source: d.path },
    });
    docCount++;
    console.log(`  doc  [${d.category}] ${d.label}`);
  }

  // 3. import files (upload to storage + kind='file' link)
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supaUrl, supaKey, { auth: { persistSession: false } });
  let fileCount = 0;
  for (const f of FILES) {
    const buf = readFileSync(join(SRC, f.path));
    const original = f.path.split("/").pop()!;
    const storagePath = `${workspaceId}/${projectId}/${crypto.randomUUID()}-${slugFilename(original)}`;
    const up = await supabase.storage.from(BUCKET).upload(storagePath, buf, { contentType: f.mime, upsert: false });
    if (up.error) { console.log(`  FILE FAILED ${f.label}: ${up.error.message}`); continue; }
    const sortOrder = (orderByCat[f.category] ??= 0);
    orderByCat[f.category]++;
    const [link] = await db.insert(schema.projectLinks).values({
      workspaceId, lobId: projectId, kind: "file", category: f.category, label: f.label,
      url: null, sortOrder, storagePath, mimeType: f.mime, sizeBytes: buf.length,
      originalFilename: original, createdBy: OWNER,
    }).returning({ id: schema.projectLinks.id });
    await db.insert(schema.projectLinkAudits).values({
      workspaceId, lobId: projectId, linkId: link.id, actorId: OWNER,
      action: "create", before: null,
      after: { kind: "file", label: f.label, category: f.category, storagePath },
    });
    fileCount++;
    console.log(`  file [${f.category}] ${f.label} (${(buf.length/1024).toFixed(0)} KB)`);
  }

  console.log(`\nDONE — project ${projectId}: ${docCount} editable docs, ${fileCount} files.`);
  console.log(`Open at: /projects/${projectId}`);
  process.exit(0);
}
main().catch((e) => { console.error("IMPORT ERROR:", e); process.exit(1); });
