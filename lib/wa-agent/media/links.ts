export type ExtractedLink = {
  url: string;
  domain: string;
};

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export function extractLinks(text: string): ExtractedLink[] {
  const matches = text.match(URL_RE) ?? [];
  return matches.map((url) => {
    let domain = url;
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      // not a parseable URL — use raw
    }
    return { url, domain };
  });
}

export function stripLinks(text: string): { clean: string; links: ExtractedLink[] } {
  const links = extractLinks(text);
  const clean = text.replace(URL_RE, "").replace(/\s{2,}/g, " ").trim();
  return { clean, links };
}
