import { describe, expect, it } from "vitest";
import {
  HERO_IMAGE_THEMES,
  buildHeroImagePrompt,
  heroImageTheme,
  pickThemeForRoom,
  roomHeroImageUrl,
} from "@/lib/partner-room-hero-images";

describe("partner-room hero image themes", () => {
  it("has unique keys and non-empty scenes", () => {
    const keys = HERO_IMAGE_THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of HERO_IMAGE_THEMES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.scene.length).toBeGreaterThan(20);
    }
  });

  it("resolves themes by key and rejects unknowns", () => {
    expect(heroImageTheme("tepui")?.label).toBe("Tepuis de Canaima");
    expect(heroImageTheme("not-a-theme")).toBeNull();
    expect(heroImageTheme(null)).toBeNull();
    expect(heroImageTheme(undefined)).toBeNull();
  });

  it("builds prompts that forbid text and watermarks", () => {
    const prompt = buildHeroImagePrompt(HERO_IMAGE_THEMES[0]);
    expect(prompt).toContain(HERO_IMAGE_THEMES[0].scene);
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no watermarks/i);
  });

  it("picks a deterministic theme per room id", () => {
    const roomId = "0b7e9d2c-1f34-4a56-9c78-def012345678";
    const first = pickThemeForRoom(roomId);
    expect(pickThemeForRoom(roomId)).toBe(first);
    // Different rooms can land on different themes (hash spreads).
    const others = new Set(
      [
        "0b7e9d2c-1f34-4a56-9c78-def012345678",
        "a1b2c3d4-0000-4111-8222-333344445555",
        "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      ].map((id) => pickThemeForRoom(id).key),
    );
    expect(others.size).toBeGreaterThan(1);
  });

  it("builds a versioned proxy URL only when a path exists", () => {
    const generatedAt = new Date("2026-07-15T12:00:00Z");
    expect(
      roomHeroImageUrl({
        id: "room-1",
        heroImageStoragePath: "ws/room-heros/room-1/x-tepui.jpg",
        heroImageGeneratedAt: generatedAt,
      }),
    ).toBe(`/api/room-hero/room-1?v=${generatedAt.getTime()}`);
    expect(
      roomHeroImageUrl({
        id: "room-1",
        heroImageStoragePath: null,
        heroImageGeneratedAt: null,
      }),
    ).toBeNull();
  });
});
