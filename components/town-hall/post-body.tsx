"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { PostView } from "@/db/queries/town-hall";
import { refHref } from "./types";

/**
 * Render a post body, linkifying @mentions and #references. We match the EXACT
 * known tokens from the post's persisted mentions/refs (longest-first, case-
 * insensitive) rather than a generic character class — so labels/handles with
 * punctuation, spaces, accents, or arbitrary length still linkify, and a
 * multi-word ref can't greedily swallow trailing prose.
 */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function PostBody({ post }: { post: PostView }) {
  type Tok =
    | { kind: "mention"; text: string }
    | { kind: "ref"; text: string; refType: PostView["refs"][number]["refType"]; refId: string };

  const tokens: Tok[] = [
    ...post.mentions.map((m) => ({
      kind: "mention" as const,
      text: `@${m.displayName.toLowerCase().replace(/\s+/g, "")}`,
    })),
    ...post.refs.map((r) => ({
      kind: "ref" as const,
      text: `#${r.label}`,
      refType: r.refType,
      refId: r.refId,
    })),
  ]
    // Longest first so e.g. "@anabel" wins over "@ana", and a long #label
    // isn't shadowed by a shorter prefix.
    .sort((a, b) => b.text.length - a.text.length);

  const body = post.body;

  if (tokens.length === 0) {
    return (
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary">
        {body}
      </p>
    );
  }

  const re = new RegExp(`(${tokens.map((t) => escapeRe(t.text)).join("|")})`, "gi");
  const parts = body.split(re);

  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary">
      {parts.map((part, i) => {
        const tok = tokens.find((t) => t.text.toLowerCase() === part.toLowerCase());
        if (tok?.kind === "mention") {
          return (
            <span key={i} className="rounded px-0.5 font-medium" style={{ color: "var(--blue-text)" }}>
              {part}
            </span>
          );
        }
        if (tok?.kind === "ref") {
          return (
            <Link
              key={i}
              href={refHref(tok.refType, tok.refId)}
              className="rounded px-0.5 font-medium hover:underline"
              style={{ color: "var(--blue-text)" }}
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}
