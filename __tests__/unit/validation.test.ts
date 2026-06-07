import { describe, expect, it } from "vitest";
import { parseContactFormData } from "@/lib/validation/contact";
import { parseProjectFormData } from "@/lib/validation/project";
import { parseActionItems, parseMeetingFormData } from "@/lib/validation/meeting";

function fd(entries: Array<[string, string]>): FormData {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("contact validation", () => {
  it("requires name", () => {
    expect(() => parseContactFormData(fd([["name", "  "]]))).toThrow();
  });

  it("defaults missing fields and trims name", () => {
    const v = parseContactFormData(fd([["name", "  Marta López "]]));
    expect(v.name).toBe("Marta López");
    expect(v.type).toBe("person");
    expect(v.relationshipType).toBe("prospect");
    expect(v.channels).toEqual([]);
  });

  it("pairs channel.kind + channel.value by index", () => {
    const v = parseContactFormData(
      fd([
        ["name", "Marta"],
        ["channel.kind", "email"],
        ["channel.value", "marta@x.com"],
        ["channel.kind", "phone"],
        ["channel.value", "+15551234567"],
      ]),
    );
    expect(v.channels).toEqual([
      { kind: "email", value: "marta@x.com" },
      { kind: "phone", value: "+15551234567" },
    ]);
  });

  it("drops channels whose value is empty", () => {
    const v = parseContactFormData(
      fd([
        ["name", "Marta"],
        ["channel.kind", "email"],
        ["channel.value", ""],
        ["channel.kind", "phone"],
        ["channel.value", "+1555"],
      ]),
    );
    expect(v.channels).toEqual([{ kind: "phone", value: "+1555" }]);
  });
});

describe("project validation", () => {
  const LOB = "00000000-0000-0000-0000-000000000001";

  it("requires a line of business", () => {
    expect(() => parseProjectFormData(fd([["title", "X"]]))).toThrow();
  });

  it("requires title", () => {
    expect(() =>
      parseProjectFormData(fd([["lobId", LOB], ["title", "  "]])),
    ).toThrow();
  });

  it("requires waitingOn when status=waiting", () => {
    expect(() =>
      parseProjectFormData(
        fd([
          ["lobId", LOB],
          ["title", "Marta"],
          ["status", "waiting"],
        ]),
      ),
    ).toThrow();
  });

  it("accepts waiting with waitingOn", () => {
    const v = parseProjectFormData(
      fd([
        ["lobId", LOB],
        ["title", "Marta"],
        ["status", "waiting"],
        ["waitingOn", "Marta's signature"],
      ]),
    );
    expect(v.status).toBe("waiting");
    expect(v.waitingOn).toBe("Marta's signature");
  });

  it("validates YYYY-MM-DD for dueDate", () => {
    expect(() =>
      parseProjectFormData(
        fd([
          ["lobId", LOB],
          ["title", "X"],
          ["dueDate", "tomorrow"],
        ]),
      ),
    ).toThrow();
  });
});

describe("meeting validation + action items", () => {
  it("requires title and scheduledAt", () => {
    expect(() => parseMeetingFormData(fd([]))).toThrow();
  });

  it("parses datetime-local format", () => {
    const v = parseMeetingFormData(
      fd([
        ["title", "Kickoff"],
        ["scheduledAt", "2026-05-26T14:30"],
      ]),
    );
    expect(v.title).toBe("Kickoff");
    expect(v.scheduledAt).toBe("2026-05-26T14:30");
  });

  it("extracts [ ] action items from minutes", () => {
    const items = parseActionItems(
      [
        "Notes about the call.",
        "[ ] Send proposal to Marta",
        "  [ ] Confirm vendor pricing",
        "- [ ] Schedule follow-up",
        "[x] Already done — not extracted",
        "",
        "[ ]   ", // empty after marker → ignored
      ].join("\n"),
    );
    expect(items).toEqual([
      "Send proposal to Marta",
      "Confirm vendor pricing",
      "Schedule follow-up",
    ]);
  });

  it("returns empty array when minutes are null/empty", () => {
    expect(parseActionItems(null)).toEqual([]);
    expect(parseActionItems("")).toEqual([]);
    expect(parseActionItems("no checkboxes here")).toEqual([]);
  });
});
