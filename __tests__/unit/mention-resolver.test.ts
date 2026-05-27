import { describe, it, expect } from "vitest";
import { mentionSupplementLine } from "@/lib/wa-agent/mention-resolver";

describe("mentionSupplementLine", () => {
  it("returns empty string for no matches", () => {
    const line = mentionSupplementLine([]);
    expect(line).toBe("");
  });

  it("formats a single match", () => {
    const line = mentionSupplementLine([
      {
        name: "Anabella Guzman",
        id: "abc-123",
        matchedToken: "Anabella",
        org: "Viajando por Venezuela",
        rel: "partner",
      },
    ]);
    expect(line).toContain("Anabella Guzman");
    expect(line).toContain("abc-123");
    expect(line).toContain("Viajando por Venezuela");
    expect(line).toContain("partner");
  });

  it("formats multiple matches", () => {
    const line = mentionSupplementLine([
      {
        name: "Anabella Guzman",
        id: "abc-123",
        matchedToken: "Anabella",
        org: null,
        rel: "partner",
      },
      {
        name: "Juan Carlos Guinand",
        id: "def-456",
        matchedToken: "Juan Carlos",
        org: "Estudio JCG",
        rel: "friend",
      },
    ]);
    expect(line).toContain("Anabella Guzman");
    expect(line).toContain("Juan Carlos Guinand");
    expect(line).toContain("abc-123");
    expect(line).toContain("def-456");
  });
});
