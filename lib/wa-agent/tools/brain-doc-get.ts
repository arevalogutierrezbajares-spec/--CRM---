import { graph } from "@/lib/brain/data/graph";
import { getBrainDoc } from "@/lib/brain/doc-get";
import type { ToolEntry } from "./_types";

export const brainDocGet: ToolEntry = {
  definition: {
    name: "brain_doc_get",
    description:
      "Read a documentation file from the CRM docs/ tree (runbooks, ADRs, requirements). " +
      "Pass path (e.g. docs/brain-ops.md) or a doc/adr node id from brain_search. " +
      "Use after brain_search/neighborhood to ground RCA in real prose. Path traversal blocked.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Repo-relative path under docs/, e.g. docs/brain-ops.md",
        },
        id: {
          type: "string",
          description: "Doc/adr node id, e.g. crm.doc.brain-ops",
        },
      },
      required: [],
    },
  },
  async execute(input) {
    const path = input.path != null ? String(input.path) : undefined;
    const id = input.id != null ? String(input.id) : undefined;
    if (!path && !id) {
      return { ok: false, error: "path or id is required" };
    }
    const result = getBrainDoc(graph, { path, id });
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result };
  },
};
