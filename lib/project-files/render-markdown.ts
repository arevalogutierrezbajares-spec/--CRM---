import "server-only";
import { marked } from "marked";

/**
 * Render a Markdown string to a complete, self-contained HTML document for the
 * "Open in new tab" path. Uses `marked` (sync, GFM tables/lists). Any raw HTML
 * embedded in the Markdown is rendered inert by the route's opaque-origin
 * `Content-Security-Policy: sandbox` (no allow-scripts), the same protection the
 * HTML-deck viewer relies on.
 */
export function renderMarkdownDocument(markdown: string, title: string): string {
  const body = marked.parse(markdown, { async: false, gfm: true }) as string;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
    title,
  )}</title><style>${STYLES}</style></head><body><article class="prose">${body}</article></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #ffffff;
  color: #1a1a1a;
  font: 16px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.prose {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 28px 96px;
}
.prose h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .6em; font-weight: 700; }
.prose h2 { font-size: 1.45rem; line-height: 1.25; margin: 1.6em 0 .5em; font-weight: 650; border-bottom: 1px solid #ececec; padding-bottom: .25em; }
.prose h3 { font-size: 1.18rem; margin: 1.4em 0 .4em; font-weight: 600; }
.prose h4, .prose h5, .prose h6 { margin: 1.2em 0 .4em; font-weight: 600; }
.prose p { margin: 0 0 1em; }
.prose a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
.prose ul, .prose ol { margin: 0 0 1em; padding-left: 1.5em; }
.prose li { margin: .25em 0; }
.prose blockquote { margin: 0 0 1em; padding: .2em 0 .2em 1em; border-left: 3px solid #d7d7d7; color: #555; }
.prose code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; background: #f3f3f3; padding: .15em .4em; border-radius: 4px; }
.prose pre { background: #f6f8fa; padding: 16px; border-radius: 8px; overflow: auto; margin: 0 0 1em; }
.prose pre code { background: none; padding: 0; }
.prose table { border-collapse: collapse; width: 100%; margin: 0 0 1em; font-size: .95em; }
.prose th, .prose td { border: 1px solid #e2e2e2; padding: 6px 10px; text-align: left; }
.prose th { background: #f6f6f6; font-weight: 600; }
.prose img { max-width: 100%; height: auto; }
.prose hr { border: none; border-top: 1px solid #e6e6e6; margin: 2em 0; }
@media (prefers-color-scheme: dark) {
  body { background: #0e0f11; color: #e6e6e6; }
  .prose h2 { border-bottom-color: #26282c; }
  .prose a { color: #6ea8fe; }
  .prose blockquote { border-left-color: #3a3d42; color: #a8a8a8; }
  .prose code { background: #1c1e22; }
  .prose pre { background: #15171a; }
  .prose th, .prose td { border-color: #2a2c30; }
  .prose th { background: #17191c; }
  .prose hr { border-top-color: #26282c; }
}
`;
