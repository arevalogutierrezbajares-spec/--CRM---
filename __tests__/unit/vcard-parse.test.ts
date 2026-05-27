import { describe, it, expect } from "vitest";
import { parseWaContacts, contactCardSummary } from "@/lib/wa-agent/media/vcard";
import type { WaContactPayload } from "@/lib/wa-agent/media/vcard";

const SAMPLE_PAYLOAD: WaContactPayload = [
  {
    name: { formatted_name: "Oscar Pietri", first_name: "Oscar", last_name: "Pietri" },
    phones: [
      { phone: "+584141234567", wa_id: "584141234567", type: "WHATSAPP" },
      { phone: "+14155551234", type: "CELL" },
    ],
    emails: [{ email: "oscar@laguaquira.com", type: "WORK" }],
    org: { company: "La Guaquira", title: "Owner" },
  },
];

describe("parseWaContacts", () => {
  it("extracts name", () => {
    const [c] = parseWaContacts(SAMPLE_PAYLOAD);
    expect(c.name).toBe("Oscar Pietri");
  });

  it("separates whatsapp numbers from regular phones", () => {
    const [c] = parseWaContacts(SAMPLE_PAYLOAD);
    expect(c.whatsappNumbers).toContain("584141234567");
    expect(c.phones).toContain("+14155551234");
    expect(c.phones).not.toContain("+584141234567");
  });

  it("extracts emails", () => {
    const [c] = parseWaContacts(SAMPLE_PAYLOAD);
    expect(c.emails).toContain("oscar@laguaquira.com");
  });

  it("extracts org and title", () => {
    const [c] = parseWaContacts(SAMPLE_PAYLOAD);
    expect(c.company).toBe("La Guaquira");
    expect(c.title).toBe("Owner");
  });

  it("handles contact with no phones", () => {
    const [c] = parseWaContacts([{ name: { formatted_name: "Ghost Person" } }]);
    expect(c.phones).toHaveLength(0);
    expect(c.whatsappNumbers).toHaveLength(0);
  });

  it("handles missing name", () => {
    const [c] = parseWaContacts([{ emails: [{ email: "x@y.com" }] }]);
    expect(c.name).toBe("Unknown");
  });
});

describe("contactCardSummary", () => {
  it("formats a full contact", () => {
    const [c] = parseWaContacts(SAMPLE_PAYLOAD);
    const s = contactCardSummary(c);
    expect(s).toContain("Oscar Pietri");
    expect(s).toContain("La Guaquira");
    expect(s).toContain("584141234567");
  });

  it("falls back to phone when no WA number", () => {
    const s = contactCardSummary({
      name: "Jane Doe",
      phones: ["+14155559876"],
      whatsappNumbers: [],
      emails: [],
    });
    expect(s).toContain("+14155559876");
  });
});
