/**
 * Rebuild searchable dialogue text from stored utterances + human speaker map.
 * Client-safe (no server-only imports) so UI can preview labels; server uses the
 * same rules via deepgram.buildDialogue.
 */
export type DialogueUtterance = {
  speaker: string;
  channel: number;
  start: number;
  end: number;
  text: string;
  diarizationId?: string;
};

export type DialogueLabels = {
  founder: string;
  participant: string;
  speakerMap?: Record<string, string>;
};

function fmtTs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function resolveSpeakerLabel(
  u: DialogueUtterance,
  labels: DialogueLabels,
): string {
  const map = labels.speakerMap ?? {};
  const key = u.diarizationId ?? u.speaker;
  if (map[key]) return map[key];
  if (u.speaker.startsWith("SPEAKER_") && map[u.speaker]) return map[u.speaker];
  // founder:SPEAKER_00 style from Deepgram call diarize
  if (key.includes(":") && map[key.split(":").pop()!]) {
    return map[key.split(":").pop()!];
  }
  if (u.speaker === "founder") return labels.founder;
  if (u.speaker === "participant") return labels.participant;
  if (u.speaker.startsWith("SPEAKER_")) return u.speaker;
  if (u.speaker.startsWith("founder:")) {
    const id = u.speaker.slice("founder:".length);
    return map[id] ?? labels.founder;
  }
  if (u.speaker.startsWith("participant:")) {
    const id = u.speaker.slice("participant:".length);
    return map[id] ?? labels.participant;
  }
  return u.channel === 0 ? labels.founder : labels.participant;
}

export function rebuildDialogue(
  utterances: DialogueUtterance[],
  labels: DialogueLabels,
): string {
  return utterances
    .map((u) => `[${fmtTs(u.start)}] ${resolveSpeakerLabel(u, labels)}: ${u.text}`)
    .join("\n");
}

/** Unique diarization cluster ids for the map UI (SPEAKER_00…). */
export function extractDiarizationClusters(
  utterances: DialogueUtterance[] | null | undefined,
): string[] {
  if (!utterances?.length) return [];
  const set = new Set<string>();
  for (const u of utterances) {
    if (u.diarizationId?.startsWith("SPEAKER_")) {
      set.add(u.diarizationId);
      continue;
    }
    if (u.speaker.startsWith("SPEAKER_")) {
      set.add(u.speaker);
      continue;
    }
    // founder:SPEAKER_00 / participant:SPEAKER_01
    const m = u.speaker.match(/(SPEAKER_\d+)/);
    if (m) set.add(m[1]);
  }
  return [...set].sort();
}
