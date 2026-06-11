// Preset background videos for the partner-room hero. Files ship in
// public/partner-room/videos (mp4 + webm + poster) — same footage as the
// VAV landing heroes, so they stay short (9–14s), loopable, and light.
// partner_rooms.hero_video_key stores the `key`; null = no video.

export type RoomHeroVideo = {
  key: string;
  label: string;
  mp4: string;
  webm: string;
  poster: string;
};

const base = "/partner-room/videos";

function preset(key: string, label: string): RoomHeroVideo {
  return {
    key,
    label,
    mp4: `${base}/${key}.mp4`,
    webm: `${base}/${key}.webm`,
    poster: `${base}/${key}-poster.jpg`,
  };
}

export const ROOM_HERO_VIDEOS: readonly RoomHeroVideo[] = [
  preset("canaima", "Canaima"),
  preset("los-roques", "Los Roques"),
  preset("roraima", "Roraima"),
  preset("llanos", "Los Llanos"),
  preset("catatumbo", "Catatumbo"),
  preset("merida", "Mérida"),
];

export function roomHeroVideo(
  key: string | null | undefined,
): RoomHeroVideo | null {
  if (!key) return null;
  return ROOM_HERO_VIDEOS.find((v) => v.key === key) ?? null;
}
