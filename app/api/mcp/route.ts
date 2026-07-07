import { NextResponse, type NextRequest } from "next/server";
import { resolveTokenToContext } from "@/lib/mcp/oauth.server";
import { requestOrigin } from "@/lib/mcp/origin";
import { MCP_TOOL_DEFINITIONS, executeMcpTool } from "@/lib/mcp/tools";
import type { ToolContext } from "@/lib/wa-agent/tools";

const SERVER_INFO = { name: "AGB CRM MCP", title: "AGB CRM MCP", version: "0.1.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

function result(id: JsonRpcId, data: unknown) {
  return { jsonrpc: "2.0" as const, id, result: data };
}
function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

/** Map a wa-agent ToolResult onto an MCP tools/call result. */
function toToolResult(r: Awaited<ReturnType<typeof executeMcpTool>>) {
  if (r.ok) {
    // The text block must carry the data too — clients that render only
    // content[0].text would otherwise lose ids/links that exist solely in
    // structuredContent (fatal for one-time-visible access links).
    const dataText =
      typeof r.data === "string" ? r.data : (JSON.stringify(r.data) ?? "");
    const text = [r.speak, dataText].filter(Boolean).join("\n") || "Done.";
    const out: Record<string, unknown> = {
      content: [{ type: "text", text }],
      isError: false,
    };
    if (r.data && typeof r.data === "object") out.structuredContent = r.data;
    return out;
  }
  return { content: [{ type: "text", text: r.error }], isError: true };
}

async function dispatch(
  msg: JsonRpcRequest,
  ctx: ToolContext,
): Promise<object | null> {
  const id = msg.id ?? null;
  switch (msg.method) {
    case "initialize": {
      const requested = (msg.params?.protocolVersion as string) || DEFAULT_PROTOCOL;
      return result(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    }
    case "notifications/initialized":
      return null; // notification — no response
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: MCP_TOOL_DEFINITIONS });
    case "tools/call": {
      const name = msg.params?.name;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (typeof name !== "string") {
        return error(id, -32602, "tools/call requires a string 'name'.");
      }
      const r = await executeMcpTool(name, args, ctx);
      return result(id, toToolResult(r));
    }
    default:
      // Notifications we don't handle get silently acked; requests get an error.
      if (msg.id === undefined) return null;
      return error(id, -32601, `Method not found: ${msg.method}`);
  }
}

function unauthorized(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  return NextResponse.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      },
    },
  );
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  if (!bearer) return unauthorized(req);

  const ctx = await resolveTokenToContext(bearer, new Date());
  if (!ctx) return unauthorized(req);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(error(null, -32700, "Parse error"), { status: 400 });
  }

  // Support single requests and batches.
  if (Array.isArray(body)) {
    const responses = (
      await Promise.all(body.map((m) => dispatch(m as JsonRpcRequest, ctx)))
    ).filter((r): r is object => r !== null);
    if (responses.length === 0) return new NextResponse(null, { status: 202 });
    return NextResponse.json(responses);
  }

  const out = await dispatch(body as JsonRpcRequest, ctx);
  if (out === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(out);
}

export async function GET() {
  // This server is stateless and doesn't offer a standalone SSE stream.
  return new NextResponse("Method Not Allowed", { status: 405 });
}
