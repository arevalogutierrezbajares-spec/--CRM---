import { describe, expect, it, vi, beforeEach } from "vitest";

// fileCallTranscript's collaborators are mocked so the operator-notes block
// tests exercise the REAL brief assembly (verbatim guarantee) without a DB or
// the Claude API. Everything else in this file tests pure helpers directly.
const claudeWithToolsMock = vi.fn();
const claudeChatMock = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  claudeWithTools: (...args: unknown[]) => claudeWithToolsMock(...args),
  claudeChat: (...args: unknown[]) => claudeChatMock(...args),
}));
const updateCallRecordingMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/db/queries/call-recordings", () => ({
  updateCallRecording: (...args: unknown[]) => updateCallRecordingMock(...args),
}));
const createCallMeetingMock = vi.fn(async (..._args: unknown[]) => "meeting-1");
vi.mock("@/db/queries/meetings", () => ({
  createCallMeeting: (...args: unknown[]) => createCallMeetingMock(...args),
}));
vi.mock("@/db", () => ({
  db: {},
  schema: { actionItems: {}, touches: {}, contacts: {} },
}));

import {
  parseNotes,
  parseTerms,
  MAX_NOTES,
  MAX_NOTE_CHARS,
  MAX_TERMS,
  MAX_TERM_CHARS,
} from "@/lib/capture/validate";
import {
  resolveNotes,
  resolveHighlights,
  applyTermCorrections,
} from "@/lib/capture/finalize";
import { deepgramParams, type Utterance } from "@/lib/capture/deepgram";
import { fileCallTranscript } from "@/lib/capture/file-call";

describe("parseNotes", () => {
  it("returns [] for non-arrays / empty (never throws — notes are advisory)", () => {
    expect(parseNotes(null)).toEqual([]);
    expect(parseNotes(undefined)).toEqual([]);
    expect(parseNotes({})).toEqual([]);
    expect(parseNotes([])).toEqual([]);
    expect(parseNotes("nope")).toEqual([]);
    expect(parseNotes([null, 42, "x", {}])).toEqual([]);
  });

  it("keeps valid notes, trims text, drops empty/whitespace-only text", () => {
    expect(
      parseNotes([
        { tSecs: 12.5, text: "  follow up on pricing  " },
        { tSecs: 3, text: "   " },
        { tSecs: 4 },
      ]),
    ).toEqual([{ tSecs: 12.5, text: "follow up on pricing", themeKey: null }]);
  });

  it("sorts by time so the brief lists notes in call order", () => {
    const out = parseNotes([
      { tSecs: 90, text: "c" },
      { tSecs: 5, text: "a" },
      { tSecs: 40, text: "b" },
    ]);
    expect(out.map((n) => n.tSecs)).toEqual([5, 40, 90]);
  });

  it("drops non-finite / negative timestamps and clamps to 24h", () => {
    expect(
      parseNotes([
        { tSecs: -1, text: "gone" },
        { tSecs: NaN, text: "gone" },
        { tSecs: "x", text: "gone" },
        { tSecs: 1e9, text: "clamped" },
      ]),
    ).toEqual([{ tSecs: 24 * 3600, text: "clamped", themeKey: null }]);
  });

  it("coerces numeric-string tSecs", () => {
    expect(parseNotes([{ tSecs: "7.5", text: "ok" }])).toEqual([
      { tSecs: 7.5, text: "ok", themeKey: null },
    ]);
  });

  it("caps count and text length so a helper can't DoS finalize", () => {
    const many = Array.from({ length: MAX_NOTES + 50 }, (_, i) => ({
      tSecs: i,
      text: `n${i}`,
    }));
    expect(parseNotes(many)).toHaveLength(MAX_NOTES);

    const [n] = parseNotes([{ tSecs: 1, text: "a".repeat(5000) }]);
    expect(n.text.length).toBe(MAX_NOTE_CHARS);
  });

  it("parses an optional anchor: quote trimmed/capped, tSecs clamped", () => {
    expect(
      parseNotes([
        {
          tSecs: 512,
          text: "Floor is $50/mo",
          anchor: { quote: "  ...verbatim live text...  ", tSecs: 498 },
        },
      ]),
    ).toEqual([
      {
        tSecs: 512,
        text: "Floor is $50/mo",
        themeKey: null,
        anchor: { quote: "...verbatim live text...", tSecs: 498 },
      },
    ]);

    // Anchor quote capped at 200 chars; anchor tSecs clamped to 24h.
    const [clamped] = parseNotes([
      { tSecs: 5, text: "n", anchor: { quote: "q".repeat(500), tSecs: 1e9 } },
    ]);
    expect(clamped.anchor!.quote.length).toBe(200);
    expect(clamped.anchor!.tSecs).toBe(24 * 3600);
  });

  it("drops an invalid/absent anchor to nothing (note itself survives)", () => {
    // Absent anchor → no anchor key at all (minimal slice-1 shape).
    expect(parseNotes([{ tSecs: 5, text: "a" }])[0]).toEqual({
      tSecs: 5,
      text: "a",
      themeKey: null,
    });
    // Bad tSecs on the anchor → the anchor is dropped, the note stays.
    for (const bad of [{ quote: "x", tSecs: -1 }, { quote: "x", tSecs: "no" }, { quote: "x" }, {}]) {
      const [n] = parseNotes([{ tSecs: 5, text: "a", anchor: bad }]);
      expect(n).toEqual({ tSecs: 5, text: "a", themeKey: null });
    }
    // Empty-quote anchor is still usable (tSecs is the deliberate aim-point).
    const [ok] = parseNotes([{ tSecs: 5, text: "a", anchor: { quote: "   ", tSecs: 7 } }]);
    expect(ok.anchor).toEqual({ quote: "", tSecs: 7 });
  });
});

