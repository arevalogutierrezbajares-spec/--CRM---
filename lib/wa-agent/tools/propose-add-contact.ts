/**
 * propose_add_contact — proactively surface an unknown name for potential
 * addition to the CRM, with an explicit confirmation gate.
 *
 * This tool does NOT write to the DB. It returns a structured proposal that
 * the agent can relay to the user ("X isn't in the CRM — should I add them?").
 * The actual creation happens via create_contact after the user confirms.
 *
 * The workflow gate (requireConfirmation=true on contact_add) ensures the
 * agent only calls create_contact once the user has said yes.
 */

import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { safeStr, type ToolEntry } from "./_types";

const { contacts } = schema;

export const proposeAddContact: ToolEntry = {
  definition: {
    name: "propose_add_contact",
    description:
      "Check if a person/company is already in the CRM and, if not, propose adding them. " +
      "Returns either the existing match (so you can use that contact_id) or a proposal asking " +
      "the user to confirm creation. Call this when you notice an unrecognized name in conversation " +
      "before calling create_contact.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Full name or company name to check.",
        },
        context: {
          type: "string",
          description:
            "Short context sentence explaining where this name came from (e.g. 'mentioned in note about marketing meeting').",
        },
        relationship_type: {
          type: "string",
          enum: ["lead", "partner", "investor", "advisor", "vendor", "other"],
          description: "Best guess at relationship type based on context.",
        },
      },
      required: ["name"],
    },
  },

  async execute(input, ctx) {
    const name = safeStr(input.name, 200);
    const context = safeStr(input.context, 500);
    const relationshipType = safeStr(input.relationship_type) || "lead";

    if (!name) return { ok: false, error: "name is required" };

    // Fuzzy search across all workspace contacts, then filter in JS
    const ownedAll = await db
      .select({ id: contacts.id, name: contacts.name, type: contacts.type })
      .from(contacts)
      .where(eq(contacts.workspaceId, ctx.workspaceId));

    const lowerName = name.toLowerCase();
    const matches = ownedAll.filter((c) =>
      c.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(c.name.toLowerCase())
    );

    if (matches.length > 0) {
      return {
        ok: true,
        data: {
          status: "exists",
          matches: matches.map((m) => ({ id: m.id, name: m.name, type: m.type })),
        },
        speak: `${name} is already in the CRM as "${matches[0].name}" (${matches[0].id}). Use that contact_id.`,
      };
    }

    // Not found — return a proposal
    return {
      ok: true,
      data: {
        status: "not_found",
        proposal: {
          name,
          context,
          suggestedRelationshipType: relationshipType,
          confirmationRequired: true,
        },
      },
      speak:
        `${name} isn't in the CRM yet.${context ? ` Context: ${context}.` : ""} ` +
        `Reply YES to add them as a ${relationshipType}, or give me more details.`,
    };
  },
};
