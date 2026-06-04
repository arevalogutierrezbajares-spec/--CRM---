"use client";

import Link from "next/link";
import { Fragment } from "react";
import type { PostView } from "@/db/queries/town-hall";
import { refHref } from "./types";

/**
 * Render a post body, linkifying @mentions (against the post's resolved
 * mentions) and #references (against the post's resolved refs). We tokenize the
 * raw text and, for each @handle / #label, swap in a link when it matches a
 * persisted mention/ref. Unmatched tokens render as plain text.
 */
export function PostBody({ post }: { post: PostView }) {
  const mentionByHandle = new Map(
    post.mentions.map((m) => [
      m.displayName.toLowerCase().replace(/\s+/g, ""),
      m,
    ]),
  );
  const refByLabel = new Map(
    post.refs.map((r) => [r.label.toLowerCase(), r]),
  );

  // Split on @handle and #label tokens, keeping the delimiters.
  const parts = post.body.split(/(@[a-zA-Z0-9._-]+|#[a-zA-Z0-9._\- ]{1,60})/g);

  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-primary">
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const handle = part.slice(1).toLowerCase().replace(/\s+/g, "");
          const m = mentionByHandle.get(handle);
          if (m) {
            return (
              <span
                key={i}
                className="rounded px-0.5 font-medium"
                style={{ color: "var(--blue-text)" }}
              >
                {part}
              </span>
            );
          }
          return <Fragment key={i}>{part}</Fragment>;
        }
        if (part.startsWith("#")) {
          const label = part.slice(1).trim().toLowerCase();
          const r = refByLabel.get(label);
          if (r) {
            return (
              <Link
                key={i}
                href={refHref(r.refType, r.refId)}
                className="rounded px-0.5 font-medium hover:underline"
                style={{ color: "var(--blue-text)" }}
              >
                {part.trim()}
              </Link>
            );
          }
          return <Fragment key={i}>{part}</Fragment>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}
