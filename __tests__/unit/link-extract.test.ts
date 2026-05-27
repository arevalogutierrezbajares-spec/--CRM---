import { describe, it, expect } from "vitest";
import { extractLinks, stripLinks } from "@/lib/wa-agent/media/links";

describe("extractLinks", () => {
  it("finds a plain URL", () => {
    const links = extractLinks("Check out https://example.com for details");
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com");
  });

  it("finds multiple URLs", () => {
    const links = extractLinks("https://a.com and http://b.org/path?q=1");
    expect(links).toHaveLength(2);
  });

  it("finds URL with path and query", () => {
    const links = extractLinks("https://laguaquira.com/rooms?view=all&lang=es");
    expect(links[0].url).toBe("https://laguaquira.com/rooms?view=all&lang=es");
  });

  it("returns empty for no URLs", () => {
    expect(extractLinks("just plain text here")).toHaveLength(0);
  });

  it("finds Instagram link", () => {
    const links = extractLinks("Follow us at https://instagram.com/laguaquira_hotel");
    expect(links[0].url).toContain("instagram.com");
  });
});

describe("stripLinks", () => {
  it("removes URLs from text", () => {
    const { clean, links } = stripLinks("Check https://example.com for details");
    expect(clean).toBe("Check for details");
    expect(links).toHaveLength(1);
  });

  it("returns original text and empty links when no URLs", () => {
    const { clean, links } = stripLinks("no links here");
    expect(clean).toBe("no links here");
    expect(links).toHaveLength(0);
  });
});
