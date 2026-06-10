import "server-only";

export type CheckStatus = "ok" | "warn" | "down" | "off";

export type PlatformCheck = {
  label: string;
  status: CheckStatus;
  /** Short human detail — latency, count, or what's missing. */
  detail: string;
  /** Optional admin path to jump to when the check needs attention. */
  path?: string;
};

const PING_TIMEOUT_MS = 4000;

/** GET with a hard timeout. Any response < 500 counts as reachable —
 *  gated/404 pages still prove the deployment is up. */
async function ping(url: string, label: string): Promise<PlatformCheck> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
    const ms = Date.now() - started;
    if (res.status >= 500) {
      return { label, status: "down", detail: `HTTP ${res.status}` };
    }
    return {
      label,
      status: ms > 2500 ? "warn" : "ok",
      detail: `HTTP ${res.status} · ${ms}ms`,
    };
  } catch {
    return { label, status: "down", detail: "Unreachable" };
  }
}

/** Exact row count via PostgREST HEAD — zero rows transferred. */
async function supabaseCount(
  supabaseUrl: string,
  serviceKey: string,
  table: string,
  filter: string,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/${table}?select=*&${filter}`,
      {
        method: "HEAD",
        cache: "no-store",
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "count=exact",
          Range: "0-0",
        },
      },
    );
    if (!res.ok && res.status !== 206) return null;
    const range = res.headers.get("content-range"); // e.g. "0-0/42"
    const total = range?.split("/")[1];
    if (!total || total === "*") return null;
    return Number(total);
  } catch {
    return null;
  }
}

export async function vavChecks(siteUrl: string): Promise<PlatformCheck[]> {
  const checks: Promise<PlatformCheck>[] = [ping(siteUrl, "Site")];

  const url = process.env.VAV_SUPABASE_URL;
  const key = process.env.VAV_SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    checks.push(
      supabaseCount(url, key, "provider_invites", "claimed_at=is.null").then(
        (n): PlatformCheck =>
          n === null
            ? { label: "Provider invites", status: "warn", detail: "Query failed" }
            : {
                label: "Provider invites",
                status: "ok",
                detail: `${n} unclaimed`,
                path: "/admin/provider-invites",
              },
      ),
      supabaseCount(url, key, "creator_invites", "claimed_at=is.null").then(
        (n): PlatformCheck =>
          n === null
            ? { label: "Creator invites", status: "warn", detail: "Query failed" }
            : {
                label: "Creator invites",
                status: "ok",
                detail: `${n} unclaimed`,
                path: "/admin/creators",
              },
      ),
    );
  } else {
    checks.push(
      Promise.resolve<PlatformCheck>({
        label: "Live stats",
        status: "off",
        detail: "Set VAV_SUPABASE_URL + VAV_SUPABASE_SERVICE_ROLE_KEY",
      }),
    );
  }
  return Promise.all(checks);
}

export async function caneyChecks(siteUrl: string): Promise<PlatformCheck[]> {
  const checks: Promise<PlatformCheck>[] = [ping(siteUrl, "Site")];
  const apiUrl = process.env.CANEY_PMS_API_URL;
  if (apiUrl) {
    checks.push(ping(apiUrl, "Backend API"));
  } else {
    checks.push(
      Promise.resolve<PlatformCheck>({
        label: "Backend API",
        status: "off",
        detail: "Set CANEY_PMS_API_URL",
      }),
    );
  }
  return Promise.all(checks);
}
