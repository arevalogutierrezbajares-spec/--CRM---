/**
 * Minimal Markdown renderer for research notes.
 * Supports: H1-H4, paragraphs, lists, code blocks, inline code, bold, italic,
 *           links, images, blockquotes, hr. No table support (intentional).
 * No external dependency.
 */

import { Fragment, type ReactNode } from "react";

interface MarkdownProps {
  source: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(line: string): ReactNode {
  // Process in passes: code → bold → italic → links → images.
  // We split-render via DOM nodes for safety; no dangerouslySetInnerHTML.
  const nodes: ReactNode[] = [];
  let rest = line;
  let key = 0;

  const patterns: Array<{
    re: RegExp;
    render: (m: RegExpMatchArray) => ReactNode;
  }> = [
    {
      re: /`([^`]+)`/,
      render: (m) => (
        <code
          key={`c-${key++}`}
          className="rounded bg-surface px-1 py-0.5 text-tiny font-mono"
        >
          {m[1]}
        </code>
      ),
    },
    {
      re: /!\[([^\]]*)\]\(([^)]+)\)/,
      render: (m) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`i-${key++}`}
          src={m[2]}
          alt={m[1]}
          className="my-2 max-w-full rounded border"
          style={{ borderColor: "var(--border-default)" }}
        />
      ),
    },
    {
      re: /\[([^\]]+)\]\(([^)]+)\)/,
      render: (m) => (
        <a
          key={`a-${key++}`}
          href={m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-text underline hover:opacity-80"
        >
          {m[1]}
        </a>
      ),
    },
    {
      re: /\*\*([^*]+)\*\*/,
      render: (m) => <strong key={`b-${key++}`}>{m[1]}</strong>,
    },
    {
      re: /\*([^*]+)\*/,
      render: (m) => <em key={`e-${key++}`}>{m[1]}</em>,
    },
    {
      re: /_([^_]+)_/,
      render: (m) => <em key={`u-${key++}`}>{m[1]}</em>,
    },
    {
      re: /\bhttps?:\/\/[^\s)]+/,
      render: (m) => (
        <a
          key={`u-${key++}`}
          href={m[0]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-text underline hover:opacity-80 break-all"
        >
          {m[0]}
        </a>
      ),
    },
  ];

  // Walk and consume tokens
  while (rest.length > 0) {
    let earliest: {
      idx: number;
      length: number;
      render: () => ReactNode;
    } | null = null;
    for (const p of patterns) {
      const m = rest.match(p.re);
      if (m && m.index !== undefined) {
        if (!earliest || m.index < earliest.idx) {
          earliest = {
            idx: m.index,
            length: m[0].length,
            render: () => p.render(m),
          };
        }
      }
    }
    if (!earliest) {
      nodes.push(rest);
      break;
    }
    if (earliest.idx > 0) nodes.push(rest.slice(0, earliest.idx));
    nodes.push(earliest.render());
    rest = rest.slice(earliest.idx + earliest.length);
  }
  return <>{nodes}</>;
}

interface Block {
  type:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "p"
    | "ul"
    | "ol"
    | "code"
    | "quote"
    | "hr"
    | "frontmatter";
  content: string;
  lang?: string;
}

function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split(/\r?\n/);
  let i = 0;

  // Strip frontmatter
  if (lines[0]?.trim() === "---") {
    let j = 1;
    while (j < lines.length && lines[j].trim() !== "---") j++;
    if (j < lines.length) {
      blocks.push({
        type: "frontmatter",
        content: lines.slice(1, j).join("\n"),
      });
      i = j + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", content: buf.join("\n"), lang });
      i++;
      continue;
    }

    // HR
    if (/^---+$/.test(line)) {
      blocks.push({ type: "hr", content: "" });
      i++;
      continue;
    }

    // Headings
    const hm = line.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length as 1 | 2 | 3 | 4;
      blocks.push({
        type: (`h${level}` as Block["type"]),
        content: hm[2].trim(),
      });
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", content: buf.join("\n") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", content: buf.join("\n") });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", content: buf.join("\n") });
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (consume until blank line)
    const buf: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s+|>\s|```|\s*[-*+]\s+|\s*\d+\.\s+|---+$)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", content: buf.join(" ") });
  }

  return blocks;
}

export function Markdown({ source }: MarkdownProps) {
  const blocks = parseBlocks(source);

  return (
    <article className="text-[13.5px] text-text-primary leading-relaxed space-y-3">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case "frontmatter":
            return (
              <details
                key={idx}
                className="rounded border bg-surface/40 px-3 py-1.5 text-tiny font-mono text-text-tertiary"
                style={{ borderColor: "var(--border-default)" }}
              >
                <summary className="cursor-pointer">frontmatter</summary>
                <pre className="mt-1 whitespace-pre-wrap">{b.content}</pre>
              </details>
            );
          case "h1":
            return (
              <h1
                key={idx}
                className="text-[22px] font-medium tracking-tight mt-4 mb-2"
              >
                {renderInline(b.content)}
              </h1>
            );
          case "h2":
            return (
              <h2
                key={idx}
                className="text-[18px] font-medium tracking-tight mt-4 mb-1.5"
              >
                {renderInline(b.content)}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={idx}
                className="text-[15px] font-medium tracking-tight mt-3 mb-1"
              >
                {renderInline(b.content)}
              </h3>
            );
          case "h4":
            return (
              <h4 key={idx} className="text-[13px] font-medium mt-3 mb-0.5">
                {renderInline(b.content)}
              </h4>
            );
          case "p":
            return <p key={idx}>{renderInline(b.content)}</p>;
          case "ul":
            return (
              <ul key={idx} className="list-disc pl-5 space-y-1">
                {b.content.split("\n").map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="list-decimal pl-5 space-y-1">
                {b.content.split("\n").map((item, i) => (
                  <li key={i}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l-2 pl-3 italic text-text-secondary"
                style={{ borderColor: "var(--border-default)" }}
              >
                {b.content.split("\n").map((line, i) => (
                  <Fragment key={i}>
                    {renderInline(line)}
                    <br />
                  </Fragment>
                ))}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={idx}
                className="rounded-md border bg-surface p-3 text-tiny font-mono overflow-x-auto"
                style={{ borderColor: "var(--border-default)" }}
              >
                {b.lang && (
                  <div className="text-tiny text-text-tertiary mb-1.5 uppercase tracking-wider">
                    {b.lang}
                  </div>
                )}
                <code>{escapeHtml(b.content)}</code>
              </pre>
            );
          case "hr":
            return (
              <hr
                key={idx}
                className="my-3 border-t"
                style={{ borderColor: "var(--border-default)" }}
              />
            );
        }
      })}
    </article>
  );
}
