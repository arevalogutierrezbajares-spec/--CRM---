import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { getDatabaseUrl, isSupabaseDatabaseUrl } from "@/lib/database-url";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const connectionString = getDatabaseUrl();
  const client = postgres(connectionString, {
    prepare: false,
    ssl: isSupabaseDatabaseUrl(connectionString) ? "require" : undefined,
    // Supabase forces an empty search_path for the postgres role. Tell every
    // connection to look in `public` (where our tables live) + `extensions`
    // (where Supabase keeps pgcrypto, uuid-ossp, etc.) so unqualified table
    // names resolve correctly.
    connection: { search_path: "public, extensions" },
  });
  _db = drizzle(client, { schema });
  return _db;
}

// Proxy so existing `import { db }` call sites keep working — connection
// is only established on first property access.
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});

export { schema };