describe("parseTerms", () => {
  it("returns [] for non-arrays / garbage (never throws — terms are advisory)", () => {
    expect(parseTerms(null)).toEqual([]);
    expect(parseTerms(undefined)).toEqual([]);
    expect(parseTerms({})).toEqual([]);
    expect(parseTerms([])).toEqual([]);
    expect(parseTerms("nope")).toEqual([]);
    expect(parseTerms([null, 42, "x", {}])).toEqual([]);
  });

  it("drops entries without a usable right; wrong is optional (null when empty)", () => {
    expect(
      parseTerms([
        { right: "PDVSA" },
        { wrong: "  ", right: "Anaco" },
        { wrong: "pedevesa", right: "PDVSA" },
        { wrong: "orphan" }, // no right → dropped
        { wrong: "x", right: "   " }, // blank right → dropped
      ]),
    ).toEqual([
      { wrong: null, right: "PDVSA" },
      { wrong: null, right: "Anaco" },
      { wrong: "pedevesa", right: "PDVSA" },
    ]);
  });

  it("trims and caps term length", () => {
    const [t] = parseTerms([
      { wrong: `  ${"w".repeat(200)}  `, right: `  ${"r".repeat(200)}  ` },
    ]);
    expect(t.wrong!.length).toBe(MAX_TERM_CHARS);
    expect(t.right.length).toBe(MAX_TERM_CHARS);
  });

  it("dedupes case-insensitively on (wrong, right)", () => {
    expect(
      parseTerms([
        { wrong: "Pedevesa", right: "PDVSA" },
        { wrong: "pedevesa", right: "pdvsa" },
        { right: "PDVSA" }, // different (wrong=null) pair — kept
        { right: "pdvsa" }, // dup of the previous — dropped
      ]),
    ).toEqual([
      { wrong: "Pedevesa", right: "PDVSA" },
      { wrong: null, right: "PDVSA" },
    ]);
  });

  it("caps the number of terms", () => {
    const many = Array.from({ length: MAX_TERMS + 50 }, (_, i) => ({
      right: `term-${i}`,
    }));
    expect(parseTerms(many)).toHaveLength(MAX_TERMS);
  });
});

