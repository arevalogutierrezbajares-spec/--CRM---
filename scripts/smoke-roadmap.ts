import "dotenv/config";
/* E2E smoke vs LIVE DB: round-trip identity + plan ledger. Read-mostly; the
   one inserted plan_version row is deleted at the end. */
import { db } from "@/db";
import { planVersions, workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  buildOwnerMaps,
  buildRoadmapSnapshot,
  createPlanVersion,
  getPlanVersion,
  listUnassignedTasks,
  listUnlinkedActionItems,
  nextPlanVersionNumber,
  getPlanDocData,
} from "@/db/queries/roadmap";
import { diffRoadmap, generateRoadmapMd, parseRoadmapMd, resolveSnapshotTokens } from "@/lib/roadmap-md";
import { computePlanDrift, driftIsEmpty } from "@/lib/plan-drift";

async function main() {
  // pick the workspace that actually has initiatives (not e2e leftovers)
  const all = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces);
  let ws = all[0];
  let best = -1;
  for (const w of all) {
    const s = await buildRoadmapSnapshot(w.id);
    if (s.initiatives.length > best) { best = s.initiatives.length; ws = w; }
  }
  if (!ws) throw new Error("no workspace");
  console.log("workspace:", ws.name);

  const ownerMaps = await buildOwnerMaps(ws.id);
  console.log("members:", [...ownerMaps.handleByUserId.values()].join(", "));

  const snapshot = await buildRoadmapSnapshot(ws.id, ownerMaps);
  console.log("initiatives:", snapshot.initiatives.length, "tasks:", snapshot.initiatives.reduce((n,i)=>{const c=(ts:{children:unknown[]}[]):number=>ts.reduce((m,t)=>m+1+c(t.children as {children:unknown[]}[]),0);return n+c(i.tasks)},0));

  const version = await nextPlanVersionNumber(ws.id);
  const md = generateRoadmapMd(snapshot, { planVersion: version });
  console.log("export bytes:", md.length, "→ plan v" + version);

  // round-trip identity vs live data (NFR-R6)
  const parsed = parseRoadmapMd(md);
  const known = new Set([...ownerMaps.userIdByHandle.keys()]);
  const diff = diffRoadmap(parsed, snapshot, snapshot, known);
  console.log("round-trip changes:", diff.changes.length, "(must be 0)", "issues:", diff.issues.length, "unknownOwners:", diff.unknownOwners.length);
  if (diff.changes.length !== 0) {
    console.log(JSON.stringify(diff.changes.slice(0,5), null, 1));
    throw new Error("ROUND-TRIP IDENTITY FAILED");
  }

  // plan ledger insert/read/delete
  const row = await createPlanVersion({ workspaceId: ws.id, version, source: "export", snapshotMd: md, note: "e2e-smoke", createdBy: null });
  const back = await getPlanVersion(ws.id, version);
  if (!back || back.snapshotMd !== md) throw new Error("LEDGER READBACK FAILED");
  // base resolution + drift vs self
  const baseParsed = parseRoadmapMd(back.snapshotMd);
  const base = resolveSnapshotTokens(baseParsed.initiatives, snapshot);
  const drift = computePlanDrift(base, snapshot);
  console.log("drift vs self empty:", driftIsEmpty(drift), "(must be true)");
  if (!driftIsEmpty(drift)) throw new Error("DRIFT VS SELF NOT EMPTY");
  await db.delete(planVersions).where(eq(planVersions.id, row.id));
  console.log("ledger row cleaned up");

  const [unassigned, unlinked, docData] = await Promise.all([
    listUnassignedTasks(ws.id),
    listUnlinkedActionItems(ws.id),
    getPlanDocData(ws.id),
  ]);
  console.log("unassigned tasks:", unassigned.length, "| unlinked action items:", unlinked.length, "| plan-doc initiatives:", docData.initiatives.length, "| members:", docData.members.length);
  console.log("SMOKE OK");
  process.exit(0);
}
main().catch((e) => { console.error("SMOKE FAILED:", e?.message ?? e); process.exit(1); });
