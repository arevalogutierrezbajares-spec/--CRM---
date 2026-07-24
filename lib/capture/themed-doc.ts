/**
 * El Cuaderno Slice 1 — theme-structured call documents.
 *
 * The operator's live #theme tags build the skeleton of the filed call doc:
 * every theme carries his notes verbatim + resolved quotes + flags; AI later
 * contributes ONLY per-theme committed/decided/open bullets (cite-gated in
 * file-call.ts) + one optional call sentence. There is no AI TL;DR, no Key
 * points, no free prose anywhere.
 *
 * Everything in this module is PURE (no db, no network) so it can be tested
 * exhaustively. The speaker of each evidence element is resolved through the
 * exact same label logic buildDialogue uses (resolveSpeakerLabel), so the doc
 * and the transcript always agree on who said what.
 */
import {
  resolveSpeakerLabel,
  type DialogueLabels,
  type Utterance,
} from "./deepgram";
import { MAX_HIGHLIGHT_MATCH_GAP_SECS } from "./constants";
import type { FlaggedMoment, ResolvedOperatorNote } from "./finalize";
import type { AgendaItem, CoverageMark, LiveTheme } from "./validate";

/** One time-anchored operator marker filed under a theme (or unfiled). */
export type ThemeEvidence = {
  type: "note" | "flag";
  tSecs: number;
  /** The operator's own typed words (note text / flag note). Null = bare flag. */
  text: string | null;
  /** Words spoken at that moment ("" when the backing audio is gone). */
  quote: string;
  /** Display name of the utterance the marker resolved to ("" when no match). */
  speaker: string;
};

/** One AI-extracted bullet; tSecs is the cite-gated evidence timestamp. */
export type ThemeAiBullet = { text: string; tSecs: number };

/** Per-theme AI extraction (cite-gated). Null until/unless the AI pass ran. */
export type ThemeAi = {
  committed: ThemeAiBullet[];
  decided: ThemeAiBullet[];
  open: ThemeAiBullet[];
};

export type ThemedDocTheme = {
  key: string;
  label: string;
  origin: "agenda" | "live";
  /** Agenda item this theme was seeded from; null for live-created themes. */
  agendaItemKey: string | null;
  evidence: ThemeEvidence[];
  ai: ThemeAi | null;
};

export type ThemedDocAgendaItem = {
  key: string;
  label: string;
  /**
   * 'done' = operator marked it handled (wire coverage), sticky across re-files;
   * 'covered' = ≥1 evidence; 'gap' = on the agenda, nothing captured.
   */
  coverage: "done" | "covered" | "gap";
};

/** The structured call document persisted in call_recordings.themed_doc. */
export type ThemedDoc = {
  v: 1;
  /** ≤160-char single AI sentence about the call; null until the AI pass. */
  callSentence: string | null;
  themes: ThemedDocTheme[];
  /** Markers whose themeKey was absent/unknown — never silently dropped. */
  unfiled: ThemeEvidence[];
  agenda: ThemedDocAgendaItem[];
};

/**
 * The utterance covering tSecs, or the nearest one within
 * {@link MAX_HIGHLIGHT_MATCH_GAP_SECS} — the same matching rule quoteAt in
 * finalize.ts applies, so an evidence element's speaker always belongs to the
 * utterance its quote came from. Null when nothing is close enough.
 */
export function nearestUtteranceAt(
  tSecs: number,
  utterances: Utterance[],
): Utterance | null {
  let best: Utterance | null = null;
  let bestDist = Infinity;
  for (const u of utterances) {
    const dist =
      tSecs >= u.start && tSecs <= u.end
        ? 0
        : Math.min(Math.abs(u.start - tSecs), Math.abs(u.end - tSecs));
    if (dist < bestDist) {
      bestDist = dist;
      best = u;
      if (dist === 0) break;
    }
  }
  return bestDist <= MAX_HIGHLIGHT_MATCH_GAP_SECS ? best : null;
}

