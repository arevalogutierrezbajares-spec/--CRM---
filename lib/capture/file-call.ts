/**
 * Shared call-filing core (FR-CALL-DST-1..4): transcript → title + adaptive
 * brief + CRM note + action items + contact attachment. Extracted from
 * app/api/voice/call so both the live mic recorder and the Helper capture
 * pipeline file calls identically. The recording row must already exist
 * (durable-first, FR-CALL-TRX-5) — this only enriches it.
 */
import "server-only";
import { and, eq, ilike } from "drizzle-orm";
import { db, schema } from "@/db";
import { claudeWithTools, claudeChat, type ClaudeToolDef } from "@/lib/anthropic";
import { updateCallRecording } from "@/db/queries/call-recordings";
import { createCallMeeting } from "@/db/queries/meetings";
import type { Utterance } from "./deepgram";
import {
  renderThemedBrief,
  clockTs,
  nearestUtteranceAt,
  type ThemedDoc,
  type ThemeAi,
  type ThemeAiBullet,
  type SupportingQuote,
  type Commitment,
  type RaisedItem,
  type SpeakerSynthesis,
  type CallAudit,
  type NextStep,
} from "./themed-doc";

const { actionItems, touches, contacts } = schema;
const PRIORITIES = ["now", "next", "later", "backlog"] as const;

export const FILE_CALL_TOOL: ClaudeToolDef = {
  name: "file_call",
  description:
    "File a recorded phone call: produce a brief, a CRM note, and the action items it created.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "3–8 word title for the call." },
      brief_markdown: {
        type: "string",
        description:
          "Adaptive Markdown brief. Start with '**TL;DR:**' then ONLY include sections that have real content (Key points, Decisions, etc.). Match length to the call — short call, short brief. Write in the transcript's primary language.",
      },
      note: {
        type: "string",
        description:
          "1–3 sentence plain-text note summarizing the call for the contact's CRM timeline.",
      },
      action_items: {
        type: "array",
        description:
          "Concrete tasks the call implies. Empty array if none — do not invent tasks.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative task, max 200 chars." },
            description: { type: "string", description: "Optional detail, max 1000 chars." },
            due_date: {
              type: "string",
              description: "YYYY-MM-DD only if an absolute date is clearly stated; omit otherwise.",
            },
            priority: { type: "string", enum: [...PRIORITIES] },
          },
          required: ["title"],
        },
      },
    },
    required: ["title", "brief_markdown", "note", "action_items"],
  },
};

const SYSTEM_PLAIN =
  "You file recorded phone calls for a busy operator. From a raw transcript you produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks. Be faithful: preserve names, numbers, dates exactly; never invent a task or detail. Adaptive length — a short call gets a one-line brief. Write in the transcript's primary language. You MUST call the file_call tool exactly once.";

// FR-CALL-DST-2/3: the dialogue variant knows who said what and writes each
// action item in the language of the person who must act on it.
const SYSTEM_DIALOGUE =
  "You file recorded phone calls for a busy operator. The transcript is a speaker-attributed dialogue: each line is '[mm:ss] Name: words'. The operator is the first-listed speaker label given in the message. Produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks. CRITICAL: attribute commitments to the correct speaker — distinguish what the operator promised from what the other party promised; in the brief, name who owes what. Action items are ONLY the operator's own tasks (including following up on the other party's promises). Write each action item in the language that the person who must act on it was speaking. Be faithful: preserve names, numbers, dates exactly; never invent a task or detail. Adaptive length. You MUST call the file_call tool exactly once.";

const SYSTEM_MEETING =
  "You file in-person meeting notes for a busy operator. The transcript is room audio (often a single 'Room' speaker stream mixing everyone present). Produce a skimmable brief, a short CRM note, and extract only genuinely actionable tasks for the operator. Prefer decisions, owners, and next steps. When names appear in the transcript or attendee label, use them. Never invent attendees or commitments. Adaptive length. Write in the transcript's primary language. You MUST call the file_call tool exactly once.";

// ─────────────────────────────────────────────────────────────────────────────
// EL CUADERNO — themed extraction (Slice 1)
// The operator's live #theme structure is the document. The AI never authors
// themes and never summarizes: it ONLY extracts per-theme committed / decided /
// open bullets, each citing the timestamp where that exact thing was said
// (enforced in code by the cite-gate below — not by the prompt), plus ONE
// optional call sentence. There is no TL;DR, no Key points, no prose.
// ─────────────────────────────────────────────────────────────────────────────

/** Cite tolerance: a bullet's cite must be within ±2 s of real evidence. */
export const CITE_TOLERANCE_SECS = 2;
/** Hard caps on the AI's contribution (code-enforced, not prompt-enforced). */
export const MAX_AI_BULLETS_PER_CATEGORY = 4;
export const MAX_AI_BULLET_CHARS = 140;
export const MAX_CALL_SENTENCE_CHARS = 160;

/**
 * Consultant-speak + hedge words the extraction doctrine bans. A bullet (or
 * call sentence) containing any of these is dropped whole — an extraction
 * either quotes reality or it doesn't exist.
 */
export const AI_BULLET_BANLIST_RE =
  /\b(aligned|leverage|touched base|synergy|going forward|actionable|circle back|key takeaway|seems|appears|likely)\b/i;

const AI_BULLET = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description:
        "One extracted fact, ≤140 chars, preferring the speaker's own words. No hedging, no consultant-speak.",
    },
    cite_t_secs: {
      type: "number",
      description:
        "Timestamp in SECONDS into the call where this exact thing was said. Bullets without a real citation are discarded.",
    },
  },
  required: ["text", "cite_t_secs"],
} as const;

