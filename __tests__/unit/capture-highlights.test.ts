import { describe, expect, it } from "vitest";
import {
  parseHighlights,
  MAX_HIGHLIGHTS,
  MAX_HIGHLIGHT_NOTE_CHARS,
} from "@/lib/capture/validate";
import { resolveHighlights } from "@/lib/capture/finalize";
import type { Utterance } from "@/lib/capture/deepgram";

describe("parseHighlights", () => {
  it("returns [] for non-arrays / empty (never throws — highlights are advisory)", () => {
    expect(parseHighlights(null)).toEqual([]);
    expect(parseHighlights(undefined)).toEqual([]);
    expect(parseHighlights({})).toEqual([]);
    expect(parseHighlights([])).toEqual([]);
    expect(parseHighlights("nope")).toEqual([]);
  });

  it("keeps valid moments, trims notes, drops empty notes to null", () => {
    expect(
      parseHighlights([
        { tSecs: 12.5, note: "  key ask  " },
        { tSecs: 3, note: "" },
      ]),
    ).toEqual([
      { tSecs: 3, note: null, themeKey: null },
      { tSecs: 12.5, note: "key ask", themeKey: null },
    ]);
  });

  it("sorts by time so the brief lists moments in call order", () => {
    const out = parseHighlights([{ tSecs: 90 }, { tSecs: 5 }, { tSecs: 40 }]);
    expect(out.map((h) => h.tSecs)).toEqual([5, 40, 90]);
  });

  it("drops non-finite / negative timestamps", () => {
    expect(
      parseHighlights([
        { tSecs: -1 },
        { tSecs: NaN },
        { tSecs: "x" },
        { tSecs: 10 },
      ]),
    ).toEqual([{ tSecs: 10, note: null, themeKey: null }]);
  });

  it("coerces numeric-string tSecs", () => {
    expect(parseHighlights([{ tSecs: "7.5", note: "ok" }])).toEqual([
      { tSecs: 7.5, note: "ok", themeKey: null },
    ]);
  });

  it("caps count and note length so a helper can't DoS finalize", () => {
    const many = Array.from({ length: MAX_HIGHLIGHTS + 50 }, (_, i) => ({
      tSecs: i,
    }));
    expect(parseHighlights(many)).toHaveLength(MAX_HIGHLIGHTS);

    const [h] = parseHighlights([{ tSecs: 1, note: "a".repeat(5000) }]);
    expect(h.note!.length).toBe(MAX_HIGHLIGHT_NOTE_CHARS);
  });
});

describe("resolveHighlights", () => {
  const u = (start: number, end: number, text: string): Utterance =>
    ({ speaker: "S", channel: 0, start, end, text }) as Utterance;
  const utterances = [
    u(0, 5, "Hello there"),
    u(5, 12, "The budget is forty thousand"),
    u(12, 20, "See you next week"),
  ];

  it("quotes the utterance covering the flagged time", () => {
    const [m] = resolveHighlights([{ tSecs: 8, note: "money" }], utterances);
    expect(m).toEqual({
      atSec: 8,
      quote: "The budget is forty thousand",
      note: "money",
      themeKey: null,
    });
  });

  it("falls back to the nearest utterance when the time lands in a gap", () => {
    // 4.9s is inside utterance 0 (0-5); 5.1s is inside utterance 1 (5-12).
    expect(resolveHighlights([{ tSecs: 5.1, note: null }], utterances)[0].quote).toBe(
      "The budget is forty thousand",
    );
  });

  it("is robust to an empty transcript (quote = '')", () => {
    expect(resolveHighlights([{ tSecs: 3, note: "x" }], [])).toEqual([
      { atSec: 3, quote: "", note: "x", themeKey: null },
    ]);
  });

  it("drops the quote when the flag's audio is gone (off-the-record tail-drop)", () => {
    // Flag at 500s but the transcript ends at 20s → no real audio there.
    // Keep the timestamp + note; never misattribute the last surviving line.
    expect(
      resolveHighlights([{ tSecs: 500, note: "flagged before I dropped the tail" }], utterances),
    ).toEqual([
      { atSec: 500, quote: "", note: "flagged before I dropped the tail", themeKey: null },
    ]);
  });

  it("returns [] when there are no highlights", () => {
    expect(resolveHighlights([], utterances)).toEqual([]);
  });
});
