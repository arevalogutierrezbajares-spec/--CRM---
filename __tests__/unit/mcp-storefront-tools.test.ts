import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MCP_TOOL_DEFINITIONS, MCP_TOOL_NAMES, executeMcpTool } from "@/lib/mcp/tools";
import { TOOLS } from "@/lib/wa-agent/tools";
import type { ToolContext } from "@/lib/wa-agent/tools/_types";

const STOREFRONT_TOOLS = [
  "create_storefront_request",
  "list_storefront_queue",
  "generate_storefront_draft",
  "get_storefront_preview_link",
] as const;

const ctx: ToolContext = {
  workspaceId: "ws-1",
  userId: "user-1",
  workspaceRole: "owner",
  ownerTimezone: "America/Caracas",
  now: new Date("2026-07-15T12:00:00Z"),
};

describe("storefront MCP tools (Phase 0)", () => {
  it("are registered in TOOLS and exposed over MCP", () => {
    for (const name of STOREFRONT_TOOLS) {
      expect(TOOLS[name], `${name} missing from TOOLS`).toBeDefined();
      expect(MCP_TOOL_NAMES.includes(name as (typeof MCP_TOOL_NAMES)[number])).toBe(true);
    }
    const exposed = new Set(MCP_TOOL_DEFINITIONS.map((d) => d.name));
    for (const name of STOREFRONT_TOOLS) {
      expect(exposed.has(name), `${name} not on MCP`).toBe(true);
    }
  });

  it("definitions have MCP-shaped schemas", () => {
    for (const name of STOREFRONT_TOOLS) {
      const def = TOOLS[name].definition;
      expect(def.description.length).toBeGreaterThan(20);
      expect(def.input_schema.type).toBe("object");
    }
  });
});

describe("storefront tool executors call the VAV client contract", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.VAV_STOREFRONT_BASE_URL = "https://vav.example";
    process.env.VAV_STOREFRONT_SERVICE_SECRET = "agb-test-secret";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("create_storefront_request POSTs signed body to VAV and returns request_id", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://vav.example/api/internal/storefront/v1/requests");
      expect(init?.method).toBe("POST");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-vav-signature"]).toMatch(/^[0-9a-f]+$/);
      expect(headers["x-vav-timestamp"]).toMatch(/^\d+$/);
      const body = JSON.parse(String(init?.body));
      expect(body.subject_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      expect(body.brief.goals).toBe("jungle camp");
      return new Response(JSON.stringify({ request_id: "req-42", status: "requested" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeMcpTool(
      "create_storefront_request",
      {
        provider_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        goals: "jungle camp",
      },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { request_id: string }).request_id).toBe("req-42");
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("list_storefront_queue GETs signed empty body and returns items", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/api/internal/storefront/v1/queue");
      expect(init?.method).toBe("GET");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-vav-signature"]).toBeTruthy();
      return new Response(
        JSON.stringify({
          items: [
            {
              request_id: "req-1",
              subject: { type: "provider", id: "p1" },
              status: "requested",
              brief_summary: "eco",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeMcpTool("list_storefront_queue", {}, ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { count: number }).count).toBe(1);
    }
  });

  it("rejects create when provider_id is missing", async () => {
    const result = await executeMcpTool("create_storefront_request", {}, ctx);
    expect(result.ok).toBe(false);
  });

  it("generate_storefront_draft POSTs to generate-draft endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/api/internal/storefront/v1/generate-draft");
      expect(init?.method).toBe("POST");
      return new Response(
        JSON.stringify({
          page_id: "page-1",
          version: 1,
          preview_url: "https://vav.example/s/x/preview?token=abc",
          preview_path: "/s/x/preview?token=abc",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeMcpTool(
      "generate_storefront_draft",
      { request_id: "550e8400-e29b-41d4-a716-446655440001" },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("get_storefront_preview_link GETs preview-link endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain("/api/internal/storefront/v1/preview-link");
      expect(String(url)).toContain("page_id=");
      return new Response(
        JSON.stringify({
          page_id: "page-1",
          version: 1,
          state: "draft",
          preview_url: "https://vav.example/s/x/preview?token=abc",
          preview_path: "/s/x/preview?token=abc",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await executeMcpTool(
      "get_storefront_preview_link",
      { page_id: "550e8400-e29b-41d4-a716-446655440099" },
      ctx,
    );
    expect(result.ok).toBe(true);
  });
});
