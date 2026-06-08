import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_CWD = process.cwd();
const CRM_REF = "abc123def456ghi789jk";
const CRM_SUPABASE_URL = `https://${CRM_REF}.supabase.co`;
const CRM_DATABASE_URL = `postgresql://postgres.${CRM_REF}:secret@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true`;
const OTHER_DATABASE_URL =
  "postgresql://tour_user:tour_password@localhost:5433/tour_db";

async function freshDatabaseUrlModule() {
  vi.resetModules();
  return import("@/lib/database-url");
}

function useTempCwd(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agb-crm-env-"));
  process.chdir(dir);
  return dir;
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("database URL resolution", () => {
  it("prefers this repo's .env.local over an unrelated global DATABASE_URL", async () => {
    const dir = useTempCwd();
    fs.writeFileSync(
      path.join(dir, ".env.local"),
      [
        `NEXT_PUBLIC_SUPABASE_URL=${CRM_SUPABASE_URL}`,
        `DATABASE_URL=${CRM_DATABASE_URL}`,
      ].join("\n"),
    );
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", OTHER_DATABASE_URL);

    const { getDatabaseUrl } = await freshDatabaseUrlModule();

    expect(getDatabaseUrl()).toBe(CRM_DATABASE_URL);
  });

  it("keeps a matching ambient DATABASE_URL in production-style environments", async () => {
    useTempCwd();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CRM_SUPABASE_URL);
    vi.stubEnv("DATABASE_URL", CRM_DATABASE_URL);

    const { getDatabaseUrl } = await freshDatabaseUrlModule();

    expect(getDatabaseUrl()).toBe(CRM_DATABASE_URL);
  });

  it("rejects a cross-project DATABASE_URL when no local CRM env can override it", async () => {
    useTempCwd();
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", CRM_SUPABASE_URL);
    vi.stubEnv("DATABASE_URL", OTHER_DATABASE_URL);

    const { getDatabaseUrl } = await freshDatabaseUrlModule();

    expect(() => getDatabaseUrl()).toThrow(/does not match this Supabase project|points to/);
  });
});
