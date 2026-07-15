import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOM_HERO_PHOTO_SETS, roomHeroPhotoSet } from "@/lib/partner-room-photos";
import { ROOM_HERO_VIDEOS } from "@/lib/partner-room-videos";

describe("partner-room hero photo sets", () => {
  it("keys are unique across photo sets AND video presets (shared column)", () => {
    const keys = [
      ...ROOM_HERO_VIDEOS.map((v) => v.key),
      ...ROOM_HERO_PHOTO_SETS.map((s) => s.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every image file ships in public/, including srcSet variants", () => {
    for (const set of ROOM_HERO_PHOTO_SETS) {
      expect(set.images.length).toBeGreaterThan(0);
      for (const img of set.images) {
        expect(existsSync(join(process.cwd(), "public", img.src)), img.src).toBe(true);
        for (const candidate of img.srcSet?.split(",") ?? []) {
          const path = candidate.trim().split(/\s+/)[0];
          expect(existsSync(join(process.cwd(), "public", path)), path).toBe(true);
        }
      }
    }
  });

  it("resolves by key and rejects unknowns/video keys", () => {
    expect(roomHeroPhotoSet("expedicion-canaima")?.images.length).toBe(2);
    expect(roomHeroPhotoSet("canaima")).toBeNull(); // that's a video preset
    expect(roomHeroPhotoSet(null)).toBeNull();
  });
});