export const THEMED_FILE_CALL_TOOL: ClaudeToolDef = {
  name: "file_themed_call",
  description:
    "File a theme-structured call: per-theme cite-backed extractions, one optional call sentence, a CRM note, and action items.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "3–8 word title for the call." },
      call_sentence: {
        type: "string",
        description:
          "ONE factual sentence (≤160 chars) saying what this call was. Omit if you cannot state it plainly. Never a summary paragraph.",
      },
      theme_extractions: {
        type: "array",
        description:
          "Per-theme extractions. Use ONLY the theme keys given — never invent a theme. A theme with nothing extractable gets empty arrays or is omitted.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Theme key exactly as given." },
            committed: {
              type: "array",
              description: "Things a specific person committed to do.",
              items: AI_BULLET,
            },
            decided: {
              type: "array",
              description: "Decisions actually made on the call.",
              items: AI_BULLET,
            },
            open: {
              type: "array",
              description: "Questions raised and left unresolved.",
              items: AI_BULLET,
            },
          },
          required: ["key"],
        },
      },
      note: {
        type: "string",
        description:
          "1–3 sentence plain-text note summarizing the call for the contact's CRM timeline.",
      },
      action_items: {
        type: "array",
        description:
          "Concrete tasks the call implies. Empty array if none — do not invent tasks.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short imperative task, max 200 chars." },
            description: { type: "string", description: "Optional detail, max 1000 chars." },
            due_date: {
              type: "string",
              description: "YYYY-MM-DD only if an absolute date is clearly stated; omit otherwise.",
            },
            priority: { type: "string", enum: [...PRIORITIES] },
          },
          required: ["title"],
        },
      },
    },
    required: ["title", "theme_extractions", "note", "action_items"],
  },
};

const SYSTEM_THEMED =
  "You are an extraction engine for a busy operator's call notebook. The operator structured the call live into themes; that structure IS the document and you never change it. You NEVER author themes, NEVER summarize, NEVER write prose. Your only output: per-theme 'committed' / 'decided' / 'open' bullets, each citing the timestamp (in seconds) where that exact thing was said on the call — bullets without a real citation are discarded by the system. Prefer the speaker's own words; preserve names, numbers, dates exactly. If a theme has nothing genuinely committed, decided, or open, return empty arrays for it — silence is correct. Optionally give ONE plain factual sentence about the call (call_sentence). Also produce a short CRM note and only genuinely actionable tasks for the operator (action items are ONLY the operator's own tasks, including following up on the other party's promises). Write in the transcript's primary language. You MUST call the file_themed_call tool exactly once.";

type RawThemeExtraction = {
  key?: unknown;
  committed?: unknown;
  decided?: unknown;
  open?: unknown;
};

/**
 * CITE-GATE (code, not prompt): keep an AI bullet only when its citation lands
 * within ±{@link CITE_TOLERANCE_SECS}s of a real evidence timestamp in that
 * theme OR of the start of any utterance. Everything else is silently dropped
 * (the caller logs the count). Also enforces the per-category cap, bullet
 * length, and the banlist. Pure — exported for exhaustive unit tests.
 */
export function gateThemeExtractions(
  raw: unknown,
  doc: ThemedDoc,
  utterances: Utterance[],
): { aiByTheme: Map<string, ThemeAi>; dropped: number } {
  const aiByTheme = new Map<string, ThemeAi>();
  let dropped = 0;
  if (!Array.isArray(raw)) return { aiByTheme, dropped };

  const themeByKey = new Map(doc.themes.map((t) => [t.key, t]));

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const ex = entry as RawThemeExtraction;
    const key = typeof ex.key === "string" ? ex.key : null;
    const theme = key ? themeByKey.get(key) : undefined;
    if (!key || !theme || theme.evidence.length === 0) {
      // Invented / unknown theme — or a theme with ZERO operator evidence
      // (an agenda gap): every bullet in it is dropped. The utterance-start
      // cite escape hatch exists so themes WITH evidence can quote beyond
      // the marked moments; on an empty theme it let the model paper over
      // a gap with a topically-unrelated sentence (seen live: a
      // "booking flow" quote filed under Security review). Gaps must stay
      // honest — no evidence, no AI voice.
      for (const cat of ["committed", "decided", "open"] as const) {
        const list = (entry as Record<string, unknown>)[cat];
        if (Array.isArray(list)) dropped += list.length;
      }
      continue;
    }

    const citeOk = (t: number): boolean =>
      theme.evidence.some((e) => Math.abs(e.tSecs - t) <= CITE_TOLERANCE_SECS) ||
      utterances.some((u) => Math.abs(u.start - t) <= CITE_TOLERANCE_SECS);

    const gateCategory = (list: unknown): ThemeAiBullet[] => {
      if (!Array.isArray(list)) return [];
      const out: ThemeAiBullet[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") {
          dropped++;
          continue;
        }
        const o = item as Record<string, unknown>;
        const text = typeof o.text === "string" ? o.text.replace(/\s+/g, " ").trim() : "";
        const citeRaw = o.cite_t_secs ?? o.citeTSecs;
        const cite = typeof citeRaw === "number" ? citeRaw : Number(citeRaw);
        const valid =
          text.length > 0 &&
          text.length <= MAX_AI_BULLET_CHARS &&
          !AI_BULLET_BANLIST_RE.test(text) &&
          Number.isFinite(cite) &&
          cite >= 0 &&
          citeOk(cite) &&
          out.length < MAX_AI_BULLETS_PER_CATEGORY;
        if (valid) out.push({ text, tSecs: cite });
        else dropped++;
      }
      return out;
    };

    const ai: ThemeAi = {
      committed: gateCategory(ex.committed),
      decided: gateCategory(ex.decided),
      open: gateCategory(ex.open),
    };
    if (ai.committed.length + ai.decided.length + ai.open.length > 0) {
      aiByTheme.set(key, ai);
    }
  }
  return { aiByTheme, dropped };
}

/**
 * Validate the model's optional call sentence: one line, ≤160 chars, banlist
 * applies. Anything unusable → null (the doc simply has no sentence).
 */
export function sanitizeCallSentence(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s || s.length > MAX_CALL_SENTENCE_CHARS) return null;
  if (AI_BULLET_BANLIST_RE.test(s)) return null;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// EL CUADERNO — Slice 3: the librarian (Haiku) + the auditor (Sonnet)
//
// The librarian adds 0–4 cite-verified verbatim quotes per theme the operator
// left unmarked (supports / contradicts / constraint / number / date) — the
// `contradicts` tag is the anti-yes-man signal. The auditor produces the
// centerpiece: a call-wide commitments ledger, blockers/issues raised, decisions,
// and a per-speaker synthesis — every claim cite-gated to a real utterance (±2s)
// with owner/raisedBy pinned to a scaffold speaker, or it's dropped. Both are
// advisory and run AFTER the durable recording row exists (see finalize.ts).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The auditor earns a bigger model: commitment/blocker/gap judgment is the one
 * place worth Sonnet. `coerceModel` in lib/anthropic accepts the Sonnet-4.x
 * tier as `claude-sonnet-4-6` (there is no `-4-5` id — an unknown string would
 * be silently downgraded to the Haiku default, defeating the point).
 */
