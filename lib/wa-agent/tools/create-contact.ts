import { db, schema } from "@/db";
import { safeStr, type ToolEntry } from "./_types";

const { contacts } = schema;

export const createContact: ToolEntry = {
  definition: {
    name: "create_contact",
    description:
      "Create a new contact. Use ONLY after find_contact returned no matches AND the user " +
      "confirmed creation (explicit 'yes' in their most recent message). For ambiguous cases " +
      "where you're unsure whether to add, call propose_add_contact instead, which stages a " +
      "proposal for confirmation.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        type: { type: "string", enum: ["person", "org"] },
        relationship: {
          type: "string",
          enum: ["friend", "lead", "partner", "prospect"],
        },
        organization: { type: "string" },
        intro: {
          type: "string",
          description:
            "Free-text intro chain — who introduced you, where you met.",
        },
      },
      required: ["name"],
    },
  },
  async execute(input, ctx) {
    const name = safeStr(input.name, 120);
    if (!name) return { ok: false, error: "name is required" };
    const [row] = await db
      .insert(contacts)
      .values({
        name,
        type: (input.type as "person" | "org") ?? "person",
        relationshipType:
          (input.relationship as
            | "friend"
            | "lead"
            | "partner"
            | "prospect") ?? "prospect",
        organization: safeStr(input.organization) || null,
        introChainFromText: safeStr(input.intro) || null,
        workspaceId: ctx.workspaceId,
        createdBy: ctx.userId,
      })
      .returning({ id: contacts.id, name: contacts.name });
    return {
      ok: true,
      data: row,
      speak: `Created contact ${row.name}.`,
    };
  },
};
