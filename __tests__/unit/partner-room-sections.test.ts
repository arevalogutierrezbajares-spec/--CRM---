import { describe, expect, it } from "vitest";
import {
  REPO_SECTION_OPTIONS,
  REPO_SECTION_VALUES,
  repoSection,
  repoSectionLabel,
} from "@/lib/partner-access";
import { ROOM_HERO_VIDEOS, roomHeroVideo } from "@/lib/partner-room-videos";
import { formatRelativeEs } from "@/lib/utils";

describe("repository sections", () => {
  it("falls back to the default section for null/unknown values", () => {
    expect(repoSection(null)).toBe("documentos");
    expect(repoSection(undefined)).toBe("documentos");
    expect(repoSection("not-a-section")).toBe("documentos");
    expect(repoSection("contratos")).toBe("contratos");
  });

  it("labels every preset section", () => {
    for (const option of REPO_SECTION_OPTIONS) {
      expect(repoSectionLabel(option.value)).toBe(option.label);
      expect(REPO_SECTION_VALUES.has(option.value)).toBe(true);
    }
    expect(repoSectionLabel("garbage")).toBe("Documentos");
  });
});

describe("room hero videos", () => {
  it("resolves preset keys and rejects unknown ones", () => {
    expect(roomHeroVideo(null)).toBeNull();
    expect(roomHeroVideo("not-real")).toBeNull();
    const canaima = roomHeroVideo("canaima");
    expect(canaima?.mp4).toBe("/partner-room/videos/canaima.mp4");
    expect(canaima?.webm).toBe("/partner-room/videos/canaima.webm");
    expect(canaima?.poster).toBe("/partner-room/videos/canaima-poster.jpg");
  });

  it("every preset points at the partner-room assets folder", () => {
    for (const video of ROOM_HERO_VIDEOS) {
      expect(video.mp4).toMatch(/^\/partner-room\/videos\/.+\.mp4$/);
      expect(video.webm).toMatch(/^\/partner-room\/videos\/.+\.webm$/);
      expect(video.poster).toMatch(/^\/partner-room\/videos\/.+-poster\.jpg$/);
    }
  });
});

describe("formatRelativeEs", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("handles the near-past buckets in Spanish", () => {
    const now = Date.now();
    expect(formatRelativeEs(new Date(now - 1000))).toBe("hoy");
    expect(formatRelativeEs(new Date(now - 1 * DAY - 1000))).toBe("ayer");
    expect(formatRelativeEs(new Date(now - 3 * DAY))).toBe("hace 3 días");
    expect(formatRelativeEs(new Date(now - 8 * DAY))).toBe("hace 1 semana");
    expect(formatRelativeEs(new Date(now - 70 * DAY))).toBe("hace 2 meses");
    expect(formatRelativeEs(new Date(now - 800 * DAY))).toBe("hace 2 años");
    expect(formatRelativeEs(null)).toBe("nunca");
  });
});