export const AUDIT_MODEL = "claude-sonnet-4-6";
export const LIBRARIAN_MODEL = "claude-haiku-4-5";

export const MAX_AUDIT_COMMITMENTS = 40;
export const MAX_AUDIT_BLOCKERS = 30;
export const MAX_AUDIT_DECISIONS = 40;
export const MAX_AUDIT_QUOTE_CHARS = 200;
export const MAX_AUDIT_TEXT_CHARS = 160;
export const MAX_AUDIT_HEADLINE_CHARS = 120;
export const MAX_AUDIT_DUE_CHARS = 60;
export const MAX_SUPPORTING_PER_THEME = 4;

const RAISED_KINDS = ["blocker", "issue", "question", "risk"] as const;
const SUPPORTING_RELEVANCE = [
  "supports",
  "contradicts",
  "constraint",
  "number",
  "date",
] as const;

const AUDIT_ITEM = {
  type: "object",
  properties: {
    text: {
      type: "string",
      description:
        "The fact in ≤160 chars, preferring the speaker's own words. No hedging, no consultant-speak.",
    },
    quote: {
      type: "string",
      description:
        "The verbatim words spoken (≤200 chars). Quote or stay silent — never paraphrase.",
    },
    cite_t_secs: {
      type: "number",
      description: "Seconds into the call where this was said. No cite ⇒ discarded.",
    },
  },
  required: ["text", "quote", "cite_t_secs"],
} as const;

export const FILE_CALL_AUDIT_TOOL: ClaudeToolDef = {
  name: "file_call_audit",
  description:
    "Audit a filed call: the commitments made, the blockers/issues raised, the decisions taken, and a one-line throughline per speaker. Every item cites the second it was said.",
  input_schema: {
    type: "object",
    properties: {
      commitments: {
        type: "array",
        description:
          "Things a specific person committed to do. `owner` MUST be an exact speaker label from the scaffold. `due` only if a date was literally spoken. Empty array is correct when nobody committed to anything.",
        items: {
          type: "object",
          properties: {
            owner: { type: "string", description: "Exact speaker label from the scaffold." },
            text: AUDIT_ITEM.properties.text,
            quote: AUDIT_ITEM.properties.quote,
            cite_t_secs: AUDIT_ITEM.properties.cite_t_secs,
            due: {
              type: "string",
              description: "The due date/timeframe ONLY if literally spoken; omit otherwise.",
            },
            due_source: {
              type: "string",
              enum: ["spoken", "absent"],
              description: "'spoken' only if a date was actually said; else 'absent'. Never infer.",
            },
          },
          required: ["owner", "text", "quote", "cite_t_secs"],
        },
      },
      blockers: {
        type: "array",
        description:
          "Blockers, issues, questions, or risks raised on the call. `raised_by` MUST be an exact speaker label. Empty array is correct.",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: [...RAISED_KINDS] },
            text: AUDIT_ITEM.properties.text,
            quote: AUDIT_ITEM.properties.quote,
            cite_t_secs: AUDIT_ITEM.properties.cite_t_secs,
            raised_by: { type: "string", description: "Exact speaker label from the scaffold." },
          },
          required: ["kind", "text", "quote", "cite_t_secs", "raised_by"],
        },
      },
      decisions: {
        type: "array",
        description: "Decisions actually made on the call. Empty array is correct.",
        items: {
          type: "object",
          properties: {
            text: AUDIT_ITEM.properties.text,
            cite_t_secs: AUDIT_ITEM.properties.cite_t_secs,
          },
          required: ["text", "cite_t_secs"],
        },
      },
      speakers: {
        type: "array",
        description:
          "One entry per scaffold speaker you can characterize. `headline` is a plain, factual one-line throughline of what that person was about on the call (≤120 chars, their words preferred).",
        items: {
          type: "object",
          properties: {
            speaker: { type: "string", description: "Exact speaker label from the scaffold." },
            headline: { type: "string", description: "One factual line, ≤120 chars." },
          },
          required: ["speaker", "headline"],
        },
      },
    },
    required: ["commitments", "blockers", "decisions", "speakers"],
  },
};

const SYSTEM_AUDIT =
  "You are the auditor for a busy operator's call notebook, reading a full speaker-attributed transcript of a multi-party call. Doctrine: QUOTE OR STAY SILENT. Produce (1) a commitments ledger — who committed to do what, (2) blockers/issues/questions/risks raised, (3) decisions actually made, and (4) one plain factual headline per speaker. RULES: never paraphrase — every item carries the verbatim `quote` and the second it was said (`cite_t_secs`); `owner` and `raised_by` MUST be an EXACT speaker label from the scaffold you are given — never invent a name; a commitment's `due` is set ONLY if a date/timeframe was literally spoken (`due_source`='spoken'), otherwise `due_source`='absent' — never infer a deadline; a headline is a factual one-liner of that speaker's throughline, in their words where possible. Do NOT use hedging or consultant-speak (aligned, leverage, synergy, circle back, going forward, key takeaway, seems, appears, likely). 'No commitments' / 'no blockers' is a correct and common answer — return empty arrays rather than manufacturing items. You MUST call the file_call_audit tool exactly once.";

const SUPPORTING_ITEM = {
  type: "object",
  properties: {
    quote: {
      type: "string",
      description: "Verbatim words spoken at the cite (≤200 chars). Must appear in the transcript.",
    },
    cite_t_secs: {
      type: "number",
      description: "Seconds into the call where this was said.",
    },
    relevance: {
      type: "string",
      enum: [...SUPPORTING_RELEVANCE],
      description:
        "How the quote bears on the theme: supports, contradicts, constraint, number, or date.",
    },
  },
  required: ["quote", "cite_t_secs", "relevance"],
} as const;

