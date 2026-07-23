/**
 * upload_presentation — ingest an HTML deck (uploaded as base64 bytes) into
 * the `presentations` table as kind='html'. Stores the bytes in the same
 * private Storage bucket used by project files, auto-detects slide anchors
 * (slideMap) from the markup, and creates a team-visible (never public by
 * default) presentation row that the internal, login-gated
 * /presentations/[id] route can render.
 *
 * Mirrors upload-room-file.ts's decode → allow-list → sniff → upload →
 * DB-write(with-rollback) shape, but writes to `presentations` instead of
 * room items, and additionally parses the HTML to build `slideMap` per the
 * locked spec's html_slide_map_approach (tiered, regex-only, never throws).
 */
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { canonicalMime } from "@/lib/project-files/allowed-types";
import { isExecutableContent } from "@/lib/project-files/sniff";
import { removeObjects, slugFilename, uploadBytes } from "@/lib/project-files/storage";
import { SITE_URL } from "@/lib/site-url";
import { safeStr, type ToolEntry } from "./_types";
import { decodeBase64Upload } from "./_upload";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // same inline-through-MCP ceiling as upload_room_file
const MAX_ANCHORS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function sanitizeSlideId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

/** First <h1|h2|h3> text inside `scope`, tags stripped + whitespace collapsed. */
function firstHeading(scope: string, maxLen: number): string | null {
  const m = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(scope);
  if (!m) return null;
  const text = stripTags(m[1]);
  return text ? truncate(text, maxLen) : null;
}

type RawAnchor = { rawId: string | null; label: string | null };

/** Tier 1 — explicit `data-slide-id="X"` attribute on any element. */
function tier1Anchors(html: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  const tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\sdata-slide-id\s*=\s*["']([^"']*)["']([^<>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) && out.length < MAX_ANCHORS) {
    const tagName = m[1];
    const attrsBefore = m[2] ?? "";
    const attrsAfter = m[4] ?? "";
    const slideId = m[3];
    const attrs = `${attrsBefore} ${attrsAfter}`;
    const labelAttr = /data-slide-label\s*=\s*["']([^"']*)["']/i.exec(attrs);
    let label: string | null = labelAttr ? stripTags(labelAttr[1]) || null : null;
    if (!label) {
      const closeIdx = html.toLowerCase().indexOf(`</${tagName.toLowerCase()}`, tagRe.lastIndex);
      const scopeEnd = closeIdx === -1 ? Math.min(html.length, tagRe.lastIndex + 20000) : closeIdx;
      label = firstHeading(html.slice(tagRe.lastIndex, scopeEnd), 80);
    }
    out.push({ rawId: slideId || null, label });
  }
  return out;
}

/** Tier 2 — every `<section ...>` element. */
function tier2Anchors(html: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  const tagRe = /<section([^<>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) && out.length < MAX_ANCHORS) {
    const attrs = m[1] ?? "";
    const idAttr = /\bid\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const closeIdx = html.toLowerCase().indexOf("</section", tagRe.lastIndex);
    const scopeEnd = closeIdx === -1 ? Math.min(html.length, tagRe.lastIndex + 20000) : closeIdx;
    const label = firstHeading(html.slice(tagRe.lastIndex, scopeEnd), 80);
    out.push({ rawId: idAttr ? idAttr[1] : null, label });
  }
  return out;
}

/** Tier 3 — `<div ... class="...slide...">` elements. */
function tier3Anchors(html: string): RawAnchor[] {
  const out: RawAnchor[] = [];
  const tagRe = /<div([^<>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) && out.length < MAX_ANCHORS) {
    const attrs = m[1] ?? "";
    const classAttr = /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (!classAttr || !/(^|\s)slide(\s|$)/.test(classAttr[1])) continue;
    const idAttr = /\bid\s*=\s*["']([^"']*)["']/i.exec(attrs);
    const closeIdx = html.toLowerCase().indexOf("</div", tagRe.lastIndex);
    const scopeEnd = closeIdx === -1 ? Math.min(html.length, tagRe.lastIndex + 20000) : closeIdx;
    const label = firstHeading(html.slice(tagRe.lastIndex, scopeEnd), 80);
    out.push({ rawId: idAttr ? idAttr[1] : null, label });
  }
  return out;
}

export type SlideMapEntry = { slideId: string; label: string };

/**
 * Deterministic slide-anchor detection (html_slide_map_approach): tier 1
 * (data-slide-id) → tier 2 (<section>) → tier 3 (.slide divs), first tier
 * with >=1 anchor wins (never merged); falls back to a single 'full' slide
 * surface when no tier matches anything. Pure regex, never throws — worst
 * case is fewer detected anchors, never a crash.
 */
