/**
 * Founder headshots (same photos as the investor pitch deck, in
 * /public/team/). Room team members are workspace users with free-form
 * display names ("tg.2000", "charlesbrewerleon", …), so resolution goes
 * email-first, then falls back to surname/first-name matching on the
 * normalized display name.
 */

type Founder = {
  photo: string;
  /** Canonical partner-facing name (matches the pitch deck) — shown instead
   *  of raw account handles like "tg.2000". */
  name: string;
  /** Deck role — used when the room team row has no title of its own. */
  title: string;
  emails: string[];
  /** Known account handles, matched against the whole normalized name. */
  handles: string[];
  /** Distinctive surname, matched as a substring of the normalized name. */
  surname: string;
  /** First name, matched only at the start of the name. */
  firstName: RegExp;
};

const FOUNDERS: Founder[] = [
  {
    photo: "/team/tomas.jpg",
    name: "Tomás Gutiérrez",
    title: "Co-founder · Product & Technology",
    emails: ["tg.2000@icloud.com", "tomas.gutierrez.2000@gmail.com"],
    handles: ["tg.2000"],
    surname: "gutierrez",
    firstName: /^tomas\b/,
  },
  {
    photo: "/team/jose.jpg",
    name: "José Ernesto Arévalo",
    title: "Co-founder · Go-to-Market",
    emails: ["joearevalo21@gmail.com", "+16466752101@whatsapp.local"],
    handles: ["joearevalo21", "jose ernesto"],
    surname: "arevalo",
    firstName: /^jose\b/,
  },
  {
    photo: "/team/charles.jpg",
    name: "Charles Brewer",
    title: "Co-founder · Go-to-Market",
    emails: ["charlesbrewerleon@gmail.com"],
    handles: ["charlesbrewerleon"],
    surname: "brewer",
    firstName: /^charles\b/,
  },
];

/**
 * The founders as a fixed, ordered directory (Tomás, José, Charles) — photo +
 * canonical name + role. Used by the top-bar presence bubbles, which always
 * show all three faces and light up whoever is currently online.
 */
export const FOUNDER_DIRECTORY: ReadonlyArray<{
  name: string;
  title: string;
  photoUrl: string;
}> = FOUNDERS.map((f) => ({ name: f.name, title: f.title, photoUrl: f.photo }));

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Profile (photo + canonical name) for a known founder, or null for everyone
 * else. Shared accounts whose name contains several founder surnames (e.g.
 * the joint AGB inbox) resolve to null on purpose — better no photo than the
 * wrong face.
 */
export function founderProfileFor(
  displayName: string | null | undefined,
  email?: string | null,
): { photoUrl: string; displayName: string; title: string } | null {
  const found = resolve(displayName, email);
  return found
    ? { photoUrl: found.photo, displayName: found.name, title: found.title }
    : null;
}

/** Photo URL only — see founderProfileFor. */
export function founderPhotoFor(
  displayName: string | null | undefined,
  email?: string | null,
): string | null {
  return resolve(displayName, email)?.photo ?? null;
}

function resolve(
  displayName: string | null | undefined,
  email?: string | null,
): Founder | null {
  if (email) {
    const e = email.toLowerCase().trim();
    const byEmail = FOUNDERS.find((f) => f.emails.includes(e));
    if (byEmail) return byEmail;
  }
  if (!displayName) return null;
  const name = normalize(displayName);
  const byHandle = FOUNDERS.find((f) => f.handles.includes(name));
  if (byHandle) return byHandle;
  const bySurname = FOUNDERS.filter((f) => name.includes(f.surname));
  if (bySurname.length === 1) return bySurname[0];
  if (bySurname.length > 1) return null;
  const byFirst = FOUNDERS.filter((f) => f.firstName.test(name));
  return byFirst.length === 1 ? byFirst[0] : null;
}
