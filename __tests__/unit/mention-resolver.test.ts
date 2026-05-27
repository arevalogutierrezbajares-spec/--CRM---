import { describe, it, expect } from "vitest";
import { mentionSupplementLine } from "@/lib/wa-agent/mention-resolver";
import type { MentionMatch } from "@/lib/wa-agent/mention-resolver";

// mentionSupplementLine is pure — test it without hitting the DB
describe("mentionSupplementLine", () => {
  it("returns empty string for no matches", () => {
    expect(mentionSupplementLine([])).toBe("");
  });

  it("formats a single match", () => {
    const matches: MentionMatch[] = [
      { id: "abc-123", name: "Marcos Antonio Capote", matchedToken: "Marcos Antonio Capote" },
    ];
    const line = mentionSupplementLine(matches);
    expect(line).toContain("Marcos Antonio Capote");
    expect(line).toContain("abc-123");
    expect(line).toContain("KNOWN ENTITIES");
    expect(line).toContain("find_contact");
  });

  it("formats multiple matches", () => {
    const matches: MentionMatch[] = [
      { id: "id-1", name: "Anabella Guzman", matchedToken: "Anabella Guzman" },
      { id: "id-2", name: "Oscar Pietri", matchedToken: "Oscar Pietri" },
    ];
    const line = mentionSupplementLine(matches);
    expect(line).toContain("Anabella Guzman");
    expect(line).toContain("Oscar Pietri");
    expect(line).toContain("id-1");
    expect(line).toContain("id-2");
  });
});
