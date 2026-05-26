import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/whatsapp";

describe("parseCommand", () => {
  it("recognizes /help and /?", () => {
    expect(parseCommand("/help")).toEqual({ kind: "help" });
    expect(parseCommand("/?")).toEqual({ kind: "help" });
  });

  it("parses /find with query", () => {
    expect(parseCommand("/find marta")).toEqual({
      kind: "find",
      query: "marta",
    });
  });

  it("parses /find with no query", () => {
    expect(parseCommand("/find")).toEqual({ kind: "find", query: "" });
  });

  it("parses /log @hint body", () => {
    expect(parseCommand("/log @marta had coffee, talked funding")).toEqual({
      kind: "log",
      targetHint: "marta",
      body: "had coffee, talked funding",
    });
  });

  it("parses /log with no @hint", () => {
    expect(parseCommand("/log just a thought")).toEqual({
      kind: "log",
      targetHint: "",
      body: "just a thought",
    });
  });

  it("parses /note tag: body", () => {
    expect(parseCommand("/note bd: chase carlos next week")).toEqual({
      kind: "note",
      tagHint: "bd",
      body: "chase carlos next week",
    });
  });

  it("parses /note with no tag prefix", () => {
    expect(parseCommand("/note free text")).toEqual({
      kind: "note",
      tagHint: null,
      body: "free text",
    });
  });

  it("classifies non-command text as unknown", () => {
    expect(parseCommand("hello there")).toEqual({
      kind: "unknown",
      raw: "hello there",
    });
  });

  it("handles multiline log body", () => {
    const cmd = parseCommand("/log @bob\nline one\nline two");
    expect(cmd.kind).toBe("log");
    if (cmd.kind === "log") {
      expect(cmd.targetHint).toBe("bob");
      expect(cmd.body).toBe("line one\nline two");
    }
  });
});
