import { and, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts } = schema;

export const findContact: ToolEntry = {
  definition: {
    name: "find_contact",
    description:
      "Fuzzy-search the workspace's contacts by name, organization, or channel value. " +
      "Returns up to 5 matches. Use this BEFORE any tool that needs a contact_id.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name, org, or partial phone/email to match",
        },
      },
      required: ["query"],
    },
  },
  async execute(input, ctx) {
    const q = safeStr(input.query, 120);
    if (!q) return { ok: false, error: "query is required" };
    const like = `%${q}%`;
    const direct = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        relationshipType: contacts.relationshipType,
        organization: contacts.organization,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, ctx.workspaceId),
          eq(contacts.archived, false),
          or(ilike(contacts.name, like), ilike(contacts.organization, like)),
        ),
      )
      .limit(5);

    const matches = direct.map((r) => ({
      id: r.id,
      name: r.name,
      relationship: r.relationshipType,
      organization: r.organization,
    }));

    return {
      ok: true,
      data: { matches },
      speak:
        matches.length === 0
          ? `No contacts match "${q}".`
          : matches.length === 1
            ? `Found ${matches[0].name}.`
            : `Found ${matches.length} matches.`,
    };
  },
};