export function buildSlideMap(html: string, fallbackLabel: string): SlideMapEntry[] {
  const tiers = [tier1Anchors, tier2Anchors, tier3Anchors];
  let raw: RawAnchor[] = [];
  for (const tier of tiers) {
    raw = tier(html);
    if (raw.length > 0) break;
  }
  if (raw.length === 0) {
    return [{ slideId: "full", label: fallbackLabel }];
  }

  const seen = new Map<string, number>();
  const dedupe = (id: string): string => {
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    return count === 0 ? id : `${id}-${count + 1}`;
  };

  return raw.map((a, i) => {
    const n = i + 1;
    const base = a.rawId ? sanitizeSlideId(a.rawId) : "";
    const slideId = dedupe(base || `slide-${n}`);
    const label = a.label || `Slide ${n}`;
    return { slideId, label };
  });
}

function extractTitleTag(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const text = stripTags(m[1]);
  return text ? truncate(text, 200) : null;
}

function humanizeFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot === -1 ? filename : filename.slice(0, dot);
  const words = base.replace(/[-_]+/g, " ").trim();
  return words ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : "Untitled Presentation";
}

export const uploadPresentation: ToolEntry = {
  definition: {
    name: "upload_presentation",
    description:
      "Upload an HTML slide deck from its bytes (base64) as a new presentation, so a deck you " +
      "were handed (e.g. exported from a design tool) can be shared and commented on inside the " +
      "CRM. Only .html/.htm files are accepted (max 10 MB inline). Slide anchors are auto-detected " +
      "from the markup for navigation/comments. The presentation is created team-only (visibility " +
      "'team') — it is never publicly reachable until someone deliberately turns on external " +
      "sharing. Returns the internal presentation link.",
    input_schema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "Original filename with extension, e.g. \"pitch-deck.html\" (.html/.htm only)",
        },
        content_base64: {
          type: "string",
          description: "The HTML file's bytes, base64-encoded (a data: URL is also accepted)",
        },
        title: {
          type: "string",
          description: "Display title; defaults to the deck's <title> tag, else the filename",
        },
        subtitle: { type: "string", description: "Optional one-line subtitle" },
        lob_id: {
          type: "string",
          description: "Optional line-of-business id to attach this presentation to",
        },
      },
      required: ["filename", "content_base64"],
    },
  },
  async execute(input, ctx) {
    const filename = safeStr(input.filename, 255);
    if (!filename) return { ok: false, error: "filename (with extension) is required" };

    const ext = extOf(filename);
    if (ext !== ".html" && ext !== ".htm") {
      return {
        ok: false,
        error: "upload_presentation only accepts .html/.htm files. For other file types, use upload_room_file.",
      };
    }

    const decoded = decodeBase64Upload(input.content_base64, MAX_FILE_BYTES);
    if (!decoded.ok) return decoded;
    const { bytes, sizeBytes } = decoded.result;

    if (isExecutableContent(bytes)) {
      return { ok: false, error: "Executable content rejected" };
    }

    const html = Buffer.from(bytes).toString("utf8");
    const mime = canonicalMime(filename, "text/html");

    const title =
      safeStr(input.title, 200) || extractTitleTag(html) || humanizeFilename(filename);
    const subtitle = safeStr(input.subtitle, 500) || null;
    const slideMap = buildSlideMap(html, title);

    let lobId: string | null = null;
    const rawLobId = safeStr(input.lob_id, 100);
    if (rawLobId && UUID_RE.test(rawLobId)) {
      const [lob] = await db
        .select({ id: schema.linesOfBusiness.id })
        .from(schema.linesOfBusiness)
        .where(
          and(
            eq(schema.linesOfBusiness.id, rawLobId),
            eq(schema.linesOfBusiness.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1);
      lobId = lob?.id ?? null;
    }

    const presentationId = crypto.randomUUID();
    const path = `${ctx.workspaceId}/presentations/${presentationId}/${crypto.randomUUID()}-${slugFilename(filename)}`;

    const uploaded = await uploadBytes(path, bytes, mime);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };

    try {
      const [row] = await db
        .insert(schema.presentations)
        .values({
          id: presentationId,
          workspaceId: ctx.workspaceId,
          title,
          subtitle,
          kind: "html",
          htmlUrl: path,
          slideMap,
          lobId,
          createdBy: ctx.userId,
        })
        .returning({ id: schema.presentations.id });

      return {
        ok: true,
        data: {
          presentationId: row.id,
          title,
          kind: "html",
          slideCount: slideMap.length,
          sizeBytes,
          href: `${SITE_URL}/presentations/${row.id}`,
        },
        speak: `Uploaded "${title}" (${slideMap.length} slide${slideMap.length === 1 ? "" : "s"}).`,
      };
    } catch (e) {
      // Don't leave an orphaned Storage object if the DB write fails.
      await removeObjects([path]).catch(() => {});
      throw e;
    }
  },
};