/** mm:ss (or h:mm:ss) clock for doc timestamps — same shape file-call uses. */
export function clockTs(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${m}:${pad(ss)}`;
}

/**
 * Build the pre-AI themed document: bucket the operator's resolved markers by
 * themeKey into the theme skeleton, compute deterministic agenda coverage, and
 * leave `ai`/`callSentence` null for the filing pass to fill (cite-gated).
 *
 * Rules:
 * - Markers with an unknown/absent themeKey land in `unfiled` (never dropped).
 * - Live-created themes with zero evidence are dropped; agenda-seeded themes
 *   are always kept — they are the gaps the operator wants to see.
 * - Evidence within each bucket is sorted by tSecs (call order).
 * - Agenda coverage (slice 2): the operator marked it done (wire) → 'done';
 *   else the matching theme has ≥1 evidence → 'covered'; else → 'gap'.
 */
export function buildThemedDoc(opts: {
  themes: LiveTheme[];
  agenda: AgendaItem[];
  resolvedNotes: ResolvedOperatorNote[];
  resolvedFlags: FlaggedMoment[];
  utterances: Utterance[];
  /** Speaker labels — the same ones the dialogue was built with. */
  labels: DialogueLabels;
  /** Slice 2: operator's live agenda coverage marks (advisory). */
  coverage?: CoverageMark[];
}): ThemedDoc {
  const { themes, agenda, resolvedNotes, resolvedFlags, utterances, labels } = opts;

  const speakerAt = (tSecs: number): string => {
    const u = nearestUtteranceAt(tSecs, utterances);
    return u ? resolveSpeakerLabel(u, labels) : "";
  };

  const evidence: { themeKey: string | null; e: ThemeEvidence }[] = [
    ...resolvedNotes.map((n) => ({
      themeKey: n.themeKey,
      e: {
        type: "note" as const,
        tSecs: n.atSec,
        text: n.note,
        quote: n.quote,
        speaker: n.quote ? speakerAt(n.atSec) : "",
      },
    })),
    ...resolvedFlags.map((f) => ({
      themeKey: f.themeKey,
      e: {
        type: "flag" as const,
        tSecs: f.atSec,
        text: f.note,
        quote: f.quote,
        speaker: f.quote ? speakerAt(f.atSec) : "",
      },
    })),
  ];

  const agendaKeys = new Set(agenda.map((a) => a.key));
  const themeKeys = new Set(themes.map((t) => t.key));

  const buckets = new Map<string, ThemeEvidence[]>();
  for (const t of themes) buckets.set(t.key, []);
  const unfiled: ThemeEvidence[] = [];
  for (const { themeKey, e } of evidence) {
    // Unknown/invalid themeKey on a marker ⇒ treat as absent (unfiled).
    if (themeKey && themeKeys.has(themeKey)) buckets.get(themeKey)!.push(e);
    else unfiled.push(e);
  }
  const byTime = (a: ThemeEvidence, b: ThemeEvidence) => a.tSecs - b.tSecs;
  for (const list of buckets.values()) list.sort(byTime);
  unfiled.sort(byTime);

  const docThemes: ThemedDocTheme[] = themes
    .map((t): ThemedDocTheme => {
      const seededFromAgenda = t.agenda || agendaKeys.has(t.key);
      return {
        key: t.key,
        label: t.label,
        origin: seededFromAgenda ? "agenda" : "live",
        agendaItemKey: agendaKeys.has(t.key) ? t.key : null,
        evidence: buckets.get(t.key) ?? [],
        ai: null,
      };
    })
    // Live themes with zero evidence carry nothing — drop. Agenda-seeded
    // themes are kept: an empty one IS the signal (a gap on the agenda).
    .filter((t) => t.evidence.length > 0 || t.origin === "agenda");

  const doneKeys = new Set(
    (opts.coverage ?? []).filter((c) => c.state === "done").map((c) => c.key),
  );
  const themeByKey = new Map(docThemes.map((t) => [t.key, t]));
  const agendaOut: ThemedDocAgendaItem[] = agenda.map((a) => {
    const theme = themeByKey.get(a.key);
    const coverage: ThemedDocAgendaItem["coverage"] = doneKeys.has(a.key)
      ? "done"
      : theme && theme.evidence.length > 0
        ? "covered"
        : "gap";
    return { key: a.key, label: a.label, coverage };
  });

  return { v: 1, callSentence: null, themes: docThemes, unfiled, agenda: agendaOut };
}

/**
 * Render the themed document as the Markdown brief. This lands in the existing
 * `brief` column so every legacy reader (CRM views, meeting minutes, helper)
 * keeps working — but the structure is the operator's themes, not AI prose.
 *
 * Exact structure (spec-pinned):
 *
 *   _<callSentence>_  ⟦AI⟧              (omitted when null)
 *   ## Agenda coverage                   (omitted when no agenda)
 *   ## ▸ <Theme label>                   (one per theme with content)
 *     **Your notes** …
 *     **Said on the call** …
 *     > **⟦AI⟧** committed/decided/open  (omitted when no gated bullets)
 *   ## ✎ Unfiled notes                   (omitted when empty)
 *   ## ⛔ Gaps — on your list, no evidence (omitted when none)
 */
export function renderThemedBrief(doc: ThemedDoc): string {
  const parts: string[] = [];

  if (doc.callSentence) {
    parts.push(`_${doc.callSentence}_  ⟦AI⟧`);
  }

  if (doc.agenda.length > 0) {
    const themeByKey = new Map(doc.themes.map((t) => [t.key, t]));
    const line = doc.agenda
      .map((a) => {
        if (a.coverage === "done") {
          // Operator marked it handled: '● … — done', noting when no notes back it.
          const theme = themeByKey.get(a.key);
          const suffix = theme && theme.evidence.length > 0 ? "" : " (no notes)";
          return `● ${a.label} — done${suffix}`;
        }
        return a.coverage === "covered"
          ? `✅ ${a.label}`
          : `⛔ ${a.label} — not discussed`;
      })
      .join(" · ");
    parts.push(`## Agenda coverage\n${line}`);
  }

  for (const theme of doc.themes) {
    const hasAi =
      theme.ai !== null &&
      theme.ai.committed.length + theme.ai.decided.length + theme.ai.open.length > 0;
    // Empty agenda-seeded themes render under Gaps, not as hollow sections.
    if (theme.evidence.length === 0 && !hasAi) continue;

    const lines: string[] = [`## ▸ ${theme.label}`];

    // The operator's own words, verbatim — notes and flag annotations alike.
    const noteLines = theme.evidence
      .filter((e) => e.text !== null)
      .map((e) => `- ${e.text} [${clockTs(e.tSecs)}]`);
    if (noteLines.length > 0) {
      lines.push("**Your notes**", ...noteLines);
    }

    const quoteLines = theme.evidence
      .filter((e) => e.quote !== "")
      .map((e) => {
        const star = e.type === "flag" ? " ★" : "";
        return `- ${e.speaker} [${clockTs(e.tSecs)}]: "${e.quote}"${star}`;
      });
    if (quoteLines.length > 0) {
      lines.push("**Said on the call**", ...quoteLines);
    }

    if (hasAi && theme.ai) {
      const aiLines: string[] = ["> **⟦AI⟧**"];
      const cat = (label: string, bullets: ThemeAiBullet[]) => {
        for (const b of bullets) {
          aiLines.push(`> - **${label}** — ${b.text} [${clockTs(b.tSecs)}]`);
        }
      };
      cat("Committed", theme.ai.committed);
      cat("Decided", theme.ai.decided);
      cat("Open", theme.ai.open);
      lines.push(aiLines.join("\n"));
    }

    parts.push(lines.join("\n"));
  }

  if (doc.unfiled.length > 0) {
    const lines = doc.unfiled.map((e) => {
      const text = e.text !== null ? `${e.text} ` : "";
      const quote = e.quote !== "" ? ` — "${e.quote}"` : "";
      return `- ${text}[${clockTs(e.tSecs)}]${quote}`;
    });
    parts.push(`## ✎ Unfiled notes\n${lines.join("\n")}`);
  }

  const gaps = doc.agenda.filter((a) => a.coverage === "gap");
  if (gaps.length > 0) {
    parts.push(
      `## ⛔ Gaps — on your list, no evidence\n${gaps
        .map((g) => `- **${g.label}**`)
        .join("\n")}`,
    );
  }

  return parts.join("\n\n").trim();
}

/** One per-call per-theme facet rollup (mirrors CallThemeFacetInput). */
export type ThemedDocFacet = {
  label: string;
  origin: "agenda" | "live";
  noteCount: number;
  quoteCount: number;
  flagCount: number;
  coverage: "covered" | "gap";
};

/**
 * Derive the per-theme facet rollups powering cross-call theme queries. Pure —
 * shared by the finalize pipeline and the Slice 2 re-file route so both persist
 * facets identically. Coverage is evidence-based (≥1 evidence ⇒ 'covered').
 */
export function facetsFromThemedDoc(doc: ThemedDoc): ThemedDocFacet[] {
  return doc.themes.map((t) => ({
    label: t.label,
    origin: t.origin,
    noteCount: t.evidence.filter((e) => e.type === "note").length,
    quoteCount: t.evidence.filter((e) => e.quote !== "").length,
    flagCount: t.evidence.filter((e) => e.type === "flag").length,
    coverage: t.evidence.length > 0 ? ("covered" as const) : ("gap" as const),
  }));
}
