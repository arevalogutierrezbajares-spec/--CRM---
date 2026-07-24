import { describe, expect, it, vi, beforeEach } from "vitest";

// fileCallTranscript's collaborators are mocked so the themed-path tests
// exercise the REAL gate + renderer + brief assembly without a DB or the
// Claude API. Everything else in this file tests pure functions directly.
const claudeWithToolsMock = vi.fn();
const claudeChatMock = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  claudeWithTools: (...args: unknown[]) => claudeWithToolsMock(...args),
  claudeChat: (...args: unknown[]) => claudeChatMock(...args),
}));
const updateCallRecordingMock = vi.fn(async (..._args: unknown[]) => undefined);
const getCallRecordingMock = vi.fn();
const getContactNameMock = vi.fn();
const replaceCallThemeFacetsMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/db/queries/call-recordings", () => ({
  updateCallRecording: (...args: unknown[]) => updateCallRecordingMock(...args),
  getCallRecording: (...args: unknown[]) => getCallRecordingMock(...args),
  getContactName: (...args: unknown[]) => getContactNameMock(...args),
  replaceCallThemeFacets: (...args: unknown[]) => replaceCallThemeFacetsMock(...args),
}));
const createCallMeetingMock = vi.fn(async (..._args: unknown[]) => "meeting-1");
vi.mock("@/db/queries/meetings", () => ({
  createCallMeeting: (...args: unknown[]) => createCallMeetingMock(...args),
}));
vi.mock("@/db", () => ({
  db: {},
  schema: { actionItems: {}, touches: {}, contacts: {} },
}));
// Route-passthrough tests: the route's collaborators are mocked; the REAL
// parse functions run so the wire → finalizeSession shapes are exercised.
const resolveCaptureTokenMock = vi.fn();
vi.mock("@/lib/capture/tokens", () => ({
  resolveCaptureToken: (...args: unknown[]) => resolveCaptureTokenMock(...args),
}));
const getCaptureSessionMock = vi.fn();
const claimSessionForFinalizeMock = vi.fn();
vi.mock("@/db/queries/capture-sessions", () => ({
  getCaptureSession: (...args: unknown[]) => getCaptureSessionMock(...args),
  claimSessionForFinalize: (...args: unknown[]) => claimSessionForFinalizeMock(...args),
  reclaimFailedSession: vi.fn(),
  reclaimStaleFinalizingSession: vi.fn(),
}));
const finalizeSessionMock = vi.fn();
vi.mock("@/lib/capture/finalize", async () => {
  // Keep the real types/constants surface minimal: the route only uses
  // finalizeSession at runtime; themed-doc.ts imports finalize types only.
  return { finalizeSession: (...args: unknown[]) => finalizeSessionMock(...args) };
});

import {
  parseAgenda,
  parseThemes,
  parseNotes,
  parseHighlights,
  parseCoverage,
  isValidThemeKey,
  slugifyThemeLabel,
  MAX_AGENDA,
  MAX_THEMES,
  MAX_THEME_LABEL_CHARS,
  MAX_COVERAGE,
} from "@/lib/capture/validate";
import {
  buildThemedDoc,
  buildSpeakerScaffold,
  renderThemedBrief,
  nearestUtteranceAt,
  clockTs,
  facetsFromThemedDoc,
  type ThemedDoc,
  type ThemeEvidence,
} from "@/lib/capture/themed-doc";
import { assignEvidence, strike } from "@/lib/capture/themed-doc-mutate";
import {
  gateThemeExtractions,
  sanitizeCallSentence,
  fileCallTranscript,
  gateAudit,
  gateSupporting,
  shouldRunAudit,
  MAX_AI_BULLETS_PER_CATEGORY,
  MAX_AI_BULLET_CHARS,
  MAX_AUDIT_COMMITMENTS,
  MAX_SUPPORTING_PER_THEME,
} from "@/lib/capture/file-call";
import { serializeRecordingDetail } from "@/lib/capture/serialize";
import type { Utterance } from "@/lib/capture/deepgram";
import type { CallRecordingRow } from "@/db/queries/call-recordings";

// ─────────────────────────────────────────────────────────────────────────────
// validate.ts — parseAgenda / parseThemes / themeKey
// ─────────────────────────────────────────────────────────────────────────────

describe("isValidThemeKey / slugifyThemeLabel", () => {
  it("accepts only lowercase a-z0-9 + hyphens, ≤48 chars", () => {
    expect(isValidThemeKey("pricing-model")).toBe(true);
    expect(isValidThemeKey("a")).toBe(true);
    expect(isValidThemeKey("q3-2026")).toBe(true);
    expect(isValidThemeKey("Pricing")).toBe(false);
    expect(isValidThemeKey("pricing_model")).toBe(false);
    expect(isValidThemeKey("-lead")).toBe(false);
    expect(isValidThemeKey("lead-")).toBe(false);
    expect(isValidThemeKey("a--b")).toBe(false);
    expect(isValidThemeKey("")).toBe(false);
    expect(isValidThemeKey("a".repeat(49))).toBe(false);
    expect(isValidThemeKey("a".repeat(48))).toBe(true);
    expect(isValidThemeKey(42)).toBe(false);
    expect(isValidThemeKey(null)).toBe(false);
  });

  it("slugifies labels: accents stripped, non-alnum collapsed, ≤48", () => {
    expect(slugifyThemeLabel("Pricing model")).toBe("pricing-model");
    expect(slugifyThemeLabel("Anzoátegui — Próximos pasos!")).toBe(
      "anzoategui-proximos-pasos",
    );
    expect(slugifyThemeLabel("  Q3 / 2026  ")).toBe("q3-2026");
    expect(slugifyThemeLabel("a".repeat(100))!.length).toBeLessThanOrEqual(48);
    expect(slugifyThemeLabel("¡¡¡")).toBeNull();
    expect(slugifyThemeLabel("")).toBeNull();
  });
});

describe("parseAgenda", () => {
  it("returns [] for non-arrays / garbage (never throws — advisory)", () => {
    expect(parseAgenda(null)).toEqual([]);
    expect(parseAgenda(undefined)).toEqual([]);
    expect(parseAgenda({})).toEqual([]);
    expect(parseAgenda([])).toEqual([]);
    expect(parseAgenda("nope")).toEqual([]);
    expect(parseAgenda([null, 42, "x", {}])).toEqual([]);
  });

  it("keeps a provided valid slug, slugifies otherwise, trims + caps label", () => {
    expect(
      parseAgenda([
        { key: "pricing-model", label: "  Pricing model  " },
        { key: "NOT VALID", label: "Próximos pasos" },
        { label: "Team & Hiring" },
        { key: "no-label" }, // label required → dropped
        { label: `x${"y".repeat(300)}` }, // label capped
      ]),
    ).toEqual([
      { key: "pricing-model", label: "Pricing model" },
      { key: "proximos-pasos", label: "Próximos pasos" },
      { key: "team-hiring", label: "Team & Hiring" },
      { key: "x".concat("y".repeat(MAX_THEME_LABEL_CHARS - 1)).slice(0, 48), label: `x${"y".repeat(MAX_THEME_LABEL_CHARS - 1)}` },
    ]);
  });

  it("dedupes by key (first occurrence wins) and caps at MAX_AGENDA", () => {
    expect(
      parseAgenda([
        { key: "pricing", label: "Pricing A" },
        { key: "pricing", label: "Pricing B" },
        { label: "Pricing" }, // slugifies to the same key → dropped
      ]),
    ).toEqual([{ key: "pricing", label: "Pricing A" }]);

    const many = Array.from({ length: MAX_AGENDA + 10 }, (_, i) => ({
      key: `item-${i}`,
      label: `Item ${i}`,
    }));
    expect(parseAgenda(many)).toHaveLength(MAX_AGENDA);
  });
});

describe("parseThemes", () => {
  it("returns [] for garbage and validates like parseAgenda", () => {
    expect(parseThemes(null)).toEqual([]);
    expect(parseThemes([{ label: "   " }])).toEqual([]);
  });

  it("carries the agenda flag (strictly boolean true)", () => {
    expect(
      parseThemes([
        { key: "pricing-model", label: "Pricing model", agenda: true },
        { key: "onboarding", label: "Onboarding" },
        { key: "misc", label: "Misc", agenda: "yes" }, // non-boolean → false
      ]),
    ).toEqual([
      { key: "pricing-model", label: "Pricing model", agenda: true },
      { key: "onboarding", label: "Onboarding", agenda: false },
      { key: "misc", label: "Misc", agenda: false },
    ]);
  });

  it("caps at MAX_THEMES", () => {
    const many = Array.from({ length: MAX_THEMES + 10 }, (_, i) => ({
      key: `t-${i}`,
      label: `T ${i}`,
    }));
    expect(parseThemes(many)).toHaveLength(MAX_THEMES);
  });
});

