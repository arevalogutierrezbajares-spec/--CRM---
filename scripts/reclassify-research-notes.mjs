// One-shot: re-classify all research_notes by their rel_path using the same
// rules as lib/note-classifier.ts. Inline copy here so we can run it from Node
// without TS compilation.

import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres.uktrhbvdamzfzbnhuwhn:ArevaloGutierrez%211234@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true";

const sql = postgres(DATABASE_URL, { prepare: false, ssl: "require" });
const WORKSPACE_ID = "11111111-2222-3333-4444-aaaaaaaaaaa1";

const RESEARCH_FOLDERS = new Set([
  "research", "caco-brain", "brainstorming",
  "Sources", "Concepts", "Entities", "Comparisons",
]);

const PRODUCT_FOLDERS = new Set([
  "_tasks", "handoffs", "VAV-Commission-Hardening",
  "pms-integration", "OTA - PMS", "Posada-PMS",
  "Data-Schemas", "Operations",
]);

const PRODUCT_NAME_PARTS = [
  "fr-", "task-", "prd", "wave", "handoff", "migration", "audit",
  "sprint", "session-log", "runbook", "todo", "build-plan", "remaining",
  "roadmap", "implementation-plan", "hardening-plan", "test-plan",
  "sequencing", "contract-freeze", "nfr-report",
  "_board", "_dag", "_contracts", "_protocol", "goal-runbook",
  "claude-md", "project-instructions",
];

const RESEARCH_NAME_PARTS = [
  "whitepaper", "knowledge-base", "reference", "standards", "industry",
  "methodology", "business-plan", "vision", "playbook", "index",
  "agent-profile", "framework",
];

function classify(relPath) {
  const parts = relPath.split("/");
  const base = parts[parts.length - 1].toLowerCase();

  for (const seg of parts) {
    if (PRODUCT_FOLDERS.has(seg)) {
      if (parts.includes("research")) return "research";
      if (parts.includes("caco-brain")) return "research";
      return "product";
    }
  }
  for (const seg of parts) {
    if (RESEARCH_FOLDERS.has(seg)) return "research";
  }
  for (const p of PRODUCT_NAME_PARTS) {
    if (base.includes(p)) return "product";
  }
  if (/^\d{2}[-_]/.test(base)) return "product";
  for (const p of RESEARCH_NAME_PARTS) {
    if (base.includes(p)) return "research";
  }
  return "note";
}

async function main() {
  console.log("Reclassifying notes…\n");
  const rows = await sql`
    SELECT id, rel_path, kind FROM research_notes
    WHERE workspace_id = ${WORKSPACE_ID}
  `;
  const counts = { research: 0, product: 0, note: 0, changed: 0 };
  for (const r of rows) {
    const next = classify(r.rel_path);
    counts[next] += 1;
    if (next !== r.kind) {
      await sql`UPDATE research_notes SET kind = ${next} WHERE id = ${r.id}`;
      counts.changed += 1;
    }
  }
  console.log(`Total:    ${rows.length}`);
  console.log(`Research: ${counts.research}`);
  console.log(`Product:  ${counts.product}`);
  console.log(`Note:     ${counts.note}`);
  console.log(`Updated:  ${counts.changed}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
