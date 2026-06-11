import fs from "node:fs";
import path from "node:path";

let localEnvCache: Record<string, string> | null = null;

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readProjectLocalEnv(): Record<string, string> {
  if (localEnvCache) return localEnvCache;
  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      out[line.slice(0, eq).trim()] = parseEnvValue(line.slice(eq + 1));
    }
  } catch {
    /* .env.local is optional in CI and production. */
  }
  localEnvCache = out;
  return out;
}

export function loadProjectLocalEnvIntoProcess(opts?: {
  override?: boolean;
}): void {
  const localEnv = readProjectLocalEnv();
  for (const [key, value] of Object.entries(localEnv)) {
    if (opts?.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function supabaseProjectRefFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseUrlMatchesRef(raw: string, projectRef: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.hostname === `db.${projectRef}.supabase.co` ||
      url.username === `postgres.${projectRef}`
    );
  } catch {
    return false;
  }
}

function safeDatabaseDescription(raw: string | undefined): string {
  if (!raw) return "missing";
  try {
    const url = new URL(raw);
    const user = url.username ? `${url.username}@` : "";
    const port = url.port ? `:${url.port}` : "";
    return `${user}${url.hostname}${port}${url.pathname}`;
  } catch {
    return "invalid URL";
  }
}

export function getDatabaseUrl(): string {
  const localEnv = readProjectLocalEnv();
  const projectRef =
    supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    supabaseProjectRefFromUrl(localEnv.NEXT_PUBLIC_SUPABASE_URL);
  const ambientUrl = process.env.DATABASE_URL;
  const localUrl = localEnv.DATABASE_URL;

  // Integration tests run against a disposable local Postgres and TRUNCATE
  // tables between tests. The .env.local preference below must never reroute
  // them to the real Supabase database — that would truncate production. The
  // test runner opts in explicitly and only a non-Supabase URL is honored.
  if (
    process.env.AGB_INTEGRATION_TEST_DB === "1" &&
    ambientUrl &&
    !isSupabaseDatabaseUrl(ambientUrl)
  ) {
    return ambientUrl;
  }

  let selected = ambientUrl;
  if (
    process.env.NODE_ENV !== "production" &&
    localUrl &&
    projectRef &&
    (!ambientUrl || !databaseUrlMatchesRef(ambientUrl, projectRef))
  ) {
    selected = localUrl;
  }

  if (!selected) {
    throw new Error(
      "DATABASE_URL is not set. Set it in .env.local before running DB-backed actions.",
    );
  }

  if (
    projectRef &&
    !databaseUrlMatchesRef(selected, projectRef) &&
    process.env.NODE_ENV !== "test" &&
    process.env.AGB_ALLOW_NON_SUPABASE_DATABASE_URL !== "1"
  ) {
    throw new Error(
      `DATABASE_URL points to ${safeDatabaseDescription(
        selected,
      )}, but NEXT_PUBLIC_SUPABASE_URL is project ${projectRef}. Unset the global DATABASE_URL or set AGB_ALLOW_NON_SUPABASE_DATABASE_URL=1 for intentional local DB use.`,
    );
  }

  return selected;
}

export function isSupabaseDatabaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      url.hostname.endsWith(".supabase.co") ||
      url.hostname.endsWith(".pooler.supabase.com")
    );
  } catch {
    return false;
  }
}
