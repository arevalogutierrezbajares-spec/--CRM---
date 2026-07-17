/**
 * Thin HTTP client for the VAV storefront internal API (Phase 0).
 * Signs requests with HMAC-SHA256 over `timestamp:body` using
 * VAV_STOREFRONT_SERVICE_SECRET — mirrors VAV's lib/storefront/service-auth.ts.
 */
import { createHmac } from "node:crypto";

function baseUrl(): string {
  const url =
    process.env.VAV_STOREFRONT_BASE_URL ??
    process.env.VAV_BASE_URL ??
    process.env.NEXT_PUBLIC_VAV_URL ??
    "";
  return url.replace(/\/$/, "");
}

function secret(): string | null {
  return process.env.VAV_STOREFRONT_SERVICE_SECRET ?? null;
}

function sign(
  body: string,
  nowMs = Date.now(),
): { "x-vav-signature": string; "x-vav-timestamp": string; "x-vav-sig-version": string } {
  const s = secret();
  if (!s) throw new Error("VAV_STOREFRONT_SERVICE_SECRET is not configured");
  const timestamp = Math.floor(nowMs / 1000);
  const sig = createHmac("sha256", s).update(`${timestamp}:${body}`).digest("hex");
  return {
    "x-vav-signature": sig,
    "x-vav-timestamp": String(timestamp),
    "x-vav-sig-version": "1",
  };
}

export type VavCreateStorefrontRequestInput = {
  subject_type?: "provider" | "agent";
  subject_id: string;
  brief?: Record<string, unknown>;
  requested_by?: string;
};

export type VavCreateStorefrontRequestResult =
  | { ok: true; request_id: string; status: string }
  | { ok: false; error: string; status?: number; detail?: unknown };

export type VavListStorefrontQueueResult =
  | {
      ok: true;
      items: Array<{
        request_id: string;
        subject: { type: string; id: string };
        status: string;
        brief_summary: string;
        created_at?: string;
      }>;
    }
  | { ok: false; error: string; status?: number; detail?: unknown };

export async function vavCreateStorefrontRequest(
  input: VavCreateStorefrontRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<VavCreateStorefrontRequestResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: "VAV_STOREFRONT_BASE_URL is not configured" };
  if (!secret()) return { ok: false, error: "VAV_STOREFRONT_SERVICE_SECRET is not configured" };

  const body = JSON.stringify({
    subject_type: input.subject_type ?? "provider",
    subject_id: input.subject_id,
    brief: input.brief ?? {},
    ...(input.requested_by ? { requested_by: input.requested_by } : {}),
  });
  const headers = sign(body);

  try {
    const res = await fetchImpl(`${root}/api/internal/storefront/v1/requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.error ?? `HTTP ${res.status}`),
        status: res.status,
        detail: json,
      };
    }
    return {
      ok: true,
      request_id: String(json.request_id),
      status: String(json.status ?? "requested"),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type VavGenerateDraftResult =
  | {
      ok: true;
      page_id: string;
      version: number;
      preview_url: string;
      preview_path: string;
      preview_token?: string;
    }
  | { ok: false; error: string; status?: number; detail?: unknown };

export type VavPreviewLinkResult =
  | {
      ok: true;
      page_id: string;
      version: number;
      state: string;
      preview_url: string;
      preview_path: string;
    }
  | { ok: false; error: string; status?: number; detail?: unknown };

export async function vavGenerateStorefrontDraft(
  input: { request_id: string; guidance?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<VavGenerateDraftResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: "VAV_STOREFRONT_BASE_URL is not configured" };
  if (!secret()) return { ok: false, error: "VAV_STOREFRONT_SERVICE_SECRET is not configured" };

  const body = JSON.stringify({
    request_id: input.request_id,
    ...(input.guidance ? { guidance: input.guidance } : {}),
  });
  const headers = sign(body);

  try {
    const res = await fetchImpl(`${root}/api/internal/storefront/v1/generate-draft`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.error ?? `HTTP ${res.status}`),
        status: res.status,
        detail: json,
      };
    }
    return {
      ok: true,
      page_id: String(json.page_id),
      version: Number(json.version) || 1,
      preview_url: String(json.preview_url),
      preview_path: String(json.preview_path ?? ""),
      preview_token: json.preview_token ? String(json.preview_token) : undefined,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function vavGetStorefrontPreviewLink(
  pageId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VavPreviewLinkResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: "VAV_STOREFRONT_BASE_URL is not configured" };
  if (!secret()) return { ok: false, error: "VAV_STOREFRONT_SERVICE_SECRET is not configured" };

  const headers = sign("");
  const qs = `?page_id=${encodeURIComponent(pageId)}`;

  try {
    const res = await fetchImpl(`${root}/api/internal/storefront/v1/preview-link${qs}`, {
      method: "GET",
      headers: { ...headers },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.error ?? `HTTP ${res.status}`),
        status: res.status,
        detail: json,
      };
    }
    return {
      ok: true,
      page_id: String(json.page_id),
      version: Number(json.version) || 1,
      state: String(json.state ?? "draft"),
      preview_url: String(json.preview_url),
      preview_path: String(json.preview_path ?? ""),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function vavListStorefrontQueue(
  status?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<VavListStorefrontQueueResult> {
  const root = baseUrl();
  if (!root) return { ok: false, error: "VAV_STOREFRONT_BASE_URL is not configured" };
  if (!secret()) return { ok: false, error: "VAV_STOREFRONT_SERVICE_SECRET is not configured" };

  const headers = sign("");
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";

  try {
    const res = await fetchImpl(`${root}/api/internal/storefront/v1/queue${qs}`, {
      method: "GET",
      headers: { ...headers },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.error ?? `HTTP ${res.status}`),
        status: res.status,
        detail: json,
      };
    }
    return {
      ok: true,
      items: (Array.isArray(json.items) ? json.items : []) as VavListStorefrontQueueResult extends {
        ok: true;
        items: infer I;
      }
        ? I
        : never,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
