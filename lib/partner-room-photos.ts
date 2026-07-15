// Preset photo sets for the partner-room hero — archival expedition
// photography rendered as "living film" (Ken Burns drift + crossfade + film
// grain + silver-gelatin grade in RoomHeroArchive).
//
// Photo sets share the `partner_rooms.hero_video_key` keyspace with the video
// presets (lib/partner-room-videos): that column is really "hero media preset
// key", and one column = one background choice per room. Keys must therefore
// be unique across BOTH lists — pinned by a unit test.

export type RoomHeroPhoto = {
  /** Full-resolution image (public/ path). Doubles as the poster/OG image. */
  src: string;
  /** Responsive candidates, so phones don't download the full-res scan. */
  srcSet?: string;
  /** CSS object-position focal point — keeps the subject in frame across
   *  the hero's very wide desktop crop and squarer mobile crop. */
  position?: string;
};

export type RoomHeroPhotoSet = {
  key: string;
  label: string;
  /** Small provenance caption rendered in the hero's corner (e.g. archive credit). */
  caption?: string;
  images: RoomHeroPhoto[];
};

const base = "/partner-room/photos";

function photo(dir: string, name: string, position?: string): RoomHeroPhoto {
  // 800w covers 1–2x phones, 1200w covers 3x phones (390 CSS px × 3 = 1170),
  // full res covers desktop and retina laptops.
  return {
    src: `${base}/${dir}/${name}.jpg`,
    srcSet:
      `${base}/${dir}/${name}-800.jpg 800w, ` +
      `${base}/${dir}/${name}-1200.jpg 1200w, ` +
      `${base}/${dir}/${name}.jpg 1852w`,
    position,
  };
}

export const ROOM_HERO_PHOTO_SETS: readonly RoomHeroPhotoSet[] = [
  {
    key: "expedicion-canaima",
    label: "Expedición Canaima (archivo)",
    caption: "Archivo · Canaima, c. 1950",
    images: [
      // Plane + Auyán-tepui: bias right-of-center (horizontal only crops on
      // mobile — keeps the aircraft in frame) and slightly above center so
      // the wide desktop crop holds the mesa's cloud line.
      photo("expedicion-canaima", "01-avioneta-auyantepui", "62% 42%"),
      // Churuata sits in the upper half; the waterhole reflections carry the
      // lower band, so a mid bias keeps both in the wide crop.
      photo("expedicion-canaima", "02-churuata-sabana", "center 55%"),
    ],
  },
];

export function roomHeroPhotoSet(
  key: string | null | undefined,
): RoomHeroPhotoSet | null {
  if (!key) return null;
  return ROOM_HERO_PHOTO_SETS.find((s) => s.key === key) ?? null;
}
