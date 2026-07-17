import { remediationGate } from "@/lib/brain/remediation-gate";
import type { ToolEntry } from "./_types";

export const brainRemediationGate: ToolEntry = {
  definition: {
    name: "brain_remediation_gate",
    description:
      "Soft pre-PR checklist: warn if a remediation plan/PR body lacks Brain node citations, " +
      "doc paths, or test evidence. Does not block — returns pass/warnings/score. " +
      "Call before claiming a fix is ready.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "PR body, plan, or remediation summary.",
        },
        cited_node_ids: {
          type: "array",
          items: { type: "string" },
          description: "Optional explicit brain node ids.",
        },
        tests_run: {
          type: "boolean",
          description: "Whether tests were run successfully.",
        },
        brain_tools_used: {
          type: "boolean",
          description: "Whether brain_search/rca_pack was used.",
        },
      },
      required: ["text"],
    },
  },
  async execute(input) {
    const text = String(input.text ?? "");
    if (!text.trim()) return { ok: false, error: "text is required" };
    const cited = Array.isArray(input.cited_node_ids)
      ? input.cited_node_ids.map((x) => String(x))
      : undefined;
    const result = remediationGate({
      text,
      citedNodeIds: cited,
      testsRun:
        typeof input.tests_run === "boolean" ? input.tests_run : undefined,
      brainToolsUsed:
        typeof input.brain_tools_used === "boolean"
          ? input.brain_tools_used
          : undefined,
    });
    return { ok: true, data: result };
  },
};
