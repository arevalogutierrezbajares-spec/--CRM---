import { describe, it, expect } from "vitest";
import { parseWaContacts, contactCardSummary } from "@/lib/wa-agent/media/vcard";

describe("parseWaContacts", () => {
  it("parses a full contact card", () => {
    const result = parseWaContacts({
      contacts: [
        {
          name: { formatted_name: "Sofia Chen", first_name: "Sofia", last_name: "Chen" },
          phones: [{ phone: "+14155550100", type: "CELL" }],
          emails: [{ email: "sofia@example.com", type: "WORK" }],
          org: { company: "Acme Corp" },
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].formattedName).toBe("Sofia Chen");
    expect(result[0].phones[0].number).toBe("+14155550100");
    expect(result[0].emails[0].email).toBe("sofia@example.com");
    expect(result[0].organization).toBe("Acme Corp");
  });

  it("falls back to first+last when formatted_name missing", () => {
    const result = parseWaContacts({
      contacts: [
        {
          name: { first_name: "Juan", last_name: "García" },
          phones: [],
          emails: [],
        },
      ],
    });
    expect(result[0].formattedName).toBe("Juan García");
  });

  it("handles no phones or emails", () => {
    const result = parseWaContacts({
      contacts: [{ name: { formatted_name: "Ghost User" } }],
    });
    expect(result[0].phones).toHaveLength(0);
    expect(result[0].emails).toHaveLength(0);
    expect(result[0].organization).toBeNull();
  });

  it("handles empty contacts array", () => {
    expect(parseWaContacts({ contacts: [] })).toHaveLength(0);
    expect(parseWaContacts({})).toHaveLength(0);
  });

  it("parses multiple contacts", () => {
    const result = parseWaContacts({
      contacts: [
        { name: { formatted_name: "Alice" } },
        { name: { formatted_name: "Bob" } },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.formattedName)).toEqual(["Alice", "Bob"]);
  });
});

describe("contactCardSummary", () => {
  it("builds readable summary", () => {
    const summary = contactCardSummary({
      formattedName: "Oscar Pietri",
      phones: [{ number: "+58 424 1234567", type: "CELL" }],
      emails: [{ email: "oscar@laguaquira.com", type: "WORK" }],
      organization: "La Guaquira",
    });
    expect(summary).toContain("Oscar Pietri");
    expect(summary).toContain("La Guaquira");
    expect(summary).toContain("+58 424 1234567");
    expect(summary).toContain("oscar@laguaquira.com");
  });

  it("omits missing fields", () => {
    const summary = contactCardSummary({
      formattedName: "Anon",
      phones: [],
      emails: [],
      organization: null,
    });
    expect(summary).toBe("Contact card: Anon");
  });
});
