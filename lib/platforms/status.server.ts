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

// Generous: Cloud Run scale-to-zero cold starts can take several seconds.
const PING_TIMEOUT_MS = 8000;

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
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      label,
      status: timedOut ? "warn" : "down",
      detail: timedOut ? `No response in ${PING_TIMEOUT_MS / 1000}s` : "Unreachable",
    };
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

/**
 * Probe CaneyCloud PMS API health. Cloud Run FastAPI exposes `/health`
 * (not `/api/v1/health`). Falls through common paths so a wrong base URL
 * still surfaces something useful.
 */
async function caneyApiHealth(baseUrl: string): Promise<PlatformCheck> {
  const root = baseUrl.replace(/\/$/, "");
  const paths = ["/health", "/api/v1/health", "/api/health"];
  let last: PlatformCheck = {
    label: "Backend API",
    status: "down",
    detail: "No health endpoint responded",
  };
  for (const path of paths) {
    const r = await ping(`${root}${path}`, "Backend API");
    if (r.status === "ok" || r.status === "warn") {
      return {
        ...r,
        detail: `${path} · ${r.detail}`,
      };
    }
    last = { ...r, detail: `${path} · ${r.detail}` };
  }
  // Hint when someone still points at the broken Vercel alias.
  if (root.includes("api.caneycloud.com")) {
    return {
      label: "Backend API",
      status: "down",
      detail:
        "api.caneycloud.com is not the PMS API — set CANEY_PMS_API_URL to Cloud Run (tour-pms-backend-*.run.app)",
    };
  }
  return last;
}

export async function caneyChecks(siteUrl: string): Promise<PlatformCheck[]> {
  const checks: Promise<PlatformCheck>[] = [ping(siteUrl, "Site")];
  const apiUrl = process.env.CANEY_PMS_API_URL;
  if (apiUrl) {
    checks.push(caneyApiHealth(apiUrl));
  } else {
    checks.push(
      Promise.resolve<PlatformCheck>({
        label: "Backend API",
        status: "off",
        detail: "Set CANEY_PMS_API_URL (Cloud Run tour-pms-backend)",
      }),
    );
  }
  return Promise.all(checks);
}
