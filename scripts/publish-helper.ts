/**
 * Publish a built+zipped macOS Capture Helper to the CRM downloads bucket so
 * workspace members can download it from Settings → Configurations → Call
 * Capture. Called by macos-helper/scripts/release.sh.
 *
 *   npx tsx scripts/publish-helper.ts <zipPath> <version> [notes]
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [, , zipPath, version, notes] = process.argv;

const DOWNLOADS_BUCKET = "agb-downloads";
const HELPER_MANIFEST_PATH = "macos-helper/latest.json";

async function main() {
  if (!zipPath || !version) {
    console.error("usage: tsx scripts/publish-helper.ts <zipPath> <version> [notes]");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const bytes = readFileSync(zipPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const objectPath = `macos-helper/AGB-AI-${version}.zip`;

  // Ensure the private bucket exists (idempotent).
  await supabase.storage.createBucket(DOWNLOADS_BUCKET, { public: false }).catch(() => {});

  const up = await supabase.storage
    .from(DOWNLOADS_BUCKET)
    .upload(objectPath, bytes, { contentType: "application/zip", upsert: true });
  if (up.error) {
    console.error("upload failed:", up.error.message);
    process.exit(1);
  }

  const manifest = {
    version,
    objectPath,
    bytes: bytes.length,
    sha256,
    publishedAt: new Date().toISOString(),
    ...(notes ? { notes } : {}),
  };
  const man = await supabase.storage
    .from(DOWNLOADS_BUCKET)
    .upload(HELPER_MANIFEST_PATH, Buffer.from(JSON.stringify(manifest, null, 2)), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (man.error) {
    console.error("manifest upload failed:", man.error.message);
    process.exit(1);
  }

  // Read-back so a silent CDN/stale miss can't leave cofounders on an old build.
  const check = await supabase.storage.from(DOWNLOADS_BUCKET).download(HELPER_MANIFEST_PATH);
  if (check.error || !check.data) {
    console.error("manifest read-back failed:", check.error?.message ?? "empty");
    process.exit(1);
  }
  const read = JSON.parse(await check.data.text()) as { version?: string; objectPath?: string };
  if (read.version !== version || read.objectPath !== objectPath) {
    console.error("manifest read-back mismatch:", read);
    process.exit(1);
  }

  console.log(`✓ published AGB AI ${version} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  object: ${DOWNLOADS_BUCKET}/${objectPath}`);
  console.log(`  sha256: ${sha256}`);
  console.log("  cofounders can now download it from Settings → Configurations → Call Capture.");
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
