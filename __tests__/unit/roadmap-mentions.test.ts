import { describe, expect, it } from "vitest";
import {
  buildHandleIndex,
  mentionedMembers,
  stripMentionTokens,
  type MentionMember,
} from "@/lib/roadmap-mentions";
import { personToken } from "@/lib/nlp/mention-tokens";
import { extractMentionHandles } from "@/lib/town-hall/parse";

const maria: MentionMember = { userId: "u-maria", displayName: "Maria Perez" };
const jose: MentionMember = { userId: "u-jose", displayName: "José Díaz" };
const juan1: MentionMember = { userId: "u-juan-1", displayName: "Juan" };
const MEMBERS = [maria, jose, juan1];

describe("mentionedMembers", () => {
  it("resolves a spaceless full-name token to its member", () => {
    expect(mentionedMembers("Launch @MariaPerez booking engine", MEMBERS)).toEqual([
      maria,
    ]);
  });

  it("resolves multiple distinct people in one title", () => {
    const got = mentionedMembers("@MariaPerez + @José ship it", MEMBERS);
    expect(got.map((m) => m.userId)).toEqual(["u-maria", "u-jose"]);
  });

  it("matches accented names", () => {
    expect(mentionedMembers("with @JoséDíaz", MEMBERS)).toEqual([jose]);
  });

  it("falls back to a first-name token", () => {
    expect(mentionedMembers("ping @maria today", MEMBERS)).toEqual([maria]);
  });

  it("dedupes the same person tagged twice", () => {
    expect(mentionedMembers("@MariaPerez and @maria", MEMBERS)).toEqual([maria]);
  });

  it("ignores unknown @handles", () => {
    expect(mentionedMembers("@Nobody here", MEMBERS)).toEqual([]);
  });

  it("drops a removed mention (re-parse reflects current text)", () => {
    expect(mentionedMembers("Launch booking engine", MEMBERS)).toEqual([]);
  });
});

describe("buildHandleIndex", () => {
  it("does not let a colliding first name shadow an exact full-name token", () => {
    // Two people whose first name is "Juan"; the spaceless-full token must win.
    const juanP: MentionMember = { userId: "u-juan-2", displayName: "Juan Perez" };
    const idx = buildHandleIndex([juan1, juanP]);
    // "juan" → the bare-"Juan" member (registered first); "juanperez" → Juan Perez.
    expect(idx.get("juan")).toEqual(juan1);
    expect(idx.get("juanperez")).toEqual(juanP);
  });
});

describe("stripMentionTokens", () => {
  it("removes tokens and collapses the leftover whitespace", () => {
    expect(stripMentionTokens("Launch @MariaPerez booking engine")).toBe(
      "Launch booking engine",
    );
  });

  it("trims a trailing token cleanly", () => {
    expect(stripMentionTokens("Ship the thing @José")).toBe("Ship the thing");
  });

  it("leaves a plain title untouched", () => {
    expect(stripMentionTokens("Plain title")).toBe("Plain title");
  });
});

describe("token round-trip (picker insert ⇄ server extract)", () => {
  it("personToken output is recovered by extractMentionHandles + the handle index", () => {
    const title = `Build ${personToken(maria.displayName)} flow`;
    // The server parses bare handles out of the title…
    const handles = extractMentionHandles(title);
    expect(handles).toContain("mariaperez");
    // …and the same token resolves to the member on the client.
    expect(mentionedMembers(title, MEMBERS)).toEqual([maria]);
  });
});
