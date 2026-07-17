import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import {
  caneyChecks,
  vavChecks,
  type CheckStatus,
  type PlatformCheck,
} from "@/lib/platforms/status.server";
import { PLATFORMS } from "@/lib/platforms/config";

export type StationLiveHealth = {
  status: CheckStatus;
  detail: string;
  path?: string;
  /** Structural health from the graph is separate; this is live probe only. */
  source: "platforms";
};

function worst(checks: PlatformCheck[]): PlatformCheck {
  const rank: Record<CheckStatus, number> = {
    down: 0,
    warn: 1,
    off: 2,
    ok: 3,
  };
  return checks.slice().sort((a, b) => rank[a.status] - rank[b.status])[0] ?? {
    label: "none",
    status: "off",
    detail: "No checks",
  };
}

/**
 * GET /api/brain/health
 * Maps existing platforms probes onto interchange station ids.
 * Missing env → off (not red). Never returns secrets.
 */
export async function GET() {
  try {
    await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const vavUrl =
    PLATFORMS.find((p) => p.id === "vav")?.baseUrl ?? process.env.VAV_SITE_URL ?? "";
  const caneyUrl =
    PLATFORMS.find((p) => p.id === "caneycloud")?.baseUrl ??
    process.env.CANEY_SITE_URL ??
    "";

  const [vav, caney] = await Promise.all([
    vavUrl
      ? vavChecks(vavUrl)
      : Promise.resolve<PlatformCheck[]>([
          { label: "VAV", status: "off", detail: "No VAV base URL configured", path: "/platforms" },
        ]),
    caneyUrl
      ? caneyChecks(caneyUrl)
      : Promise.resolve<PlatformCheck[]>([
          {
            label: "Caney",
            status: "off",
            detail: "No Caney base URL configured",
            path: "/platforms",
          },
        ]),
  ]);

  const vavW = worst(vav);
  const caneyW = worst(caney);

  const stations: Record<string, StationLiveHealth> = {
    // ix1 VAV ↔ Caney PMS
    ix1: {
      status: worst([vavW, caneyW]).status,
      detail: `VAV: ${vavW.detail} · Caney: ${caneyW.detail}`,
      path: "/platforms",
      source: "platforms",
    },
    // ix2 CRM → VAV service-role
    ix2: {
      status: vavW.status,
      detail: vavW.detail,
      path: vavW.path ?? "/platforms",
      source: "platforms",
    },
    // ix3 CRM → Caney onboarding
    ix3: {
      status: caneyW.status,
      detail: caneyW.detail,
      path: "/posada-onboarding",
      source: "platforms",
    },
    // ix4 Caney MCP → CRM
    ix4: {
      status: caneyW.status,
      detail: caneyW.detail,
      path: "/platforms",
      source: "platforms",
    },
    // ix5 Overlord sync (CRM internal) — no external probe; mark ok when app is up
    ix5: {
      status: "ok",
      detail: "CRM process up (structural check only)",
      path: "/overlord",
      source: "platforms",
    },
    // ix6 Restaurants host_mount — often dark; off unless configured
    ix6: {
      status: process.env.CANEY_PMS_API_URL ? caneyW.status : "off",
      detail: process.env.CANEY_PMS_API_URL
        ? caneyW.detail
        : "Restaurant module gated (set CANEY_PMS_API_URL for probe)",
      path: "/platforms",
      source: "platforms",
    },
  };

  return NextResponse.json(
    { stations, generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, max-age=45" } },
  );
}