export const FILE_THEME_SUPPORTING_TOOL: ClaudeToolDef = {
  name: "file_theme_supporting",
  description:
    "For each theme, surface 0–4 additional verbatim quotes the operator did not mark that bear on it — especially anything that CONTRADICTS the theme.",
  input_schema: {
    type: "object",
    properties: {
      themes: {
        type: "array",
        description: "Per-theme supporting quotes. Use ONLY the theme keys given.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Theme key exactly as given." },
            quotes: {
              type: "array",
              description: "0–4 verbatim quotes, each with a cite and a relevance tag.",
              items: SUPPORTING_ITEM,
            },
          },
          required: ["key", "quotes"],
        },
      },
    },
    required: ["themes"],
  },
};

const SYSTEM_LIBRARIAN =
  "You are a librarian for a busy operator's call notebook. For each theme the operator marked, scan the transcript for UP TO 4 additional verbatim quotes they did not mark that genuinely bear on that theme, tagging each as supports / contradicts / constraint / number / date. Doctrine: quote exactly — every quote must be words that literally appear in the transcript at the cited second; never paraphrase or invent. Prioritize CONTRADICTIONS — a quote that cuts against the operator's read is the most valuable thing you can surface. If a theme has no genuine extra quotes, return an empty array for it — silence is correct. You MUST call the file_theme_supporting tool exactly once.";

/** Collapse whitespace + trim; "" when not a usable string. */
function cleanText(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
}

/** True when a cite lands within ±CITE_TOLERANCE_SECS of any utterance start. */
function citeOnUtterance(t: number, utterances: Utterance[]): boolean {
  return utterances.some((u) => Math.abs(u.start - t) <= CITE_TOLERANCE_SECS);
}

/**
 * CITE-GATE for the auditor (code, not prompt). Keeps a commitment/blocker/
 * decision only when: its cite lands within ±2 s of a real utterance start; its
 * `owner`/`raisedBy` is an EXACT scaffold speaker label; it carries a non-empty
 * verbatim quote; and it passes the banlist and length caps. Valid items attach
 * to BOTH their speaker (matched on the owner/raisedBy field) AND the call-wide
 * audit block. Everything else is silently dropped (count returned). Pure.
 */
export function gateAudit(
  raw: unknown,
  doc: ThemedDoc,
  utterances: Utterance[],
): { audit: CallAudit; speakers: SpeakerSynthesis[]; dropped: number } {
  const scaffold = doc.speakers ?? [];
  // Fresh working copy so the input doc is never mutated.
  const speakers: SpeakerSynthesis[] = scaffold.map((s) => ({
    speaker: s.speaker,
    headline: "",
    turnCount: s.turnCount,
    commitments: [],
    raised: [],
  }));
  const byName = new Map(speakers.map((s) => [s.speaker, s]));
  const audit: CallAudit = { commitments: [], blockers: [], decisions: [] };
  let dropped = 0;

  const validCite = (t: unknown): number | null => {
    const c = typeof t === "number" ? t : Number(t);
    return Number.isFinite(c) && c >= 0 && citeOnUtterance(c, utterances) ? c : null;
  };
  const validQuote = (q: unknown): string | null => {
    const s = cleanText(q);
    return s ? s.slice(0, MAX_AUDIT_QUOTE_CHARS) : null;
  };
  const validText = (t: unknown): string | null => {
    const s = cleanText(t);
    if (!s || s.length > MAX_AUDIT_TEXT_CHARS || AI_BULLET_BANLIST_RE.test(s)) return null;
    return s;
  };

  const input = (raw ?? {}) as Record<string, unknown>;

  // Commitments.
  const rawCommitments = Array.isArray(input.commitments) ? input.commitments : [];
  for (const item of rawCommitments) {
    if (audit.commitments.length >= MAX_AUDIT_COMMITMENTS) {
      dropped += 1;
      continue;
    }
    if (!item || typeof item !== "object") {
      dropped += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const owner = cleanText(o.owner);
    const speaker = byName.get(owner);
    const text = validText(o.text);
    const cite = validCite(o.cite_t_secs);
    const quote = validQuote(o.quote);
    if (!speaker || !text || cite === null || !quote) {
      dropped += 1;
      continue;
    }
    const spoken =
      o.due_source === "spoken" && typeof o.due === "string" && o.due.trim().length > 0;
    const commitment: Commitment = {
      owner,
      text,
      quote,
      tSecs: cite,
      due: spoken ? (o.due as string).trim().slice(0, MAX_AUDIT_DUE_CHARS) : null,
      dueSource: spoken ? "spoken" : "absent",
    };
    audit.commitments.push(commitment);
    speaker.commitments.push(commitment);
  }

  // Blockers / issues / questions / risks.
  const rawBlockers = Array.isArray(input.blockers) ? input.blockers : [];
  for (const item of rawBlockers) {
    if (audit.blockers.length >= MAX_AUDIT_BLOCKERS) {
      dropped += 1;
      continue;
    }
    if (!item || typeof item !== "object") {
      dropped += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const kind = RAISED_KINDS.find((k) => k === o.kind);
    const raisedBy = cleanText(o.raised_by);
    const speaker = byName.get(raisedBy);
    const text = validText(o.text);
    const cite = validCite(o.cite_t_secs);
    const quote = validQuote(o.quote);
    if (!kind || !speaker || !text || cite === null || !quote) {
      dropped += 1;
      continue;
    }
    const blocker: RaisedItem = { kind, text, quote, tSecs: cite, raisedBy };
    audit.blockers.push(blocker);
    speaker.raised.push(blocker);
  }

  // Decisions (no speaker attribution).
  const rawDecisions = Array.isArray(input.decisions) ? input.decisions : [];
  for (const item of rawDecisions) {
    if (audit.decisions.length >= MAX_AUDIT_DECISIONS) {
      dropped += 1;
      continue;
    }
    if (!item || typeof item !== "object") {
      dropped += 1;
      continue;
    }
    const o = item as Record<string, unknown>;
    const text = validText(o.text);
    const cite = validCite(o.cite_t_secs);
    if (!text || cite === null) {
      dropped += 1;
      continue;
    }
    audit.decisions.push({ text, tSecs: cite });
  }

  // Speaker headlines — mapped onto the scaffold, banlist + length gated.
  const rawSpeakers = Array.isArray(input.speakers) ? input.speakers : [];
  for (const item of rawSpeakers) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const speaker = byName.get(cleanText(o.speaker));
    if (!speaker) continue;
    const headline = cleanText(o.headline);
    if (headline && headline.length <= MAX_AUDIT_HEADLINE_CHARS && !AI_BULLET_BANLIST_RE.test(headline)) {
      speaker.headline = headline;
    }
  }

  return { audit, speakers, dropped };
}

/**
 * The audit is worth a Sonnet call only when there's real cross-party structure
 * to find: ≥2 distinct participant speakers OR ≥1 agenda item. A 1-on-1 with no
 * agenda is skipped to save the cost (it stays audit=null).
 */
export function shouldRunAudit(doc: ThemedDoc): boolean {
  const participants = doc.speakers?.length ?? 0;
  const agendaItems = doc.agenda?.length ?? 0;
  return participants >= 2 || agendaItems >= 1;
}

/**
 * CITE-GATE for the librarian (code, not prompt). Keeps a supporting quote only
 * when: its theme has ≥1 operator evidence (never a gap); the quote VERBATIM
 * appears in the utterance nearest its cite (case-insensitive substring); and
 * the relevance is one of the allowed tags. ≤4 per theme. Pure.
 */
export function gateSupporting(
  raw: unknown,
  doc: ThemedDoc,
  utterances: Utterance[],
): { byTheme: Map<string, SupportingQuote[]>; dropped: number } {
  const byTheme = new Map<string, SupportingQuote[]>();
  let dropped = 0;
  if (!raw || typeof raw !== "object") return { byTheme, dropped };
  const list = (raw as Record<string, unknown>).themes;
  if (!Array.isArray(list)) return { byTheme, dropped };

  // Only themes WITH operator evidence are eligible — gaps stay honest.
  const eligible = new Map(
    doc.themes.filter((t) => t.evidence.length > 0).map((t) => [t.key, t]),
  );

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const key = typeof e.key === "string" ? e.key : null;
    if (!key || !eligible.has(key)) {
      if (Array.isArray(e.quotes)) dropped += e.quotes.length;
      continue;
    }
    const quotes = Array.isArray(e.quotes) ? e.quotes : [];
    const out: SupportingQuote[] = [];
    for (const q of quotes) {
      if (out.length >= MAX_SUPPORTING_PER_THEME) {
        dropped += 1;
        continue;
      }
      if (!q || typeof q !== "object") {
        dropped += 1;
        continue;
      }
      const o = q as Record<string, unknown>;
      const quote = cleanText(o.quote);
      const citeRaw = o.cite_t_secs ?? o.citeTSecs;
      const cite = typeof citeRaw === "number" ? citeRaw : Number(citeRaw);
      const relevance = SUPPORTING_RELEVANCE.find((r) => r === o.relevance);
      const u = Number.isFinite(cite) && cite >= 0 ? nearestUtteranceAt(cite, utterances) : null;
      const verbatim =
        !!quote &&
        !!u &&
        u.text.toLowerCase().includes(quote.toLowerCase());
      if (!verbatim || !relevance) {
        dropped += 1;
        continue;
      }
      out.push({ tSecs: cite, quote: quote.slice(0, MAX_AUDIT_QUOTE_CHARS), relevance });
    }
    if (out.length > 0) byTheme.set(key, out);
  }
  return { byTheme, dropped };
}

