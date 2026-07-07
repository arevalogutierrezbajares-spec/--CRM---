import { describe, expect, it } from "vitest";
import { MCP_TOOL_DEFINITIONS, MCP_TOOL_NAMES } from "@/lib/mcp/tools";
import { TOOLS } from "@/lib/wa-agent/tools";

const PARTNER_ROOM_TOOLS = [
  "create_partner_room",
  "partner_room_overview",
  "add_room_documents",
  "add_room_link",
  "update_partner_room",
  "set_room_branding",
  "add_room_next_step",
  "get_partner_room_link",
] as const;

describe("partner room MCP tools", () => {
  it("every allowlisted MCP tool exists in the registry", () => {
    for (const name of MCP_TOOL_NAMES) {
      expect(TOOLS[name], `allowlisted tool "${name}" missing from TOOLS`).toBeDefined();
    }
  });

  it("partner room tools are exposed over MCP", () => {
    const exposed = new Set(MCP_TOOL_DEFINITIONS.map((d) => d.name));
    for (const name of PARTNER_ROOM_TOOLS) {
      expect(exposed.has(name), `"${name}" not exposed over MCP`).toBe(true);
    }
  });

  it("definitions have MCP-shaped schemas", () => {
    for (const def of MCP_TOOL_DEFINITIONS) {
      expect(def.description.length).toBeGreaterThan(20);
      const schema = def.inputSchema as { type: string; properties: unknown };
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
    }
  });

  it("room-scoped tools accept room_id and contact fallbacks", () => {
    const roomScoped = PARTNER_ROOM_TOOLS.filter((n) => n !== "create_partner_room");
    for (const name of roomScoped) {
      const props = TOOLS[name].definition.input_schema.properties as Record<
        string,
        unknown
      >;
      expect(props.room_id, `${name} missing room_id`).toBeDefined();
      expect(props.contact_query, `${name} missing contact_query`).toBeDefined();
    }
  });
});
