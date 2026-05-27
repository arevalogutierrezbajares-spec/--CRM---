/**
 * Link extraction from text messages.
 */

const URL_REGEX = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export type ExtractedLink = { url: string; index: number };

export function extractLinks(text: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  while ((match = re.exec(text)) !== null) {
    links.push({ url: match[0], index: match.index });
  }
  return links;
}

/** Strip URLs from text and return both the clean text and the extracted links. */
export function stripLinks(text: string): { clean: string; links: ExtractedLink[] } {
  const links = extractLinks(text);
  const clean = text.replace(URL_REGEX, "").replace(/\s{2,}/g, " ").trim();
  return { clean, links };
}