describe("resolveNotes", () => {
  const u = (start: number, end: number, text: string): Utterance =>
    ({ speaker: "S", channel: 0, start, end, text }) as Utterance;
  const utterances = [
    u(0, 5, "Hello there"),
    u(5, 12, "The budget is forty thousand"),
    u(12, 20, "See you next week"),
  ];

  it("quotes the utterance covering the note's time, keeping the text verbatim", () => {
    const [n] = resolveNotes([{ tSecs: 8, text: "budget note" }], utterances);
    expect(n).toEqual({
      atSec: 8,
      quote: "The budget is forty thousand",
      note: "budget note",
      themeKey: null,
    });
  });

  it("is robust to an empty transcript (quote = '')", () => {
    expect(resolveNotes([{ tSecs: 3, text: "x" }], [])).toEqual([
      { atSec: 3, quote: "", note: "x", themeKey: null },
    ]);
  });

  it("drops the quote when the note's audio is gone (gap guard)", () => {
    expect(
      resolveNotes([{ tSecs: 500, text: "typed after tail drop" }], utterances),
    ).toEqual([
      { atSec: 500, quote: "", note: "typed after tail drop", themeKey: null },
    ]);
  });

  it("returns [] when there are no notes", () => {
    expect(resolveNotes([], utterances)).toEqual([]);
  });

  it("shares the nearest-utterance behavior with resolveHighlights", () => {
    for (const tSecs of [0, 5.1, 8, 21, 49, 51, 500]) {
      const [n] = resolveNotes([{ tSecs, text: "n" }], utterances);
      const [h] = resolveHighlights([{ tSecs, note: null }], utterances);
      expect(n.quote).toBe(h.quote);
      expect(n.atSec).toBe(h.atSec);
    }
  });

  it("re-quotes at the anchor, displaying the anchor tSecs (not the note's)", () => {
    // Note tSecs=18 lands in "See you next week", but the operator aimed the
    // anchor at 8s — resolution re-quotes THERE and shows 8 as the atSec. The
    // anchor's own wire quote is advisory and never stored verbatim.
    const [n] = resolveNotes(
      [
        {
          tSecs: 18,
          text: "budget note",
          anchor: { quote: "throwaway live text", tSecs: 8 },
        },
      ],
      utterances,
    );
    expect(n).toEqual({
      atSec: 8,
      quote: "The budget is forty thousand",
      note: "budget note",
      themeKey: null,
    });
  });

  it("an anchor beyond the gap yields no quote (audio gone at the aim-point)", () => {
    const [n] = resolveNotes(
      [{ tSecs: 8, text: "n", anchor: { quote: "x", tSecs: 500 } }],
      utterances,
    );
    expect(n).toEqual({ atSec: 500, quote: "", note: "n", themeKey: null });
  });
});

describe("applyTermCorrections", () => {
  const u = (text: string, start = 0): Utterance =>
    ({ speaker: "S", channel: 0, start, end: start + 1, text }) as Utterance;

  it("replaces case-insensitive whole-word occurrences and counts them", () => {
    const out = applyTermCorrections(
      [u("We call pedevesa daily. PEDEVESA agreed."), u("pedevesa again")],
      [{ wrong: "pedevesa", right: "PDVSA" }],
    );
    expect(out.utterances.map((x) => x.text)).toEqual([
      "We call PDVSA daily. PDVSA agreed.",
      "PDVSA again",
    ]);
    expect(out.replacements).toBe(3);
  });

  it("never mangles partial words ('art' must not alter 'start')", () => {
    const out = applyTermCorrections(
      [u("start of the art class, smart art")],
      [{ wrong: "art", right: "ART" }],
    );
    expect(out.utterances[0].text).toBe("start of the ART class, smart ART");
    expect(out.replacements).toBe(2);
  });

  it("supports multi-word wrong phrases", () => {
    const out = applyTermCorrections(
      [u("we drive to san tome tomorrow, then Santomecito")],
      [{ wrong: "san tome", right: "San Tomé" }],
    );
    expect(out.utterances[0].text).toBe(
      "we drive to San Tomé tomorrow, then Santomecito",
    );
    expect(out.replacements).toBe(1);
  });

  it("escapes regex specials in wrong and keeps right literal ($-patterns)", () => {
    const out = applyTermCorrections(
      [u("we use c++ and node.js but not nodexjs")],
      [
        { wrong: "c++", right: "C++" },
        { wrong: "node.js", right: "Node.js ($&)" },
      ],
    );
    // node.js's dot must not match "nodexjs"; "$&" in right stays literal.
    expect(out.utterances[0].text).toBe(
      "we use C++ and Node.js ($&) but not nodexjs",
    );
    expect(out.replacements).toBe(2);
  });

  it("handles accented (unicode) terms with correct boundaries", () => {
    const out = applyTermCorrections(
      [u("meeting in anzoategui next month")],
      [{ wrong: "anzoategui", right: "Anzoátegui" }],
    );
    expect(out.utterances[0].text).toBe("meeting in Anzoátegui next month");
    expect(out.replacements).toBe(1);
  });

  it("ignores terms without a wrong (keyterm-only) and is a no-op when nothing matches", () => {
    const input = [u("nothing to fix here")];
    const none = applyTermCorrections(input, [
      { wrong: null, right: "PDVSA" },
      { wrong: "absent", right: "Absent" },
    ]);
    expect(none.replacements).toBe(0);
    expect(none.utterances[0].text).toBe("nothing to fix here");
    // Untouched utterance objects keep identity (no needless copies).
    expect(none.utterances[0]).toBe(input[0]);
  });

  it("does not mutate the input utterances", () => {
    const input = [u("pedevesa called")];
    applyTermCorrections(input, [{ wrong: "pedevesa", right: "PDVSA" }]);
    expect(input[0].text).toBe("pedevesa called");
  });
});