/**
 * Librarian pass (Haiku, advisory): one batched call over the themes that carry
 * operator evidence, cite-gated, merging supporting quotes onto each theme's ai
 * block. Returns the enriched doc (or the doc unchanged when nothing survives).
 */
export async function runThemeLibrarian(opts: {
  workspaceId: string;
  userId: string;
  recordingId: string;
  spendRoute: string;
  transcript: string;
  doc: ThemedDoc;
  utterances: Utterance[];
}): Promise<ThemedDoc> {
  const eligible = opts.doc.themes.filter((t) => t.evidence.length > 0);
  if (eligible.length === 0) return opts.doc;

  const skeleton = eligible
    .map((t) => {
      const marks = t.evidence
        .filter((e) => e.quote)
        .map((e) => `    - [${Math.round(e.tSecs)}s] "${e.quote}"`)
        .join("\n");
      return `- ${t.key} — "${t.label}"${marks ? `\n${marks}` : ""}`;
    })
    .join("\n");

  const res = await claudeWithTools({
    model: LIBRARIAN_MODEL,
    system: SYSTEM_LIBRARIAN,
    tools: [FILE_THEME_SUPPORTING_TOOL],
    maxTokens: 1500,
    spend: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      direction: "out",
      payload: {
        route: `${opts.spendRoute}:librarian`,
        transcriptChars: opts.transcript.length,
      },
      trackUsage: true,
    },
    messages: [
      {
        role: "user",
        content: `THEMES (already marked by the operator — quotes shown are what they flagged; find OTHER quotes that bear on each, especially contradictions):\n${skeleton}\n\nTRANSCRIPT (timestamps are [mm:ss] from call start):\n${opts.transcript.slice(0, 24000)}`,
      },
    ],
  });

  const toolUse =
    res.ok &&
    res.content.find((b) => b.type === "tool_use" && b.name === "file_theme_supporting");
  if (!toolUse || toolUse.type !== "tool_use") return opts.doc;

  const { byTheme, dropped } = gateSupporting(toolUse.input, opts.doc, opts.utterances);
  if (dropped > 0) {
    console.warn(
      `[capture] librarian cite-gate dropped ${dropped} quote(s) for recording ${opts.recordingId}`,
    );
  }
  if (byTheme.size === 0) return opts.doc;

  return {
    ...opts.doc,
    themes: opts.doc.themes.map((t) => {
      const supporting = byTheme.get(t.key);
      if (!supporting) return t;
      const ai: ThemeAi = t.ai
        ? { ...t.ai, supporting }
        : { committed: [], decided: [], open: [], supporting };
      return { ...t, ai };
    }),
  };
}

/**
 * Auditor pass (Sonnet, advisory): one call over the whole transcript + the
 * speaker scaffold + agenda, cite-gated, attaching commitments/blockers to both
 * the speakers and the call-wide audit block. Returns the enriched doc (or the
 * doc unchanged when nothing survives). Gate BEFORE calling with shouldRunAudit.
 */
