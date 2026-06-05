/**
 * ÑIGO spoken-line catalog.
 *
 * Approved lines are eligible for ElevenLabs rendering and UI playback.
 * Pending lines live here so they can be reviewed in code before they become
 * product behavior.
 */

export type JarvisVoiceCategory = "notification" | "system" | "joke";
export type JarvisVoiceStatus = "approved" | "pending_approval";

export type JarvisVoiceLine = {
  /** Stable MP3 filename stem under /public/jarvis. */
  slug: string;
  category: JarvisVoiceCategory;
  status: JarvisVoiceStatus;
  /** Exact text sent to ElevenLabs. */
  text: string;
  /** Where this line is intended to be used. */
  usage: string;
};

export const DEMON_MODE_ENABLED_KEY = "agb.demonMode.enabled";
export const DEMON_MODE_INTENSITY_KEY = "agb.demonMode.intensity";
export const DEMON_MODE_SETTINGS_EVENT = "agb:demon-mode-settings";
export const DEMON_MODE_TEST_EVENT = "agb:demon-mode-test";

export type DemonModeIntensity = "low" | "normal" | "high";

export type DemonModeMessageClip = {
  slug: string;
  label: string;
  src: string;
};

export const DEMON_MODE_INTENSITIES: readonly {
  value: DemonModeIntensity;
  label: string;
  cooldownMs: number;
  chance: number;
}[] = [
  { value: "low", label: "Low", cooldownMs: 180_000, chance: 0.08 },
  { value: "normal", label: "Normal", cooldownMs: 90_000, chance: 0.14 },
  { value: "high", label: "High", cooldownMs: 45_000, chance: 0.22 },
];

export const JARVIS_VOICE_LINES = [
  {
    slug: "notification-unread-sir",
    category: "notification",
    status: "approved",
    text: "You have got a notification, sir.",
    usage: "Played when the unread notification count increases after initial page load.",
  },
  {
    slug: "system-back-online",
    category: "system",
    status: "approved",
    text: "Systems are back online, sir.",
    usage: "Reserved for future recovery states after a reconnect or service restoration.",
  },
  {
    slug: "demon-mode-online",
    category: "system",
    status: "approved",
    text: "Demon mode is online, sir.",
    usage: "Optional confirmation line when DEMON mode is enabled.",
  },
  {
    slug: "demon-click-audit",
    category: "joke",
    status: "pending_approval",
    text: "I saw that click, sir. Bold strategy.",
    usage: "Candidate DEMON mode activity joke. Do not render or play until approved.",
  },
  {
    slug: "demon-calendar-ominous",
    category: "joke",
    status: "pending_approval",
    text: "Your calendar has made another threat, sir.",
    usage: "Candidate DEMON mode activity joke. Do not render or play until approved.",
  },
  {
    slug: "joke-pipeline-cardio",
    category: "joke",
    status: "pending_approval",
    text: "I reviewed the pipeline, sir. Several deals appear to be doing cardio.",
    usage: "Candidate dry CRM joke. Do not render or play until approved.",
  },
  {
    slug: "joke-humans-work-in-progress",
    category: "joke",
    status: "pending_approval",
    text: "The CRM is fully operational, sir. The humans remain a work in progress.",
    usage: "Candidate dry CRM joke. Do not render or play until approved.",
  },
  {
    slug: "joke-ignore-notification",
    category: "joke",
    status: "pending_approval",
    text: "Another notification, sir. I would ignore it for you, but that is how startups die.",
    usage: "Candidate dry notification joke. Do not render or play until approved.",
  },
] as const satisfies readonly JarvisVoiceLine[];

export type JarvisVoiceSlug = (typeof JARVIS_VOICE_LINES)[number]["slug"];

export function approvedJarvisVoiceLines(): JarvisVoiceLine[] {
  return JARVIS_VOICE_LINES.filter((line) => line.status === "approved");
}

export function pendingJarvisVoiceLines(): JarvisVoiceLine[] {
  return JARVIS_VOICE_LINES.filter((line) => line.status === "pending_approval");
}

export function jarvisVoiceLine(slug: JarvisVoiceSlug): JarvisVoiceLine {
  const line = JARVIS_VOICE_LINES.find((candidate) => candidate.slug === slug);
  if (!line) throw new Error(`Unknown ÑIGO voice line: ${slug}`);
  return line;
}

export function jarvisVoiceAudioSrc(slug: JarvisVoiceSlug): string {
  return `/jarvis/${slug}.mp3`;
}

export function demonModeIntensity(value: string | null | undefined) {
  return DEMON_MODE_INTENSITIES.find((candidate) => candidate.value === value) ?? DEMON_MODE_INTENSITIES[1];
}

function sirTitle(spokenTitle: string): string {
  return spokenTitle.replace(/^Master\s+/i, "").replace(/^Don\s+/i, "").replace(/^Sir\s+/i, "").trim() || "Founder";
}

export function demonMessageLine(spokenTitle: string): string {
  return `Sir ${sirTitle(spokenTitle)}, I have a message.`;
}

export function demonMessageAudioSrc(slug: string): string {
  return `/jarvis/demon-message-${slug}.mp3`;
}

export function demonTrumpMessageAudioSrc(): string {
  return "/jarvis/demon-trump-message.mp3";
}

export function demonConnorSpeechAudioSrc(): string {
  return "/jarvis/demon-connor-speech.mp3";
}

export function demonConnorMessage2AudioSrc(): string {
  return "/jarvis/demon-connor-message-2.mp3";
}

export function demonModeMessageClips(): DemonModeMessageClip[] {
  return [
    {
      slug: "trump-message",
      label: "Trump message",
      src: demonTrumpMessageAudioSrc(),
    },
    {
      slug: "connor-speech",
      label: "Connor speech",
      src: demonConnorSpeechAudioSrc(),
    },
    {
      slug: "connor-message-2",
      label: "Connor message 2",
      src: demonConnorMessage2AudioSrc(),
    },
  ];
}