describe("deepgramParams keyterm prompting", () => {
  it("emits one repeated keyterm param per term", () => {
    const p = deepgramParams({ keyterms: ["Anzoátegui", "PDVSA", "San Tomé"] });
    expect(p.getAll("keyterm")).toEqual(["Anzoátegui", "PDVSA", "San Tomé"]);
    // Base params untouched.
    expect(p.get("model")).toBe("nova-3");
  });

  it("emits no keyterm param when absent, empty, or blank", () => {
    expect(deepgramParams().getAll("keyterm")).toEqual([]);
    expect(deepgramParams({ keyterms: [] }).getAll("keyterm")).toEqual([]);
    expect(deepgramParams({ keyterms: ["  ", ""] }).getAll("keyterm")).toEqual([]);
  });
});

describe("fileCallTranscript — operator-notes block", () => {
  beforeEach(() => {
    claudeWithToolsMock.mockReset();
    claudeChatMock.mockReset();
    updateCallRecordingMock.mockClear();
    createCallMeetingMock.mockClear();
    claudeWithToolsMock.mockResolvedValue({
      ok: true,
      content: [
        {
          type: "tool_use",
          name: "file_call",
          input: {
            title: "Budget call",
            brief_markdown: "**TL;DR:** model brief",
            note: "short note",
            action_items: [],
          },
        },
      ],
    });
  });

  const baseOpts = {
    workspaceId: "ws-1",
    userId: "user-1",
    recordingId: "rec-1",
    transcript: "[00:05] Founder: hello",
    durationSecs: 300,
    attributed: true,
    founderLabel: "Founder",
  };

  it("prepends the verbatim ✎ Operator notes block right after ★ Flagged moments", async () => {
    const res = await fileCallTranscript({
      ...baseOpts,
      flaggedMoments: [
        { atSec: 65, quote: "The budget is forty thousand", note: "money" },
      ],
      operatorNotes: [
        { atSec: 130, quote: "See you next week", note: "book the follow-up" },
      ],
    });
    expect(res.brief).toBe(
      [
        "**★ Flagged moments** (marked live by the operator):",
        '- [1:05] "The budget is forty thousand" — money',
        "",
        "**✎ Operator notes** (typed live during the call):",
        '- [2:10] "See you next week" — book the follow-up',
        "",
        "**TL;DR:** model brief",
      ].join("\n"),
    );
    // The persisted brief carries the same verbatim blocks.
    expect(updateCallRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ brief: res.brief }),
    );
  });

  it("guarantees the notes block even without flagged moments, quote optional", async () => {
    const res = await fileCallTranscript({
      ...baseOpts,
      operatorNotes: [{ atSec: 10, quote: "", note: "no audio backing" }],
    });
    expect(res.brief).toBe(
      [
        "**✎ Operator notes** (typed live during the call):",
        "- [0:10] — no audio backing",
        "",
        "**TL;DR:** model brief",
      ].join("\n"),
    );
    expect(res.brief).not.toContain("★ Flagged moments");
  });

  it("steers the model with the notes without duplicating them into the transcript block", async () => {
    await fileCallTranscript({
      ...baseOpts,
      operatorNotes: [{ atSec: 130, quote: "See you next week", note: "book it" }],
    });
    const content = (
      claudeWithToolsMock.mock.calls[0][0] as {
        messages: { content: string }[];
      }
    ).messages[0].content;
    expect(content).toContain("OPERATOR LIVE NOTES");
    expect(content).toContain('- [2:10] "See you next week" — book it');
    expect(content).toContain("do NOT repeat them verbatim");
  });

  it("changes nothing when no notes are supplied (old helpers unaffected)", async () => {
    const res = await fileCallTranscript(baseOpts);
    expect(res.brief).toBe("**TL;DR:** model brief");
    const content = (
      claudeWithToolsMock.mock.calls[0][0] as {
        messages: { content: string }[];
      }
    ).messages[0].content;
    expect(content).not.toContain("OPERATOR LIVE NOTES");
    expect(content).not.toContain("OPERATOR-FLAGGED MOMENTS");
  });
});