export async function runCallAudit(opts: {
  workspaceId: string;
  userId: string;
  recordingId: string;
  spendRoute: string;
  transcript: string;
  doc: ThemedDoc;
  utterances: Utterance[];
}): Promise<ThemedDoc> {
  const scaffold = opts.doc.speakers ?? [];
  const scaffoldLines = scaffold.length
    ? scaffold.map((s) => `- ${s.speaker} (${s.turnCount} turns)`).join("\n")
    : "- (no distinct participants detected)";
  const agendaLines = opts.doc.agenda.length
    ? opts.doc.agenda.map((a) => `- ${a.label}`).join("\n")
    : "- (none)";

  const res = await claudeWithTools({
    model: AUDIT_MODEL,
    system: SYSTEM_AUDIT,
    tools: [FILE_CALL_AUDIT_TOOL],
    maxTokens: 3000,
    spend: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      direction: "out",
      payload: {
        route: `${opts.spendRoute}:audit`,
        transcriptChars: opts.transcript.length,
      },
      trackUsage: true,
    },
    messages: [
      {
        role: "user",
        content: `SPEAKER SCAFFOLD (owner / raised_by MUST be one of these EXACT labels):\n${scaffoldLines}\n\nAGENDA:\n${agendaLines}\n\nTRANSCRIPT (lines are '[mm:ss] Name: words'):\n${opts.transcript.slice(0, 24000)}`,
      },
    ],
  });

  const toolUse =
    res.ok && res.content.find((b) => b.type === "tool_use" && b.name === "file_call_audit");
  if (!toolUse || toolUse.type !== "tool_use") return opts.doc;

  const { audit, speakers, dropped } = gateAudit(toolUse.input, opts.doc, opts.utterances);
  if (dropped > 0) {
    console.warn(
      `[capture] audit cite-gate dropped ${dropped} item(s) for recording ${opts.recordingId}`,
    );
  }
  return { ...opts.doc, audit, speakers };
}

type CallItem = {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  priority?: unknown;
};

export type FileCallResult = {
  title: string;
  brief: string;
  note: string;
  actionItemCount: number;
  contact: { id: string; name: string } | null;
  contactAmbiguous: boolean;
  /**
   * Meeting created for this call (type='call'); the recording's back-link.
   * Null only when filing threw before the meeting was created.
   */
  meetingId: string | null;
  /**
   * El Cuaderno: the completed themed document (callSentence + per-theme ai
   * filled, cite-gated) when the themed path filed the call; null on the
   * legacy path.
   */
  themedDoc: ThemedDoc | null;
};

