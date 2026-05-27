import { describe, it, expect } from "vitest";
import { extractLinks, stripLinks } from "@/lib/wa-agent/media/links";

describe("extractLinks", () => {
  it("extracts a single URL", () => {
    const links = extractLinks("Check this out: https://example.com");
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://example.com");
    expect(links[0].domain).toBe("example.com");
  });

  it("extracts multiple URLs", () => {
    const links = extractLinks("See https://a.com and https://b.org for details");
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.domain)).toEqual(["a.com", "b.org"]);
  });

  it("strips www. from domain", () => {
    const links = extractLinks("https://www.google.com/search?q=test");
    expect(links[0].domain).toBe("google.com");
  });

  it("returns empty array for no URLs", () => {
    expect(extractLinks("no urls here")).toHaveLength(0);
  });

  it("handles http and https", () => {
    const links = extractLinks("http://old.site and https://new.site");
    expect(links).toHaveLength(2);
  });
});

describe("stripLinks", () => {
  it("removes links from text", () => {
    const { clean, links } = stripLinks("Look at https://example.com now");
    expect(clean).toBe("Look at now");
    expect(links).toHaveLength(1);
  });

  it("returns original text when no links", () => {
    const { clean, links } = stripLinks("just text here");
    expect(clean).toBe("just text here");
    expect(links).toHaveLength(0);
  });
});