describe("marker themeKey validation (parseNotes / parseHighlights)", () => {
  it("keeps a valid themeKey, nulls an invalid one — marker itself survives", () => {
    expect(
      parseNotes([
        { tSecs: 5, text: "a", themeKey: "pricing-model" },
        { tSecs: 6, text: "b", themeKey: "NOT VALID" },
        { tSecs: 7, text: "c", themeKey: 42 },
        { tSecs: 8, text: "d" },
      ]),
    ).toEqual([
      { tSecs: 5, text: "a", themeKey: "pricing-model" },
      { tSecs: 6, text: "b", themeKey: null },
      { tSecs: 7, text: "c", themeKey: null },
      { tSecs: 8, text: "d", themeKey: null },
    ]);
    expect(
      parseHighlights([
        { tSecs: 5, themeKey: "onboarding" },
        { tSecs: 6, themeKey: "x".repeat(49) },
      ]),
    ).toEqual([
      { tSecs: 5, note: null, themeKey: "onboarding" },
      { tSecs: 6, note: null, themeKey: null },
    ]);
  });
});

describe("parseCoverage (Slice 2)", () => {
  it("returns [] for non-arrays / garbage (advisory — never throws)", () => {
    expect(parseCoverage(null)).toEqual([]);
    expect(parseCoverage(undefined)).toEqual([]);
    expect(parseCoverage({})).toEqual([]);
    expect(parseCoverage([])).toEqual([]);
    expect(parseCoverage("nope")).toEqual([]);
    expect(parseCoverage([null, 42, "x", {}])).toEqual([]);
  });

  it("keeps valid {key,state} marks, drops bad keys/states", () => {
    expect(
      parseCoverage([
        { key: "pricing", state: "done" },
        { key: "onboarding", state: "touched" },
        { key: "BAD KEY", state: "done" }, // invalid slug → dropped
        { key: "integrations", state: "skipped" }, // invalid state → dropped
        { key: "integrations" }, // missing state → dropped
      ]),
    ).toEqual([
      { key: "pricing", state: "done" },
      { key: "onboarding", state: "touched" },
    ]);
  });

  it("last-write-wins per key", () => {
    expect(
      parseCoverage([
        { key: "pricing", state: "touched" },
        { key: "pricing", state: "done" },
      ]),
    ).toEqual([{ key: "pricing", state: "done" }]);
  });

  it("caps at MAX_COVERAGE", () => {
    const many = Array.from({ length: MAX_COVERAGE + 10 }, (_, i) => ({
      key: `k-${i}`,
      state: "done" as const,
    }));
    expect(parseCoverage(many)).toHaveLength(MAX_COVERAGE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// themed-doc.ts — buildThemedDoc / nearestUtteranceAt / renderThemedBrief
// ─────────────────────────────────────────────────────────────────────────────

const u = (
  start: number,
  end: number,
  text: string,
  speaker = "founder",
  extra: Partial<Utterance> = {},
): Utterance =>
  ({ speaker, channel: speaker === "founder" ? 0 : 1, start, end, text, ...extra });

const LABELS = { founder: "Tomas", participant: "Carlos" };

describe("nearestUtteranceAt", () => {
  const utterances = [u(0, 5, "hello"), u(10, 20, "budget"), u(30, 40, "bye")];

  it("returns the covering utterance, the nearest within 30s, or null", () => {
    expect(nearestUtteranceAt(12, utterances)?.text).toBe("budget");
    expect(nearestUtteranceAt(7, utterances)?.text).toBe("hello"); // 2s vs 3s
    expect(nearestUtteranceAt(69, utterances)?.text).toBe("bye"); // 29s gap
    expect(nearestUtteranceAt(500, utterances)).toBeNull(); // audio gone
    expect(nearestUtteranceAt(5, [])).toBeNull();
  });
});

describe("clockTs", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(clockTs(0)).toBe("0:00");
    expect(clockTs(65)).toBe("1:05");
    expect(clockTs(512)).toBe("8:32");
    expect(clockTs(3725)).toBe("1:02:05");
  });
});

describe("buildThemedDoc", () => {
  const themes = [
    { key: "pricing-model", label: "Pricing model", agenda: true },
    { key: "onboarding", label: "Onboarding", agenda: false },
    { key: "integrations", label: "Integrations", agenda: true },
    { key: "empty-live", label: "Empty live theme", agenda: false },
  ];
  const agenda = [
    { key: "pricing-model", label: "Pricing model" },
    { key: "integrations", label: "Integrations" },
  ];
  const utterances = [
    u(0, 40, "I will resend the invoice", "founder"),
    u(90, 100, "We need the demo in Spanish", "participant"),
    u(500, 520, "We cannot go below fifty dollars", "participant"),
  ];

  const doc = buildThemedDoc({
    themes,
    agenda,
    resolvedNotes: [
      { atSec: 512, quote: "We cannot go below fifty dollars", note: "Floor is $50/mo", themeKey: "pricing-model" },
      { atSec: 95, quote: "We need the demo in Spanish", note: "needs Spanish demo", themeKey: "onboarding" },
      { atSec: 30, quote: "I will resend the invoice", note: "check invoice", themeKey: null },
      { atSec: 31, quote: "I will resend the invoice", note: "unknown key", themeKey: "never-created" },
    ],
    resolvedFlags: [
      { atSec: 505, quote: "We cannot go below fifty dollars", note: "pushback", themeKey: "pricing-model" },
      { atSec: 900, quote: "", note: null, themeKey: "pricing-model" }, // audio gone
    ],
    utterances,
    labels: LABELS,
  });

  it("buckets markers under their theme, sorted by tSecs", () => {
    const pricing = doc.themes.find((t) => t.key === "pricing-model")!;
    expect(pricing.evidence.map((e) => [e.type, e.tSecs])).toEqual([
      ["flag", 505],
      ["note", 512],
      ["flag", 900],
    ]);
    expect(pricing.origin).toBe("agenda");
    expect(pricing.agendaItemKey).toBe("pricing-model");
    expect(pricing.ai).toBeNull();
  });

  it("resolves evidence speakers exactly like buildDialogue would", () => {
    const pricing = doc.themes.find((t) => t.key === "pricing-model")!;
    expect(pricing.evidence[0]).toEqual({
      type: "flag",
      tSecs: 505,
      text: "pushback",
      quote: "We cannot go below fifty dollars",
      speaker: "Carlos",
    });
    // No quote (audio gone) → no speaker either.
    expect(pricing.evidence[2]).toEqual({
      type: "flag",
      tSecs: 900,
      text: null,
      quote: "",
      speaker: "",
    });
    const unfiledFounder = doc.unfiled.find((e) => e.text === "check invoice")!;
    expect(unfiledFounder.speaker).toBe("Tomas");
  });

  it("routes absent AND unknown themeKeys to unfiled (never dropped)", () => {
    expect(doc.unfiled.map((e) => e.text)).toEqual(["check invoice", "unknown key"]);
  });

  it("drops live themes with zero evidence but keeps empty agenda themes as gaps", () => {
    expect(doc.themes.map((t) => t.key)).toEqual([
      "pricing-model",
      "onboarding",
      "integrations",
    ]);
    const integrations = doc.themes.find((t) => t.key === "integrations")!;
    expect(integrations.evidence).toEqual([]);
    expect(integrations.origin).toBe("agenda");
  });

  it("computes deterministic agenda coverage (evidence ⇒ covered, none ⇒ gap)", () => {
    expect(doc.agenda).toEqual([
      { key: "pricing-model", label: "Pricing model", coverage: "covered" },
      { key: "integrations", label: "Integrations", coverage: "gap" },
    ]);
  });

  it("shapes the doc as v1 with a null callSentence pre-AI", () => {
    expect(doc.v).toBe(1);
    expect(doc.callSentence).toBeNull();
  });

  it("marks live origin for themes not on the agenda", () => {
    expect(doc.themes.find((t) => t.key === "onboarding")!.origin).toBe("live");
    expect(doc.themes.find((t) => t.key === "onboarding")!.agendaItemKey).toBeNull();
  });
});

describe("buildThemedDoc — Slice 2 coverage (done precedence)", () => {
  const themes = [
    { key: "pricing-model", label: "Pricing model", agenda: true },
    { key: "integrations", label: "Integrations", agenda: true },
    { key: "hiring", label: "Hiring", agenda: true },
  ];
  const agenda = [
    { key: "pricing-model", label: "Pricing model" },
    { key: "integrations", label: "Integrations" },
    { key: "hiring", label: "Hiring" },
  ];
  const utterances = [u(500, 520, "We cannot go below fifty dollars", "participant")];

  const build = () =>
    buildThemedDoc({
      themes,
      agenda,
      // pricing-model has evidence; integrations + hiring are empty.
      resolvedNotes: [
        { atSec: 512, quote: "We cannot go below fifty dollars", note: "Floor is $50/mo", themeKey: "pricing-model" },
      ],
      resolvedFlags: [],
      utterances,
      labels: LABELS,
      coverage: [
        // done wins over evidence-derived 'covered' AND over 'gap'.
        { key: "pricing-model", state: "done" },
        { key: "integrations", state: "done" },
        { key: "hiring", state: "touched" }, // touched does NOT force coverage
      ],
    });

  it("done marks win over evidence (covered) and over gap; touched is inert", () => {
    expect(build().agenda).toEqual([
      { key: "pricing-model", label: "Pricing model", coverage: "done" }, // had evidence, marked done
      { key: "integrations", label: "Integrations", coverage: "done" }, // no evidence, marked done
      { key: "hiring", label: "Hiring", coverage: "gap" }, // touched-only, no evidence → gap
    ]);
  });

  it("a done item with zero evidence is NOT listed under Gaps", () => {
    const md = renderThemedBrief(build());
    // integrations is done-no-evidence — appears in coverage line, not in Gaps.
    const gapsSection = md.split("## ⛔ Gaps")[1] ?? "";
    expect(gapsSection).not.toContain("Integrations");
    expect(gapsSection).toContain("Hiring"); // the real gap is still listed
  });

  it("renders the ● done line, with '(no notes)' when a done item has no evidence", () => {
    const line = renderThemedBrief(build())
      .split("## Agenda coverage\n")[1]
      .split("\n")[0];
    expect(line).toBe(
      "● Pricing model — done · ● Integrations — done (no notes) · ⛔ Hiring — not discussed",
    );
  });

  it("no coverage marks ⇒ slice-1 behavior (evidence ⇒ covered, none ⇒ gap)", () => {
    const doc = buildThemedDoc({
      themes,
      agenda,
      resolvedNotes: [
        { atSec: 512, quote: "We cannot go below fifty dollars", note: "n", themeKey: "pricing-model" },
      ],
      resolvedFlags: [],
      utterances,
      labels: LABELS,
    });
    expect(doc.agenda.map((a) => a.coverage)).toEqual(["covered", "gap", "gap"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// file-call.ts — cite-gate + call sentence
// ─────────────────────────────────────────────────────────────────────────────

const gateDoc = (evidence: Partial<ThemeEvidence>[] = [{ tSecs: 100 }]): ThemedDoc => ({
  v: 1,
  callSentence: null,
  themes: [
    {
      key: "pricing",
      label: "Pricing",
      origin: "live",
      agendaItemKey: null,
      evidence: evidence.map((e) => ({
        type: "note",
        tSecs: 0,
        text: "n",
        quote: "",
        speaker: "",
        ...e,
      })),
      ai: null,
    },
  ],
  unfiled: [],
  agenda: [],
});

describe("gateThemeExtractions (cite-gate)", () => {
  const utterances = [u(200, 210, "we agreed on the price")];

  it("drops every bullet aimed at a zero-evidence theme (gaps stay honest)", () => {
    const doc = gateDoc([]); // pricing theme exists but has NO operator evidence
    const { aiByTheme, dropped } = gateThemeExtractions(
      [
        {
          key: "pricing",
          committed: [{ text: "we will review the booking flow", cite_t_secs: 200 }],
        },
      ],
      doc,
      utterances, // cite is a valid utterance start — must STILL be dropped
    );
    expect(aiByTheme.has("pricing")).toBe(false);
    expect(dropped).toBe(1);
  });

  it("keeps bullets citing theme evidence within ±2s, drops beyond", () => {
    const { aiByTheme, dropped } = gateThemeExtractions(
      [
        {
          key: "pricing",
          committed: [
            { text: "send sheet", cite_t_secs: 100 }, // exact
            { text: "call back", cite_t_secs: 102 }, // +2s boundary
            { text: "invented", cite_t_secs: 103 }, // +3s → dropped
          ],
        },
      ],
      gateDoc(),
      [],
    );
    expect(aiByTheme.get("pricing")!.committed.map((b) => b.text)).toEqual([
      "send sheet",
      "call back",
    ]);
    expect(dropped).toBe(1);
  });

  it("also accepts cites at any utterance start (±2s), incl. camelCase citeTSecs", () => {
    const { aiByTheme } = gateThemeExtractions(
      [
        {
          key: "pricing",
          decided: [
            { text: "price agreed", cite_t_secs: 201 }, // near utterance start 200
            { text: "camel cite", citeTSecs: 199 },
          ],
        },
      ],
      gateDoc([{ tSecs: 5000 }]),
      utterances,
    );
    expect(aiByTheme.get("pricing")!.decided.map((b) => b.text)).toEqual([
      "price agreed",
      "camel cite",
    ]);
  });

  it("drops banlisted, over-length, missing-cite, and negative-cite bullets", () => {
    const { aiByTheme, dropped } = gateThemeExtractions(
      [
        {
          key: "pricing",
          open: [
            { text: "It seems they will sign", cite_t_secs: 100 }, // banlist
            { text: "We are aligned going forward", cite_t_secs: 100 }, // banlist
            { text: "z".repeat(MAX_AI_BULLET_CHARS + 1), cite_t_secs: 100 }, // too long
            { text: "no cite at all" }, // missing cite
            { text: "negative", cite_t_secs: -5 },
            { text: "ok bullet", cite_t_secs: 100 },
          ],
        },
      ],
      gateDoc(),
      [],
    );
    expect(aiByTheme.get("pricing")!.open.map((b) => b.text)).toEqual(["ok bullet"]);
    expect(dropped).toBe(5);
  });

  it("banlist matches whole words only (unlikely ≠ likely)", () => {
    const { aiByTheme } = gateThemeExtractions(
      [{ key: "pricing", open: [{ text: "Renewal is unlikely-proof per contract", cite_t_secs: 100 }] }],
      gateDoc(),
      [],
    );
    expect(aiByTheme.get("pricing")!.open).toHaveLength(1);
  });

  it("caps at 4 bullets per category per theme", () => {
    const bullets = Array.from({ length: 7 }, (_, i) => ({
      text: `bullet ${i}`,
      cite_t_secs: 100,
    }));
    const { aiByTheme, dropped } = gateThemeExtractions(
      [{ key: "pricing", committed: bullets }],
      gateDoc(),
      [],
    );
    expect(aiByTheme.get("pricing")!.committed).toHaveLength(
      MAX_AI_BULLETS_PER_CATEGORY,
    );
    expect(dropped).toBe(3);
  });

  it("drops whole extractions for invented/unknown theme keys", () => {
    const { aiByTheme, dropped } = gateThemeExtractions(
      [
        { key: "never-mentioned", committed: [{ text: "x", cite_t_secs: 100 }] },
        { key: 42, decided: [{ text: "y", cite_t_secs: 100 }] },
      ],
      gateDoc(),
      [],
    );
    expect(aiByTheme.size).toBe(0);
    expect(dropped).toBe(2);
  });

  it("is robust to garbage input", () => {
    expect(gateThemeExtractions(null, gateDoc(), []).aiByTheme.size).toBe(0);
    expect(gateThemeExtractions("x", gateDoc(), []).aiByTheme.size).toBe(0);
    expect(gateThemeExtractions([null, 3, {}], gateDoc(), []).aiByTheme.size).toBe(0);
  });
});

describe("sanitizeCallSentence", () => {
  it("keeps a clean one-liner, collapses whitespace", () => {
    expect(sanitizeCallSentence("  Deal closed at\n$50/mo.  ")).toBe(
      "Deal closed at $50/mo.",
    );
  });
  it("nulls non-strings, empties, over-160, and banlisted sentences", () => {
    expect(sanitizeCallSentence(undefined)).toBeNull();
    expect(sanitizeCallSentence(42)).toBeNull();
    expect(sanitizeCallSentence("   ")).toBeNull();
    expect(sanitizeCallSentence("a".repeat(161))).toBeNull();
    expect(sanitizeCallSentence("We touched base on pricing")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// renderThemedBrief — exact structure snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("renderThemedBrief", () => {
  const realisticDoc: ThemedDoc = {
    v: 1,
    callSentence: "Call settled the $50 pricing floor and left integrations undiscussed.",
    themes: [
      {
        key: "pricing-model",
        label: "Pricing model",
        origin: "agenda",
        agendaItemKey: "pricing-model",
        evidence: [
          {
            type: "note",
            tSecs: 512,
            text: "Floor is $50/mo",
            quote: "We cannot go below fifty dollars",
            speaker: "Carlos",
          },
          {
            type: "flag",
            tSecs: 784,
            text: "pushback",
            quote: "That is too expensive for posadas",
            speaker: "Carlos",
          },
        ],
        ai: {
          committed: [{ text: "Carlos to send revised pricing sheet Friday", tSecs: 815 }],
          decided: [{ text: "Floor stays at $50/mo", tSecs: 512 }],
          open: [],
        },
      },
      {
        key: "onboarding",
        label: "Onboarding",
        origin: "live",
        agendaItemKey: null,
        evidence: [
          { type: "note", tSecs: 95, text: "needs Spanish demo", quote: "", speaker: "" },
        ],
        ai: null,
      },
      {
        key: "integrations",
        label: "Integrations",
        origin: "agenda",
        agendaItemKey: "integrations",
        evidence: [],
        ai: null,
      },
    ],
    unfiled: [
      {
        type: "note",
        tSecs: 30,
        text: "check invoice",
        quote: "I will resend the invoice",
        speaker: "Tomas",
      },
    ],
    agenda: [
      { key: "pricing-model", label: "Pricing model", coverage: "covered" },
      { key: "integrations", label: "Integrations", coverage: "gap" },
    ],
  };

  it("renders the exact themed structure (2 themes + gap + unfiled)", () => {
    expect(renderThemedBrief(realisticDoc)).toBe(
      [
        "_Call settled the $50 pricing floor and left integrations undiscussed._  ⟦AI⟧",
        "",
        "## Agenda coverage",
        "✅ Pricing model · ⛔ Integrations — not discussed",
        "",
        "## ▸ Pricing model",
        "**Your notes**",
        "- Floor is $50/mo [8:32]",
        "- pushback [13:04]",
        "**Said on the call**",
        '- Carlos [8:32]: "We cannot go below fifty dollars"',
        '- Carlos [13:04]: "That is too expensive for posadas" ★',
        "> **⟦AI⟧**",
        "> - **Committed** — Carlos to send revised pricing sheet Friday [13:35]",
        "> - **Decided** — Floor stays at $50/mo [8:32]",
        "",
        "## ▸ Onboarding",
        "**Your notes**",
        "- needs Spanish demo [1:35]",
        "",
        "## ✎ Unfiled notes",
        '- check invoice [0:30] — "I will resend the invoice"',
        "",
        "## ⛔ Gaps — on your list, no evidence",
        "- **Integrations**",
      ].join("\n"),
    );
  });

  it("contains no legacy AI prose sections", () => {
    const md = renderThemedBrief(realisticDoc);
    expect(md).not.toContain("TL;DR");
    expect(md).not.toContain("Key points");
    expect(md).not.toContain("★ Flagged moments");
    expect(md).not.toContain("✎ Operator notes");
  });

  it("omits sentence/agenda/unfiled/gaps sections when empty", () => {
    const bare = renderThemedBrief({
      v: 1,
      callSentence: null,
      themes: [
        {
          key: "onboarding",
          label: "Onboarding",
          origin: "live",
          agendaItemKey: null,
          evidence: [
            { type: "note", tSecs: 95, text: "needs Spanish demo", quote: "", speaker: "" },
          ],
          ai: null,
        },
      ],
      unfiled: [],
      agenda: [],
    });
    expect(bare).toBe(
      ["## ▸ Onboarding", "**Your notes**", "- needs Spanish demo [1:35]"].join("\n"),
    );
  });

  it("renders quote-only unfiled markers without a dangling text segment", () => {
    const md = renderThemedBrief({
      v: 1,
      callSentence: null,
      themes: [],
      unfiled: [
        { type: "flag", tSecs: 65, text: null, quote: "we sign tomorrow", speaker: "Ana" },
      ],
      agenda: [],
    });
    expect(md).toBe(['## ✎ Unfiled notes', '- [1:05] — "we sign tomorrow"'].join("\n"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fileCallTranscript — themed path + legacy regression
// ─────────────────────────────────────────────────────────────────────────────

describe("fileCallTranscript — themed vs legacy", () => {
  beforeEach(() => {
    claudeWithToolsMock.mockReset();
    claudeChatMock.mockReset();
    updateCallRecordingMock.mockClear();
    createCallMeetingMock.mockClear();
  });

  const baseOpts = {
    workspaceId: "ws-1",
    userId: "user-1",
    recordingId: "rec-1",
    transcript: "[00:05] Founder: hello\n[08:20] Carlos: We cannot go below fifty dollars",
    durationSecs: 900,
    attributed: true,
    founderLabel: "Founder",
  };

  const preDoc = (): ThemedDoc => ({
    v: 1,
    callSentence: null,
    themes: [
      {
        key: "pricing-model",
        label: "Pricing model",
        origin: "live",
        agendaItemKey: null,
        evidence: [
          {
            type: "note",
            tSecs: 512,
            text: "Floor is $50/mo",
            quote: "We cannot go below fifty dollars",
            speaker: "Carlos",
          },
        ],
        ai: null,
      },
    ],
    unfiled: [],
    agenda: [],
  });

  const themedToolResponse = {
    ok: true,
    content: [
      {
        type: "tool_use",
        name: "file_themed_call",
        input: {
          title: "Pricing floor call",
          call_sentence: "Pricing floor held at $50/mo.",
          theme_extractions: [
            {
              key: "pricing-model",
              committed: [],
              decided: [
                { text: "Floor stays at $50/mo", cite_t_secs: 512 },
                { text: "Invented decision", cite_t_secs: 4000 }, // fails cite-gate
              ],
              open: [],
            },
          ],
          note: "Pricing call.",
          action_items: [],
        },
      },
    ],
  };

  it("files a themed call via the extraction tool and renders the themed brief", async () => {
    claudeWithToolsMock.mockResolvedValue(themedToolResponse);

    const res = await fileCallTranscript({
      ...baseOpts,
      themedDoc: preDoc(),
      utterances: [u(500, 520, "We cannot go below fifty dollars", "participant")],
    });

    // Themed tool used, not the legacy one; extraction-only system prompt.
    const call = claudeWithToolsMock.mock.calls[0][0] as {
      system: string;
      tools: { name: string }[];
      messages: { content: string }[];
    };
    expect(call.tools.map((t) => t.name)).toEqual(["file_themed_call"]);
    expect(call.system).toContain("NEVER summarize");
    expect(call.messages[0].content).toContain("THEME SKELETON");
    expect(call.messages[0].content).toContain("pricing-model");

    expect(res.title).toBe("Pricing floor call");
    expect(res.brief).toBe(
      [
        "_Pricing floor held at $50/mo._  ⟦AI⟧",
        "",
        "## ▸ Pricing model",
        "**Your notes**",
        "- Floor is $50/mo [8:32]",
        "**Said on the call**",
        '- Carlos [8:32]: "We cannot go below fifty dollars"',
        "> **⟦AI⟧**",
        "> - **Decided** — Floor stays at $50/mo [8:32]",
      ].join("\n"),
    );
    expect(res.brief).not.toContain("Invented decision");
    expect(res.brief).not.toContain("TL;DR");

    // Completed doc: callSentence + gated ai persisted on the recording.
    expect(res.themedDoc?.callSentence).toBe("Pricing floor held at $50/mo.");
    expect(res.themedDoc?.themes[0].ai).toEqual({
      committed: [],
      decided: [{ text: "Floor stays at $50/mo", tSecs: 512 }],
      open: [],
    });
    expect(updateCallRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ brief: res.brief, themedDoc: res.themedDoc }),
    );
  });

  it("keeps the operator skeleton when the model returns nothing usable", async () => {
    claudeWithToolsMock.mockResolvedValue({ ok: false, content: [] });

    const res = await fileCallTranscript({
      ...baseOpts,
      themedDoc: preDoc(),
      utterances: [],
    });
    // No legacy chat fallback on the themed path — the skeleton IS the brief.
    expect(claudeChatMock).not.toHaveBeenCalled();
    expect(res.brief).toContain("## ▸ Pricing model");
    expect(res.brief).toContain("- Floor is $50/mo [8:32]");
    expect(res.themedDoc?.callSentence).toBeNull();
    expect(res.themedDoc?.themes[0].ai).toBeNull();
  });

  it("falls back to the legacy filing path when themed structuring throws", async () => {
    claudeWithToolsMock
      .mockRejectedValueOnce(new Error("model down"))
      .mockResolvedValueOnce({
        ok: true,
        content: [
          {
            type: "tool_use",
            name: "file_call",
            input: {
              title: "Legacy call",
              brief_markdown: "**TL;DR:** legacy brief",
              note: "n",
              action_items: [],
            },
          },
        ],
      });

    const res = await fileCallTranscript({
      ...baseOpts,
      themedDoc: preDoc(),
      utterances: [],
      operatorNotes: [
        { atSec: 512, quote: "We cannot go below fifty dollars", note: "Floor is $50/mo" },
      ],
    });
    expect(claudeWithToolsMock).toHaveBeenCalledTimes(2);
    expect(res.themedDoc).toBeNull();
    expect(res.brief).toBe(
      [
        "**✎ Operator notes** (typed live during the call):",
        '- [8:32] "We cannot go below fifty dollars" — Floor is $50/mo',
        "",
        "**TL;DR:** legacy brief",
      ].join("\n"),
    );
  });

  it("legacy calls (no themedDoc) keep today's exact path — old blocks intact", async () => {
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

    const res = await fileCallTranscript({
      ...baseOpts,
      flaggedMoments: [
        { atSec: 65, quote: "The budget is forty thousand", note: "money" },
      ],
      operatorNotes: [
        { atSec: 130, quote: "See you next week", note: "book the follow-up" },
      ],
    });
    const call = claudeWithToolsMock.mock.calls[0][0] as { tools: { name: string }[] };
    expect(call.tools.map((t) => t.name)).toEqual(["file_call"]);
    expect(res.themedDoc).toBeNull();
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
    expect(updateCallRecordingMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ themedDoc: expect.anything() }),
    );
  });

  it("an empty-themes doc routes through the legacy path", async () => {
    claudeWithToolsMock.mockResolvedValue({
      ok: true,
      content: [
        {
          type: "tool_use",
          name: "file_call",
          input: {
            title: "T",
            brief_markdown: "**TL;DR:** b",
            note: "n",
            action_items: [],
          },
        },
      ],
    });
    const res = await fileCallTranscript({
      ...baseOpts,
      themedDoc: { v: 1, callSentence: null, themes: [], unfiled: [], agenda: [] },
    });
    expect(res.themedDoc).toBeNull();
    expect(res.brief).toBe("**TL;DR:** b");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recordings detail serializer — themedDoc + agenda surface
// ─────────────────────────────────────────────────────────────────────────────

describe("serializeRecordingDetail — El Cuaderno fields", () => {
  const row = {
    id: "r1",
    workspaceId: "ws",
    title: "Call",
    transcript: "t",
    brief: null,
    language: null,
    durationSecs: null,
    contactId: null,
    meetingId: null,
    actionItemCount: 0,
    audioPath: null,
    audioBytes: null,
    audioPurgeAt: null,
    audioPurgedAt: null,
    channels: 2,
    sourceApp: null,
    utterances: null,
    speakerMap: null,
    transcriptEngine: null,
    suspectFlags: null,
    consentNote: null,
    contactAmbiguous: false,
    partial: false,
    themedDoc: null,
    agenda: null,
    createdBy: "u",
    createdAt: new Date("2026-07-23T10:00:00.000Z"),
  } as unknown as CallRecordingRow;

  it("emits null themedDoc/agenda for legacy recordings", () => {
    const out = serializeRecordingDetail(row, null);
    expect(out.themedDoc).toBeNull();
    expect(out.agenda).toBeNull();
  });

  it("passes stored themedDoc/agenda through as-is", () => {
    const themedDoc = { v: 1, callSentence: null, themes: [], unfiled: [], agenda: [] };
    const agenda = [{ key: "pricing-model", label: "Pricing model" }];
    const out = serializeRecordingDetail(
      { ...row, themedDoc, agenda } as unknown as CallRecordingRow,
      null,
    );
    expect(out.themedDoc).toEqual(themedDoc);
    expect(out.agenda).toEqual(agenda);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Finalize route — agenda/themes intake passthrough
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/capture/sessions/[id]/finalize — themed intake", () => {
  const SESSION_ID = "00000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    resolveCaptureTokenMock.mockReset().mockResolvedValue({
      workspaceId: "ws-1",
      userId: "user-1",
      displayName: "Tomas G",
    });
    getCaptureSessionMock.mockReset().mockResolvedValue({
      id: SESSION_ID,
      workspaceId: "ws-1",
      createdBy: "user-1",
      status: "recording",
      sourceApp: "WhatsApp",
    });
    claimSessionForFinalizeMock.mockReset().mockResolvedValue(true);
    finalizeSessionMock.mockReset().mockResolvedValue({
      ok: true,
      recordingId: "rec-1",
      result: {
        title: "Call",
        brief: "",
        note: "",
        actionItemCount: 0,
        contact: null,
        contactAmbiguous: false,
        meetingId: null,
        themedDoc: null,
      },
      suspectFlags: [],
      partial: false,
    });
  });

  async function post(body: Record<string, unknown>) {
    const { POST } = await import(
      "@/app/api/capture/sessions/[id]/finalize/route"
    );
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(
      `http://x/api/capture/sessions/${SESSION_ID}/finalize`,
      {
        method: "POST",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return POST(req, { params: Promise.resolve({ id: SESSION_ID }) });
  }

  it("parses agenda/themes + marker themeKeys and passes them to finalizeSession", async () => {
    const res = await post({
      totalChunks: 1,
      agenda: [{ key: "pricing-model", label: "Pricing model" }],
      themes: [
        { key: "pricing-model", label: "Pricing model", agenda: true },
        { label: "Onboarding" },
      ],
      notes: [{ tSecs: 512, text: "Floor is $50/mo", themeKey: "pricing-model" }],
      highlights: [{ tSecs: 100, note: "flag", themeKey: "BAD KEY" }],
    });
    expect(res.status).toBe(200);
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        agenda: [{ key: "pricing-model", label: "Pricing model" }],
        themes: [
          { key: "pricing-model", label: "Pricing model", agenda: true },
          { key: "onboarding", label: "Onboarding", agenda: false },
        ],
        notes: [{ tSecs: 512, text: "Floor is $50/mo", themeKey: "pricing-model" }],
        highlights: [{ tSecs: 100, note: "flag", themeKey: null }],
      }),
    );
  });

  it("absent agenda/themes ⇒ empty arrays (legacy helpers unaffected)", async () => {
    const res = await post({ totalChunks: 1 });
    expect(res.status).toBe(200);
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda: [], themes: [] }),
    );
  });

  it("garbage agenda/themes never fail the finalize (advisory parsing)", async () => {
    const res = await post({
      totalChunks: 1,
      agenda: "not-an-array",
      themes: [{ label: "   " }, null, 42],
    });
    expect(res.status).toBe(200);
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ agenda: [], themes: [] }),
    );
  });

  it("parses coverage and passes it to finalizeSession", async () => {
    const res = await post({
      totalChunks: 1,
      coverage: [
        { key: "pricing-model", state: "done", tSecs: 700 },
        { key: "BAD KEY", state: "done" },
      ],
    });
    expect(res.status).toBe(200);
    expect(finalizeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coverage: [{ key: "pricing-model", state: "done" }],
      }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// themed-doc-mutate.ts — assignEvidence / strike (pure)
// ─────────────────────────────────────────────────────────────────────────────

const mutDoc = (): ThemedDoc => ({
  v: 1,
  callSentence: "A one-liner.",
  themes: [
    {
      key: "pricing",
      label: "Pricing",
      origin: "agenda",
      agendaItemKey: "pricing",
      evidence: [
        { type: "note", tSecs: 100, text: "floor", quote: "q", speaker: "Carlos" },
      ],
      ai: { committed: [{ text: "send sheet", tSecs: 100 }], decided: [], open: [] },
    },
    {
      key: "onboarding",
      label: "Onboarding",
      origin: "live",
      agendaItemKey: null,
      evidence: [{ type: "flag", tSecs: 200, text: "note", quote: "", speaker: "" }],
      ai: null,
    },
  ],
  unfiled: [
    { type: "note", tSecs: 300, text: "stray", quote: "invoice", speaker: "Tomas" },
    { type: "flag", tSecs: 305, text: null, quote: "sign", speaker: "Ana" },
  ],
  agenda: [
    { key: "pricing", label: "Pricing", coverage: "covered" },
    { key: "integrations", label: "Integrations", coverage: "gap" },
  ],
});

describe("assignEvidence", () => {
  it("moves an unfiled marker into an existing theme (sorted, input untouched)", () => {
    const doc = mutDoc();
    const next = assignEvidence(
      doc,
      { tSecs: 300, type: "note" },
      { kind: "existing", themeKey: "pricing" },
    )!;
    // Pulled from unfiled, appended to pricing, sorted by tSecs.
    expect(next.themes.find((t) => t.key === "pricing")!.evidence.map((e) => e.tSecs)).toEqual([
      100, 300,
    ]);
    expect(next.unfiled.map((e) => e.text)).toEqual([null]);
    // Immutability: the source doc is unchanged.
    expect(doc.unfiled).toHaveLength(2);
    expect(doc.themes.find((t) => t.key === "pricing")!.evidence).toHaveLength(1);
  });

  it("matches within ±0.5s and preserves the theme's ai block", () => {
    const next = assignEvidence(
      mutDoc(),
      { tSecs: 300.4, type: "note" },
      { kind: "existing", themeKey: "pricing" },
    )!;
    expect(next.themes.find((t) => t.key === "pricing")!.ai).toEqual({
      committed: [{ text: "send sheet", tSecs: 100 }],
      decided: [],
      open: [],
    });
  });

  it("creates a new live theme, seeding agendaItemKey when the slug matches an agenda item", () => {
    const next = assignEvidence(
      mutDoc(),
      { tSecs: 300, type: "note" },
      { kind: "new", label: "Integrations" },
    )!;
    const created = next.themes.find((t) => t.key === "integrations")!;
    expect(created).toMatchObject({
      key: "integrations",
      label: "Integrations",
      origin: "live",
      agendaItemKey: "integrations", // slug matches the agenda item
    });
    expect(created.evidence.map((e) => e.tSecs)).toEqual([300]);
    // Agenda coverage recomputed: integrations now has evidence ⇒ covered.
    expect(next.agenda.find((a) => a.key === "integrations")!.coverage).toBe("covered");
  });

  it("re-files an item between themes and prunes the emptied live source theme", () => {
    const next = assignEvidence(
      mutDoc(),
      { tSecs: 200, type: "flag" },
      { kind: "existing", themeKey: "pricing" },
    )!;
    // onboarding was live with a single flag → now empty → pruned.
    expect(next.themes.map((t) => t.key)).toEqual(["pricing"]);
    expect(next.themes[0].evidence.map((e) => e.tSecs)).toEqual([100, 200]);
  });

  it("returns null when the item can't be located (⇒ route 400)", () => {
    expect(
      assignEvidence(mutDoc(), { tSecs: 999, type: "note" }, { kind: "existing", themeKey: "pricing" }),
    ).toBeNull();
    // Right time, wrong type.
    expect(
      assignEvidence(mutDoc(), { tSecs: 300, type: "flag" }, { kind: "existing", themeKey: "pricing" }),
    ).toBeNull();
  });

  it("returns null for an unknown existing themeKey or an unsluggable new label", () => {
    expect(
      assignEvidence(mutDoc(), { tSecs: 300, type: "note" }, { kind: "existing", themeKey: "ghost" }),
    ).toBeNull();
    expect(
      assignEvidence(mutDoc(), { tSecs: 300, type: "note" }, { kind: "new", label: "¡¡¡" }),
    ).toBeNull();
  });

  it("a 'done' agenda coverage stays sticky through a re-file", () => {
    const doc = mutDoc();
    doc.agenda[0].coverage = "done"; // pricing marked handled
    const next = assignEvidence(
      doc,
      { tSecs: 100, type: "note" },
      { kind: "existing", themeKey: "onboarding" },
    )!;
    // pricing lost its only evidence but stays 'done' (operator said handled).
    expect(next.agenda.find((a) => a.key === "pricing")!.coverage).toBe("done");
  });
});

describe("strike", () => {
  it("nulls a theme's ai block, leaving everything else intact", () => {
    const doc = mutDoc();
    const next = strike(doc, { kind: "theme", themeKey: "pricing" })!;
    expect(next.themes.find((t) => t.key === "pricing")!.ai).toBeNull();
    expect(next.callSentence).toBe("A one-liner.");
    // Immutability.
    expect(doc.themes.find((t) => t.key === "pricing")!.ai).not.toBeNull();
  });

  it("nulls the call sentence, leaving themes intact", () => {
    const next = strike(mutDoc(), { kind: "callSentence" })!;
    expect(next.callSentence).toBeNull();
    expect(next.themes.find((t) => t.key === "pricing")!.ai).not.toBeNull();
  });

  it("returns null for an unknown theme (⇒ route 400)", () => {
    expect(strike(mutDoc(), { kind: "theme", themeKey: "ghost" })).toBeNull();
  });
});

describe("facetsFromThemedDoc", () => {
  it("derives per-theme note/quote/flag counts + evidence-based coverage", () => {
    expect(facetsFromThemedDoc(mutDoc())).toEqual([
      { label: "Pricing", origin: "agenda", noteCount: 1, quoteCount: 1, flagCount: 0, coverage: "covered" },
      { label: "Onboarding", origin: "live", noteCount: 0, quoteCount: 0, flagCount: 1, coverage: "covered" },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Routes — assign-theme (PATCH) + strike (POST)
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_REC_ID = "00000000-0000-4000-8000-0000000000ab";

const routeRecRow = () =>
  ({
    id: ROUTE_REC_ID,
    workspaceId: "ws-1",
    title: "Call",
    transcript: "t",
    brief: "old brief",
    language: null,
    durationSecs: null,
    contactId: null,
    meetingId: null,
    actionItemCount: 0,
    audioPath: null,
    audioBytes: null,
    audioPurgeAt: null,
    audioPurgedAt: null,
    channels: 2,
    sourceApp: "WhatsApp",
    utterances: null,
    speakerMap: null,
    transcriptEngine: null,
    suspectFlags: null,
    consentNote: null,
    contactAmbiguous: false,
    partial: false,
    themedDoc: mutDoc(),
    agenda: null,
    createdBy: "u",
    createdAt: new Date("2026-07-24T10:00:00.000Z"),
  }) as unknown as import("@/db/queries/call-recordings").CallRecordingRow;

describe("PATCH /api/capture/recordings/[id]/assign-theme", () => {
  beforeEach(() => {
    resolveCaptureTokenMock.mockReset().mockResolvedValue({
      workspaceId: "ws-1",
      userId: "user-1",
      displayName: "Tomas G",
    });
    getCallRecordingMock.mockReset().mockResolvedValue(routeRecRow());
    getContactNameMock.mockReset().mockResolvedValue(null);
    updateCallRecordingMock.mockClear();
    replaceCallThemeFacetsMock.mockClear();
  });

  async function patch(body: unknown, id = ROUTE_REC_ID) {
    const { PATCH } = await import(
      "@/app/api/capture/recordings/[id]/assign-theme/route"
    );
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(
      `http://x/api/capture/recordings/${id}/assign-theme`,
      {
        method: "PATCH",
        headers: { authorization: "Bearer t", "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return PATCH(req, { params: Promise.resolve({ id }) });
  }

  it("401 when the capture token doesn't resolve", async () => {
    resolveCaptureTokenMock.mockResolvedValue(null);
    const res = await patch({ tSecs: 300, type: "note", themeKey: "pricing" });
    expect(res.status).toBe(401);
  });

  it("404 for a non-uuid id and for an unknown recording", async () => {
    expect((await patch({ tSecs: 300, type: "note", themeKey: "pricing" }, "not-a-uuid")).status).toBe(404);
    getCallRecordingMock.mockResolvedValue(null);
    expect((await patch({ tSecs: 300, type: "note", themeKey: "pricing" })).status).toBe(404);
  });

  it("400 for bad body (missing type, or both/neither target)", async () => {
    expect((await patch({ tSecs: 300, themeKey: "pricing" })).status).toBe(400);
    expect((await patch({ tSecs: 300, type: "note" })).status).toBe(400); // neither
    expect(
      (await patch({ tSecs: 300, type: "note", themeKey: "pricing", newTheme: { label: "X" } })).status,
    ).toBe(400); // both
  });

  it("400 when the evidence item can't be found", async () => {
    const res = await patch({ tSecs: 999, type: "note", themeKey: "pricing" });
    expect(res.status).toBe(400);
    expect(updateCallRecordingMock).not.toHaveBeenCalled();
  });

  it("happy path: moves the marker, persists themed_doc + brief, rebuilds facets, returns recording", async () => {
    const res = await patch({ tSecs: 300, type: "note", themeKey: "pricing" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { recording: { themedDoc: ThemedDoc; brief: string } };
    // The stray note is now under pricing; unfiled shrank.
    expect(json.recording.themedDoc.themes.find((t) => t.key === "pricing")!.evidence).toHaveLength(2);
    expect(json.recording.themedDoc.unfiled).toHaveLength(1);
    // Persistence: themed_doc + re-rendered brief.
    expect(updateCallRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ROUTE_REC_ID,
        workspaceId: "ws-1",
        themedDoc: expect.objectContaining({ v: 1 }),
        brief: json.recording.brief,
      }),
    );
    // Facets rebuilt for the workspace/call.
    expect(replaceCallThemeFacetsMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1", callId: ROUTE_REC_ID }),
    );
  });
});

describe("POST /api/capture/recordings/[id]/strike", () => {
  beforeEach(() => {
    resolveCaptureTokenMock.mockReset().mockResolvedValue({
      workspaceId: "ws-1",
      userId: "user-1",
      displayName: "Tomas G",
    });
    getCallRecordingMock.mockReset().mockResolvedValue(routeRecRow());
    getContactNameMock.mockReset().mockResolvedValue(null);
    updateCallRecordingMock.mockClear();
  });

  async function post(body: unknown, id = ROUTE_REC_ID) {
    const { POST } = await import("@/app/api/capture/recordings/[id]/strike/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest(`http://x/api/capture/recordings/${id}/strike`, {
      method: "POST",
      headers: { authorization: "Bearer t", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ id }) });
  }

  it("401 when the capture token doesn't resolve", async () => {
    resolveCaptureTokenMock.mockResolvedValue(null);
    expect((await post({ target: "callSentence" })).status).toBe(401);
  });

  it("404 for a non-uuid id", async () => {
    expect((await post({ target: "callSentence" }, "nope")).status).toBe(404);
  });

  it("400 for a bad target and for an unknown theme", async () => {
    expect((await post({ target: "bogus" })).status).toBe(400);
    expect((await post({ target: "theme" })).status).toBe(400); // missing themeKey
    expect((await post({ target: "theme", themeKey: "ghost" })).status).toBe(400);
    expect(updateCallRecordingMock).not.toHaveBeenCalled();
  });

  it("strikes a theme's ai and persists the re-rendered brief", async () => {
    const res = await post({ target: "theme", themeKey: "pricing" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { recording: { themedDoc: ThemedDoc } };
    expect(json.recording.themedDoc.themes.find((t) => t.key === "pricing")!.ai).toBeNull();
    expect(updateCallRecordingMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: ROUTE_REC_ID, themedDoc: expect.objectContaining({ v: 1 }) }),
    );
  });

  it("strikes the call sentence", async () => {
    const res = await post({ target: "callSentence" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { recording: { themedDoc: ThemedDoc } };
    expect(json.recording.themedDoc.callSentence).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — buildSpeakerScaffold (dual-channel excludes founder; mixed keeps all)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSpeakerScaffold", () => {
  it("dual-channel: excludes the founder side, counts participant turns", () => {
    const utterances = [
      u(0, 5, "hi", "founder"),
      u(6, 10, "hello", "participant"),
      u(11, 15, "and one more", "participant"),
      u(16, 20, "ok", "founder"),
    ];
    const scaffold = buildSpeakerScaffold(utterances, {
      founder: "Tomas",
      participant: "Carlos",
    });
    expect(scaffold).toEqual([
      { speaker: "Carlos", headline: "", turnCount: 2, commitments: [], raised: [] },
    ]);
  });

  it("mixed-acoustic: keeps every diarization cluster as a participant", () => {
    const utterances = [
      u(0, 5, "a", "SPEAKER_00", { diarizationId: "SPEAKER_00", channel: 0 }),
      u(6, 10, "b", "SPEAKER_01", { diarizationId: "SPEAKER_01", channel: 0 }),
      u(11, 15, "c", "SPEAKER_00", { diarizationId: "SPEAKER_00", channel: 0 }),
      u(16, 20, "d", "SPEAKER_02", { diarizationId: "SPEAKER_02", channel: 0 }),
    ];
    // founder="Room" is a channel label no cluster resolves to → nothing dropped.
    const scaffold = buildSpeakerScaffold(utterances, {
      founder: "Room",
      participant: "Remote",
    });
    expect(scaffold.map((s) => [s.speaker, s.turnCount])).toEqual([
      ["SPEAKER_00", 2],
      ["SPEAKER_01", 1],
      ["SPEAKER_02", 1],
    ]);
  });

  it("mixed-acoustic: resolves clusters through speakerMap to display names", () => {
    const utterances = [
      u(0, 5, "a", "SPEAKER_00", { diarizationId: "SPEAKER_00", channel: 0 }),
      u(6, 10, "b", "SPEAKER_01", { diarizationId: "SPEAKER_01", channel: 0 }),
    ];
    const scaffold = buildSpeakerScaffold(utterances, {
      founder: "Room",
      participant: "Remote",
      speakerMap: { SPEAKER_00: "Ana", SPEAKER_01: "Beto" },
    });
    expect(scaffold.map((s) => s.speaker)).toEqual(["Ana", "Beto"]);
  });

  it("buildThemedDoc emits the scaffold + null audit", () => {
    const doc = buildThemedDoc({
      themes: [{ key: "t", label: "T", agenda: false }],
      agenda: [],
      resolvedNotes: [
        { atSec: 8, quote: "hello", note: "n", themeKey: "t" },
      ],
      resolvedFlags: [],
      utterances: [u(0, 5, "hi", "founder"), u(6, 10, "hello", "participant")],
      labels: { founder: "Tomas", participant: "Carlos" },
    });
    expect(doc.audit).toBeNull();
    expect(doc.speakers).toEqual([
      { speaker: "Carlos", headline: "", turnCount: 1, commitments: [], raised: [] },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — shouldRunAudit threshold
// ─────────────────────────────────────────────────────────────────────────────

const emptyDoc = (over: Partial<ThemedDoc> = {}): ThemedDoc => ({
  v: 1,
  callSentence: null,
  themes: [],
  unfiled: [],
  agenda: [],
  speakers: [],
  audit: null,
  ...over,
});

const spk = (speaker: string, turnCount = 1) => ({
  speaker,
  headline: "",
  turnCount,
  commitments: [],
  raised: [],
});

describe("shouldRunAudit (threshold)", () => {
  it("runs when ≥2 distinct participants", () => {
    expect(shouldRunAudit(emptyDoc({ speakers: [spk("Ana"), spk("Beto")] }))).toBe(true);
  });
  it("runs when ≥1 agenda item even with <2 speakers", () => {
    expect(
      shouldRunAudit(emptyDoc({ speakers: [spk("Ana")], agenda: [{ key: "x", label: "X", coverage: "gap" }] })),
    ).toBe(true);
  });
  it("skips a 1-on-1 with no agenda", () => {
    expect(shouldRunAudit(emptyDoc({ speakers: [spk("Ana")] }))).toBe(false);
    expect(shouldRunAudit(emptyDoc())).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — gateAudit (cite-gate + owner scaffold + due_source + caps)
// ─────────────────────────────────────────────────────────────────────────────

const auditDoc = (): ThemedDoc =>
  emptyDoc({
    agenda: [{ key: "x", label: "X", coverage: "gap" }],
    speakers: [spk("Ana", 3), spk("Beto", 2)],
  });

const auditUtts = [u(100, 110, "..."), u(200, 210, "...")];

describe("gateAudit (cite-gate)", () => {
  it("keeps valid items, attaches to speaker + audit block", () => {
    const { audit, speakers, dropped } = gateAudit(
      {
        commitments: [
          { owner: "Ana", text: "send sheet", quote: "I'll send it", cite_t_secs: 100, due: "Friday", due_source: "spoken" },
          { owner: "Ghost", text: "x", quote: "y", cite_t_secs: 100 }, // owner not in scaffold
          { owner: "Ana", text: "we are aligned going forward", quote: "q", cite_t_secs: 100 }, // banlist
          { owner: "Beto", text: "no cite match", quote: "q", cite_t_secs: 500 }, // cite off
          { owner: "Ana", text: "no quote", quote: "", cite_t_secs: 100 }, // empty quote
        ],
        blockers: [
          { kind: "risk", text: "budget risk", quote: "q", cite_t_secs: 200, raised_by: "Beto" },
          { kind: "bogus", text: "x", quote: "q", cite_t_secs: 200, raised_by: "Beto" }, // bad kind
        ],
        decisions: [
          { text: "go with plan A", cite_t_secs: 100 },
          { text: "seems fine", cite_t_secs: 100 }, // banlist
        ],
        speakers: [{ speaker: "Ana", headline: "Drove pricing" }, { speaker: "Ghost", headline: "x" }],
      },
      auditDoc(),
      auditUtts,
    );

    expect(audit.commitments).toEqual([
      { owner: "Ana", text: "send sheet", quote: "I'll send it", tSecs: 100, due: "Friday", dueSource: "spoken" },
    ]);
    expect(audit.blockers).toEqual([
      { kind: "risk", text: "budget risk", quote: "q", tSecs: 200, raisedBy: "Beto" },
    ]);
    expect(audit.decisions).toEqual([{ text: "go with plan A", tSecs: 100 }]);

    const ana = speakers.find((s) => s.speaker === "Ana")!;
    const beto = speakers.find((s) => s.speaker === "Beto")!;
    expect(ana.headline).toBe("Drove pricing");
    expect(ana.commitments).toHaveLength(1);
    expect(beto.raised).toHaveLength(1);
    // commitment(Ghost) + commitment(banlist) + commitment(cite) + commitment(no quote)
    // + blocker(bad kind) + decision(banlist) = 6
    expect(dropped).toBe(6);
  });

  it("accepts a cite at the ±2s boundary, rejects beyond, and never mutates the input doc", () => {
    const doc = auditDoc();
    const { audit } = gateAudit(
      {
        commitments: [
          { owner: "Ana", text: "edge", quote: "q", cite_t_secs: 102, due_source: "absent" }, // +2s ok
          { owner: "Ana", text: "past", quote: "q", cite_t_secs: 103 }, // +3s dropped
        ],
        blockers: [],
        decisions: [],
        speakers: [],
      },
      doc,
      auditUtts,
    );
    expect(audit.commitments.map((c) => c.text)).toEqual(["edge"]);
    // due absent ⇒ null + "absent"
    expect(audit.commitments[0]).toMatchObject({ due: null, dueSource: "absent" });
    // input doc's scaffold is untouched
    expect(doc.speakers!.every((s) => s.commitments.length === 0)).toBe(true);
  });

  it("due_source='spoken' without a due string falls back to absent", () => {
    const { audit } = gateAudit(
      {
        commitments: [{ owner: "Ana", text: "t", quote: "q", cite_t_secs: 100, due_source: "spoken" }],
        blockers: [],
        decisions: [],
        speakers: [],
      },
      auditDoc(),
      auditUtts,
    );
    expect(audit.commitments[0]).toMatchObject({ due: null, dueSource: "absent" });
  });

  it("caps commitments and drops the overflow", () => {
    const many = Array.from({ length: MAX_AUDIT_COMMITMENTS + 5 }, (_, i) => ({
      owner: "Ana",
      text: `c${i}`,
      quote: "q",
      cite_t_secs: 100,
    }));
    const { audit, dropped } = gateAudit(
      { commitments: many, blockers: [], decisions: [], speakers: [] },
      auditDoc(),
      auditUtts,
    );
    expect(audit.commitments).toHaveLength(MAX_AUDIT_COMMITMENTS);
    expect(dropped).toBe(5);
  });

  it("is robust to garbage input", () => {
    const { audit, speakers, dropped } = gateAudit(null, auditDoc(), auditUtts);
    expect(audit).toEqual({ commitments: [], blockers: [], decisions: [] });
    expect(speakers.map((s) => s.speaker)).toEqual(["Ana", "Beto"]);
    expect(dropped).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — gateSupporting (librarian cite-gate + contradicts)
// ─────────────────────────────────────────────────────────────────────────────

const supportingDoc = (): ThemedDoc =>
  emptyDoc({
    themes: [
      {
        key: "pricing",
        label: "Pricing",
        origin: "agenda",
        agendaItemKey: "pricing",
        evidence: [{ type: "note", tSecs: 100, text: "floor", quote: "q", speaker: "Ana" }],
        ai: null,
      },
      {
        key: "empty",
        label: "Empty",
        origin: "agenda",
        agendaItemKey: "empty",
        evidence: [],
        ai: null,
      },
    ],
  });

const supUtts = [u(200, 210, "posadas won't pay that at all", "participant")];

describe("gateSupporting (librarian cite-gate)", () => {
  it("keeps verbatim-verified quotes incl. contradicts, drops the rest", () => {
    const { byTheme, dropped } = gateSupporting(
      {
        themes: [
          {
            key: "pricing",
            quotes: [
              { quote: "posadas won't pay that", cite_t_secs: 200, relevance: "contradicts" }, // verbatim substring
              { quote: "totally made up line", cite_t_secs: 200, relevance: "supports" }, // not in utterance
              { quote: "posadas won't pay that", cite_t_secs: 200, relevance: "bogus" }, // bad relevance
            ],
          },
          { key: "empty", quotes: [{ quote: "posadas won't pay that", cite_t_secs: 200, relevance: "supports" }] }, // gap theme
          { key: "ghost", quotes: [{ quote: "x", cite_t_secs: 200, relevance: "supports" }] }, // unknown key
        ],
      },
      supportingDoc(),
      supUtts,
    );
    expect(byTheme.get("pricing")).toEqual([
      { tSecs: 200, quote: "posadas won't pay that", relevance: "contradicts" },
    ]);
    expect(byTheme.has("empty")).toBe(false);
    // made-up + bogus-relevance + gap-theme + unknown-key = 4
    expect(dropped).toBe(4);
  });

  it("caps supporting quotes per theme at MAX_SUPPORTING_PER_THEME", () => {
    const quotes = Array.from({ length: MAX_SUPPORTING_PER_THEME + 2 }, () => ({
      quote: "posadas won't pay that",
      cite_t_secs: 200,
      relevance: "supports" as const,
    }));
    const { byTheme, dropped } = gateSupporting(
      { themes: [{ key: "pricing", quotes }] },
      supportingDoc(),
      supUtts,
    );
    expect(byTheme.get("pricing")).toHaveLength(MAX_SUPPORTING_PER_THEME);
    expect(dropped).toBe(2);
  });

  it("is robust to garbage input", () => {
    expect(gateSupporting(null, supportingDoc(), supUtts).byTheme.size).toBe(0);
    expect(gateSupporting({ themes: "x" }, supportingDoc(), supUtts).byTheme.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Slice 3 — renderThemedBrief with audit/by-speaker/supporting/next-steps
// ─────────────────────────────────────────────────────────────────────────────

describe("renderThemedBrief — Slice 3 sections", () => {
  const slice3Doc: ThemedDoc = {
    v: 1,
    callSentence: null,
    themes: [
      {
        key: "pricing",
        label: "Pricing",
        origin: "agenda",
        agendaItemKey: "pricing",
        evidence: [
          { type: "note", tSecs: 100, text: "floor $50", quote: "we can't go below fifty", speaker: "Ana" },
        ],
        ai: {
          committed: [],
          decided: [],
          open: [],
          supporting: [
            { tSecs: 200, quote: "posadas won't pay that", relevance: "contradicts" },
            { tSecs: 150, quote: "fifty is our floor", relevance: "constraint" },
          ],
        },
      },
    ],
    unfiled: [],
    agenda: [{ key: "pricing", label: "Pricing", coverage: "covered" }],
    speakers: [
      {
        speaker: "Ana",
        headline: "Pushed the $50 floor",
        turnCount: 5,
        commitments: [
          { owner: "Ana", text: "send revised sheet Friday", quote: "I'll send it Friday", tSecs: 300, due: "Friday", dueSource: "spoken" },
        ],
        raised: [],
      },
      {
        speaker: "Beto",
        headline: "Raised the posada affordability blocker",
        turnCount: 3,
        commitments: [],
        raised: [
          { kind: "blocker", text: "posadas can't afford $50", quote: "posadas won't pay that", tSecs: 200, raisedBy: "Beto" },
        ],
      },
    ],
    audit: {
      commitments: [
        { owner: "Ana", text: "send revised sheet Friday", quote: "I'll send it Friday", tSecs: 300, due: "Friday", dueSource: "spoken" },
      ],
      blockers: [
        { kind: "blocker", text: "posadas can't afford $50", quote: "posadas won't pay that", tSecs: 200, raisedBy: "Beto" },
      ],
      decisions: [{ text: "Floor stays at $50", tSecs: 150 }],
    },
    nextSteps: [
      { title: "Send revised pricing sheet", due: "2026-07-25" },
      { title: "Follow up with Beto", due: null },
    ],
  };

  it("renders commitments, blockers, by-speaker, next steps, and the contradicts quote", () => {
    expect(renderThemedBrief(slice3Doc)).toBe(
      [
        "## Agenda coverage",
        "✅ Pricing",
        "",
        "## ▸ Pricing",
        "**Your notes**",
        "- floor $50 [1:40]",
        "**Said on the call**",
        '- Ana [1:40]: "we can\'t go below fifty"',
        "> **⟦AI · also said⟧**",
        '> - **contradicts** — "posadas won\'t pay that" [3:20]',
        '> - constraint — "fifty is our floor" [2:30]',
        "",
        "## ⚑ Commitments",
        '- **Ana** — send revised sheet Friday — Friday [5:00] "I\'ll send it Friday"',
        "",
        "## ⚠ Blockers & issues raised",
        '- **blocker** (Beto) — posadas can\'t afford $50 [3:20] "posadas won\'t pay that"',
        "",
        "## 🗣 By speaker",
        "### Ana · 5 turns",
        "Pushed the $50 floor",
        "- committed: send revised sheet Friday [5:00]",
        "",
        "### Beto · 3 turns",
        "Raised the posada affordability blocker",
        "- raised: blocker — posadas can't afford $50 [3:20]",
        "",
        "## → Next steps",
        "- Send revised pricing sheet — 2026-07-25",
        "- Follow up with Beto",
      ].join("\n"),
    );
  });

  it("a slice-1/2 doc (no audit/speakers/supporting) renders byte-identically to before", () => {
    const legacy: ThemedDoc = {
      v: 1,
      callSentence: null,
      themes: [
        {
          key: "onboarding",
          label: "Onboarding",
          origin: "live",
          agendaItemKey: null,
          evidence: [{ type: "note", tSecs: 95, text: "needs Spanish demo", quote: "", speaker: "" }],
          ai: null,
        },
      ],
      unfiled: [],
      agenda: [],
    };
    expect(renderThemedBrief(legacy)).toBe(
      ["## ▸ Onboarding", "**Your notes**", "- needs Spanish demo [1:35]"].join("\n"),
    );
  });
});