export async function fileCallTranscript(opts: {
  workspaceId: string;
  userId: string;
  recordingId: string;
  transcript: string;
  durationSecs?: number | null;
  contactName?: string | null;
  /** Dialogue mode: transcript lines are speaker-attributed (capture pipeline). */
  attributed?: boolean;
  /** Operator label used in the dialogue (e.g. "Founder" or display name). */
  founderLabel?: string;
  /** In-person room capture (mic-only) — use meeting filing prompt. */
  inPersonMeeting?: boolean;
  /**
   * Operator-flagged "important moments" (⌘⇧K / ★ during the call), each
   * resolved to the words spoken then. Steers the brief and is guaranteed into
   * it verbatim under "★ Flagged moments" so a live flag is never lost.
   */
  flaggedMoments?: { atSec: number; quote: string; note: string | null }[];
  /**
   * Operator-typed live notes (Call Desk composer / ⌘⇧N during the call), each
   * resolved to the words spoken then. Steers the brief and is guaranteed into
   * it verbatim under "✎ Operator notes" so a live note is never lost.
   */
  operatorNotes?: { atSec: number; quote: string; note: string }[];
  /**
   * El Cuaderno: the pre-AI themed document (operator's theme skeleton with
   * evidence bucketed). ≥1 theme switches filing to the themed extraction
   * path; absent/empty keeps today's legacy path byte-for-byte.
   */
  themedDoc?: ThemedDoc | null;
  /** Utterances backing the transcript — needed by the themed cite-gate. */
  utterances?: Utterance[];
  spendRoute?: string;
}): Promise<FileCallResult> {
  const transcript = opts.transcript;

  let title = opts.inPersonMeeting ? "Meeting" : "Call";
  let brief = "";
  let note = transcript.slice(0, 280);
  let items: CallItem[] = [];
  let filedThemedDoc: ThemedDoc | null = null;

  // El Cuaderno: a themed doc with ≥1 theme routes filing through the
  // extraction-only path — the operator's structure IS the document, and the
  // AI TL;DR/Key points prose is dead. Legacy calls (no themes) take TODAY'S
  // EXACT path below. Advisory: any throw inside themed structuring falls back
  // to the legacy filing path so a call is never lost to the new code.
  const themedDoc =
    opts.themedDoc && opts.themedDoc.themes.length > 0 ? opts.themedDoc : null;
  let themedFiled = false;
  if (themedDoc) {
    try {
      const themed = await runThemedFiling({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        recordingId: opts.recordingId,
        spendRoute: opts.spendRoute ?? "voice:call:file",
        transcript,
        durationSecs: opts.durationSecs ?? null,
        founderLabel: opts.founderLabel,
        inPersonMeeting: !!opts.inPersonMeeting,
        doc: themedDoc,
        utterances: opts.utterances ?? [],
        defaultTitle: title,
        fallbackNote: note,
      });
      ({ title, brief, note, items } = themed);
      filedThemedDoc = themed.doc;
      themedFiled = true;
    } catch (e) {
      console.warn(
        `[capture] themed filing failed for recording ${opts.recordingId} — falling back to legacy filing: ${String(e)}`,
      );
    }
  }

  if (!themedFiled) {
    // ── Legacy (un-themed) filing path — unchanged behavior. ─────────────────
    const flagged = opts.flaggedMoments ?? [];
    const operatorNotes = opts.operatorNotes ?? [];

    const flaggedLines = flagged.map((f) => {
      const quote = f.quote ? ` "${f.quote}"` : "";
      const note = f.note ? ` — ${f.note}` : "";
      return `- [${clockTs(f.atSec)}]${quote}${note}`;
    });
    // Verbatim block prepended to the brief so flags survive even if the model
    // omits them. Also fed to the model so its analysis reflects them.
    const flaggedBlock =
      flaggedLines.length > 0
        ? `**★ Flagged moments** (marked live by the operator):\n${flaggedLines.join("\n")}\n\n`
        : "";
    const flaggedSteer =
      flaggedLines.length > 0
        ? `\n\nOPERATOR-FLAGGED MOMENTS — the operator marked these live as the most important points of the call. They are already listed at the top of the brief under "★ Flagged moments"; do NOT repeat them verbatim, but make sure your Key points / Decisions clearly reflect their significance:\n${flaggedLines.join("\n")}`
        : "";

    const noteLines = operatorNotes.map((n) => {
      const quote = n.quote ? ` "${n.quote}"` : "";
      return `- [${clockTs(n.atSec)}]${quote} — ${n.note}`;
    });
    // Verbatim block prepended to the brief (after flagged moments) so live
    // notes survive even if the model omits them. Also fed to the model.
    const notesBlock =
      noteLines.length > 0
        ? `**✎ Operator notes** (typed live during the call):\n${noteLines.join("\n")}\n\n`
        : "";
    const notesSteer =
      noteLines.length > 0
        ? `\n\nOPERATOR LIVE NOTES — the operator typed these notes themselves while the call was happening; they are the operator's own read on what mattered. They are already listed at the top of the brief under "✎ Operator notes"; do NOT repeat them verbatim, but weave their substance into your Key points / Action items:\n${noteLines.join("\n")}`
        : "";

    const preamble = opts.inPersonMeeting
      ? `IN-PERSON MEETING\nPRIMARY LABEL: ${opts.founderLabel ?? "Room"}\nATTENDEE HINT: ${opts.contactName ?? "(none)"}\nDURATION: ${opts.durationSecs ?? "unknown"}s\n\nROOM TRANSCRIPT:\n`
      : opts.attributed
        ? `OPERATOR SPEAKER LABEL: ${opts.founderLabel ?? "Founder"}\nDURATION: ${opts.durationSecs ?? "unknown"}s\n\nDIALOGUE TRANSCRIPT:\n`
        : `DURATION: ${opts.durationSecs ?? "unknown"}s\n\nTRANSCRIPT:\n`;

    const system = opts.inPersonMeeting
      ? SYSTEM_MEETING
      : opts.attributed
        ? SYSTEM_DIALOGUE
        : SYSTEM_PLAIN;

    const res = await claudeWithTools({
      model: "claude-haiku-4-5",
      system,
      tools: [FILE_CALL_TOOL],
      maxTokens: 1500,
      spend: {
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        direction: "out",
        payload: {
          route: opts.spendRoute ?? "voice:call:file",
          transcriptChars: transcript.length,
        },
        trackUsage: true,
      },
      messages: [
        {
          role: "user",
          content: `${preamble}${transcript.slice(0, 24000)}${flaggedSteer}${notesSteer}`,
        },
      ],
    });

    const toolUse =
      res.ok && res.content.find((b) => b.type === "tool_use" && b.name === "file_call");
    if (toolUse && toolUse.type === "tool_use") {
      const inp = toolUse.input as {
        title?: string;
        brief_markdown?: string;
        note?: string;
        action_items?: CallItem[];
      };
      title = (inp.title || title).slice(0, 120);
      brief = inp.brief_markdown || "";
      note = inp.note || note;
      items = Array.isArray(inp.action_items) ? inp.action_items : [];
    } else {
      // Graceful fallback: plain brief, no structured tasks.
      const chat = await claudeChat({
        model: "claude-haiku-4-5",
        system:
          "Summarize this call transcript as a short Markdown brief starting with '**TL;DR:**'. Only include sections with real content. Same language as the transcript.",
        prompt: `${transcript.slice(0, 24000)}${flaggedSteer}${notesSteer}`,
        maxTokens: 800,
        spend: {
          workspaceId: opts.workspaceId,
          userId: opts.userId,
          direction: "out",
          payload: {
            route: `${opts.spendRoute ?? "voice:call"}:fallback`,
            transcriptChars: transcript.length,
          },
          trackUsage: true,
        },
      });
      if (chat.ok) brief = chat.text;
    }

    // Guarantee the operator's live flags + typed notes into the brief verbatim,
    // at the top — the model is steered by them but may summarize them away;
    // these are the moments/notes the operator explicitly cared about, so they
    // must survive. Order: flagged moments first, operator notes right after.
    if (flaggedBlock || notesBlock) {
      brief = `${flaggedBlock}${notesBlock}${brief}`.trim();
    }
  }

  // Create action items (linked back to the recording for provenance). One
  // batched insert rather than N round-trips.
  const itemRows = items
    .map((it) => {
      const t = String(it.title ?? "").slice(0, 200).trim();
      if (!t) return null;
      const rawDue = String(it.due_date ?? "");
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null;
      const rawPr = String(it.priority ?? "");
      const priority = (PRIORITIES as readonly string[]).includes(rawPr)
        ? (rawPr as (typeof PRIORITIES)[number])
        : null;
      const description = it.description
        ? String(it.description).slice(0, 1000)
        : null;
      return {
        workspaceId: opts.workspaceId,
        title: t,
        description,
        dueDate,
        priority,
        callRecordingId: opts.recordingId,
        createdBy: opts.userId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const createdItemIds =
    itemRows.length > 0
      ? (
          await db.insert(actionItems).values(itemRows).returning({ id: actionItems.id })
        ).map((r) => r.id)
      : [];

  // Contact match: unique match → attach; ambiguous → flag, never guess
  // (FR-CALL-DST-4). Matching never gates persistence — the row already exists.
  let attached: { id: string; name: string } | null = null;
  let ambiguous = false;
  const contactName = (opts.contactName ?? "").trim();
  if (contactName) {
    const matches = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, opts.workspaceId),
          ilike(contacts.name, `%${contactName}%`),
        ),
      )
      .limit(2);
    if (matches.length === 1) attached = matches[0];
    else if (matches.length > 1) ambiguous = true;
  }

  // Every filed call becomes a Meeting (type='call', source='voice') so it lives
  // in the meeting module and rolls up onto the contact's meeting history rather
  // than hanging orphan. The matched contact (if any) is attached as attendee.
  const meetingId = await createCallMeeting({
    workspaceId: opts.workspaceId,
    createdBy: opts.userId,
    title,
    minutes: brief || note || null,
    durationSecs: opts.durationSecs ?? null,
    contactId: attached?.id ?? null,
  });

  // Contact-timeline touch for the matched contact, linked to the new meeting so
  // the call appears on their timeline and ties back to the meeting record.
  if (attached) {
    await db.insert(touches).values({
      contactId: attached.id,
      channel: "call",
      body: note,
      transcript,
      meetingId,
      workspaceId: opts.workspaceId,
      createdBy: opts.userId,
    });
    await db
      .update(contacts)
      .set({ lastTouchAt: new Date() })
      .where(eq(contacts.id, attached.id));
  }

  await updateCallRecording({
    id: opts.recordingId,
    workspaceId: opts.workspaceId,
    title,
    brief: brief || null,
    contactId: attached?.id ?? null,
    meetingId,
    actionItemCount: createdItemIds.length,
    contactAmbiguous: ambiguous,
    ...(filedThemedDoc ? { themedDoc: filedThemedDoc } : {}),
  });

  return {
    title,
    brief,
    note,
    actionItemCount: createdItemIds.length,
    contact: attached,
    contactAmbiguous: ambiguous,
    meetingId,
    themedDoc: filedThemedDoc,
  };
}

/**
 * El Cuaderno themed filing: one extraction-only Haiku pass over the theme
 * skeleton + transcript, cite-gated in code, rendered via renderThemedBrief.
 * Even when the model returns nothing usable, the operator's skeleton IS the
 * document — notes, quotes, and flags render regardless (ai stays null).
 */
async function runThemedFiling(opts: {
  workspaceId: string;
  userId: string;
  recordingId: string;
  spendRoute: string;
  transcript: string;
  durationSecs: number | null;
  founderLabel?: string;
  inPersonMeeting: boolean;
  doc: ThemedDoc;
  utterances: Utterance[];
  defaultTitle: string;
  fallbackNote: string;
}): Promise<{
  title: string;
  brief: string;
  note: string;
  items: CallItem[];
  doc: ThemedDoc;
}> {
  const { doc } = opts;

  // The operator's skeleton, with evidence timestamps in raw seconds so the
  // model can cite them exactly (the cite-gate verifies against these ±2s).
  const skeletonLines: string[] = [];
  for (const t of doc.themes) {
    skeletonLines.push(
      `- ${t.key} — "${t.label}"${t.origin === "agenda" ? " (on the operator's agenda)" : ""}`,
    );
    for (const e of t.evidence) {
      const kind = e.type === "flag" ? "flag" : "note";
      const text = e.text ? `: "${e.text}"` : "";
      const quote = e.quote
        ? ` — said then${e.speaker ? ` by ${e.speaker}` : ""}: "${e.quote}"`
        : "";
      skeletonLines.push(
        `  - [t=${Math.round(e.tSecs)}s / ${clockTs(e.tSecs)}] operator ${kind}${text}${quote}`,
      );
    }
    if (t.evidence.length === 0) skeletonLines.push("  - (no evidence captured)");
  }

  const preamble = opts.inPersonMeeting
    ? `IN-PERSON MEETING\nPRIMARY LABEL: ${opts.founderLabel ?? "Room"}\n`
    : `OPERATOR SPEAKER LABEL: ${opts.founderLabel ?? "Founder"}\n`;

  const res = await claudeWithTools({
    model: "claude-haiku-4-5",
    system: SYSTEM_THEMED,
    tools: [THEMED_FILE_CALL_TOOL],
    maxTokens: 2000,
    spend: {
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      direction: "out",
      payload: {
        route: `${opts.spendRoute}:themed`,
        transcriptChars: opts.transcript.length,
      },
      trackUsage: true,
    },
    messages: [
      {
        role: "user",
        content: `${preamble}DURATION: ${opts.durationSecs ?? "unknown"}s\n\nTHEME SKELETON (built live by the operator — extract ONLY into these keys):\n${skeletonLines.join("\n")}\n\nDIALOGUE TRANSCRIPT (timestamps are [mm:ss] from call start):\n${opts.transcript.slice(0, 24000)}`,
      },
    ],
  });

  let title = opts.defaultTitle;
  let note = opts.fallbackNote;
  let items: CallItem[] = [];
  let callSentence: string | null = null;
  let aiByTheme = new Map<string, ThemeAi>();

  const toolUse =
    res.ok &&
    res.content.find((b) => b.type === "tool_use" && b.name === "file_themed_call");
  if (toolUse && toolUse.type === "tool_use") {
    const inp = toolUse.input as {
      title?: string;
      call_sentence?: string;
      theme_extractions?: unknown;
      note?: string;
      action_items?: CallItem[];
    };
    title = (inp.title || title).slice(0, 120);
    note = inp.note || note;
    items = Array.isArray(inp.action_items) ? inp.action_items : [];
    callSentence = sanitizeCallSentence(inp.call_sentence);
    const gated = gateThemeExtractions(inp.theme_extractions, doc, opts.utterances);
    aiByTheme = gated.aiByTheme;
    if (gated.dropped > 0) {
      console.warn(
        `[capture] themed cite-gate dropped ${gated.dropped} bullet(s) for recording ${opts.recordingId}`,
      );
    }
  }

  // Surface the operator's action items under "→ Next steps" in the brief, and
  // persist them on the doc so re-files/strikes (which re-render from the doc)
  // keep the section. Same validation as the DB action-item rows below.
  const nextSteps: NextStep[] = items
    .map((it): NextStep | null => {
      const title = String(it.title ?? "").slice(0, 200).trim();
      if (!title) return null;
      const rawDue = String(it.due_date ?? "");
      return { title, due: /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null };
    })
    .filter((n): n is NextStep => n !== null);

  const completed: ThemedDoc = {
    ...doc,
    callSentence,
    themes: doc.themes.map((t) => ({ ...t, ai: aiByTheme.get(t.key) ?? null })),
    nextSteps: nextSteps.length > 0 ? nextSteps : null,
  };
  return {
    title,
    brief: renderThemedBrief(completed),
    note,
    items,
    doc: completed,
  };
}
