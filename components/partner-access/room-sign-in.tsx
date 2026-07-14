"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Volume2, VolumeX } from "lucide-react";

type ClaimableMember = {
  id: string;
  displayName: string | null;
  roleLabel: string | null;
};

import { useRoomDict } from "./room-i18n";

// Alma Llanera (harp) — 6s sting, faded in/out.
const SIGN_IN_AUDIO = "/partner-room/sign-in.mp3";
const INTRO_HOLD_MS = 6500;

/**
 * Branded, animated sign-in for a managed partner room. Sequence:
 *   intro (Bolívar quote, word-by-word, + Alma Llanera sting; tap to continue,
 *   auto-advances after 6.5s) → PIN (if set) → identity (if seat-managed).
 * The intro plays once; steps advance locally and only refresh into the room at
 * the end, so the ambiance isn't replayed.
 */
export function RoomSignIn({
  token,
  roomName,
  needsPin,
  needsIdentity,
  claimableMembers,
  seatsLeft,
}: {
  token: string;
  roomName: string;
  needsPin: boolean;
  needsIdentity: boolean;
  claimableMembers: ClaimableMember[];
  seatsLeft: number | null;
}) {
  const t = useRoomDict();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  // `playing` reflects whether sound is ACTUALLY audible (browsers block
  // un-gestured autoplay), so the control never lies about its state.
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<"intro" | "pin" | "identity" | "done">("intro");

  // Attempt the sting once, hold the intro (tap advances early, the timer is
  // the fallback), then stop the audio so it never outlives the screen
  // (WCAG 1.4.2 — audio doesn't exceed the moment).
  useEffect(() => {
    if (step !== "intro") return;
    const el = audioRef.current;
    el?.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    const id = setTimeout(() => advanceIntro(), INTRO_HOLD_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function advanceIntro() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
    setStep((current) =>
      current === "intro"
        ? needsPin
          ? "pin"
          : needsIdentity
            ? "identity"
            : "done"
        : current,
    );
  }

  useEffect(() => {
    if (step === "done") router.refresh();
  }, [step, router]);

  function toggleSound(e: React.MouseEvent) {
    // Don't let the sound control double as "continue".
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.currentTime = 0;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  function afterPin() {
    setStep(needsIdentity ? "identity" : "done");
  }

  return (
    <main
      onClick={step === "intro" ? advanceIntro : undefined}
      className={`relative grid min-h-dvh place-items-center overflow-hidden bg-neutral-950 px-5 text-white ${
        step === "intro" ? "cursor-pointer" : ""
      }`}
    >
      <audio
        ref={audioRef}
        src={SIGN_IN_AUDIO}
        preload="auto"
        onEnded={() => setPlaying(false)}
      />

      {/* Ambient gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(212,168,85,0.18), transparent 70%), radial-gradient(50% 50% at 50% 100%, rgba(56,80,140,0.22), transparent 70%)",
        }}
      />

      {step === "intro" && (
        <button
          type="button"
          onClick={toggleSound}
          aria-label={playing ? t.signin.mute : t.signin.unmute}
          className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20"
        >
          {playing ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      )}

      <div className="relative w-full max-w-md">
        <AnimatePresence mode="wait">
          {step === "intro" && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="text-center"
            >
              {/* The quote reveals word by word so it can be savored, not
                  skimmed; a tap anywhere continues immediately. */}
              <motion.blockquote
                initial="hidden"
                animate="visible"
                variants={{
                  visible: {
                    transition: { staggerChildren: 0.22, delayChildren: 0.35 },
                  },
                }}
                className="font-serif text-2xl italic leading-relaxed text-white/90 sm:text-3xl"
              >
                <span aria-hidden>&ldquo;</span>
                {t.footer.bolivarQuote.split(" ").map((word, i, words) => (
                  <motion.span
                    key={i}
                    variants={{
                      hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
                      visible: {
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                        transition: { duration: 0.55, ease: "easeOut" },
                      },
                    }}
                    className="inline-block"
                  >
                    {word}
                    {i < words.length - 1 ? " " : ""}
                  </motion.span>
                ))}
                <span aria-hidden>&rdquo;</span>
              </motion.blockquote>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 0.8 }}
                className="mt-4 text-xs uppercase tracking-[0.3em] text-[#D4A855]"
              >
                {t.signin.bolivarAttribution}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.7, 0.4, 0.7] }}
                transition={{ delay: 3.2, duration: 2.4, repeat: Infinity }}
                className="mt-8 text-[11px] uppercase tracking-[0.25em] text-white/50"
              >
                {t.signin.tapToContinue}
              </motion.p>
            </motion.div>
          )}

          {step === "pin" && (
            <motion.div
              key="pin"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
            >
              <PinStep token={token} roomName={roomName} onUnlocked={afterPin} />
            </motion.div>
          )}

          {step === "identity" && (
            <motion.div
              key="identity"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4 }}
            >
              <IdentityStep
                token={token}
                roomName={roomName}
                claimableMembers={claimableMembers}
                seatsLeft={seatsLeft}
                onDone={() => setStep("done")}
              />
            </motion.div>
          )}

          {step === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm text-white/60"
            >
              {t.signin.opening}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
      {children}
    </div>
  );
}

function PinStep({
  token,
  roomName,
  onUnlocked,
}: {
  token: string;
  roomName: string;
  onUnlocked: () => void;
}) {
  const t = useRoomDict();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!locked || retryAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= retryAt) {
        setLocked(false);
        setRetryAt(null);
        setError(null);
        inputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [locked, retryAt]);

  async function submit(value: string) {
    if (checking || ok || locked || value.length !== 4) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${token}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: value }),
      });
      if (res.ok) {
        setOk(true);
        onUnlocked();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        locked?: boolean;
        retryAt?: string;
      };
      if (data.locked) {
        setLocked(true);
        setRetryAt(data.retryAt ? new Date(data.retryAt).getTime() : Date.now() + 60_000);
      }
      setError(data.error ?? t.signin.pinMismatch);
      setCode("");
      inputRef.current?.focus();
    } catch {
      setError(t.signin.genericError);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <div className="text-center">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white/10">
          <Lock className="h-5 w-5 text-white/70" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">{roomName}</h1>
        <p className="mt-1 text-sm text-white/70">{t.signin.pinPrompt}</p>
      </div>
      <form
        className="mt-5 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <input
          ref={inputRef}
          autoFocus
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 4);
            setCode(next);
            if (error) setError(null);
            if (next.length === 4) void submit(next);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          disabled={checking || locked || ok}
          placeholder="••••"
          aria-label={t.signin.pinAria}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "pin-error" : undefined}
          className="w-40 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none focus:ring-2 focus:ring-[#D4A855]/60 disabled:opacity-50"
        />
        {error && (
          <p id="pin-error" role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
        {(checking || ok) && (
          <p className="mt-3 text-sm text-white/70">{ok ? t.signin.ready : t.signin.checking}</p>
        )}
      </form>
    </Card>
  );
}

function IdentityStep({
  token,
  roomName,
  claimableMembers,
  seatsLeft,
  onDone,
}: {
  token: string;
  roomName: string;
  claimableMembers: ClaimableMember[];
  seatsLeft: number | null;
  onDone: () => void;
}) {
  const t = useRoomDict();
  const [memberId, setMemberId] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picked = claimableMembers.find((m) => m.id === memberId) ?? null;
  const effectiveName = picked?.displayName ?? name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !email.trim() || !effectiveName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/access/${token}/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: effectiveName.trim() || undefined,
          memberId: memberId || undefined,
        }),
      });
      if (res.ok) {
        onDone();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? t.signin.identityError);
    } catch {
      setError(t.signin.identityErrorRetry);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{roomName}</h1>
        <p className="mt-1 text-sm text-white/70">
          {t.signin.identityPrompt}
          {seatsLeft !== null && seatsLeft <= 3 && seatsLeft > 0 && (
            <span className="text-white/40">{t.signin.seatsLeft(seatsLeft)}</span>
          )}
        </p>
      </div>
      <form onSubmit={submit} className="mt-5 space-y-2.5">
        {claimableMembers.length > 0 && (
          <select
            value={memberId}
            onChange={(e) => {
              setMemberId(e.target.value);
              setError(null);
            }}
            aria-label={t.signin.nameSelectAria}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white outline-none focus:ring-2 focus:ring-[#D4A855]/60 sm:text-sm"
          >
            <option value="" className="bg-neutral-900">
              {t.signin.notInList}
            </option>
            {claimableMembers.map((m) => (
              <option key={m.id} value={m.id} className="bg-neutral-900">
                {m.displayName}
                {m.roleLabel ? ` — ${m.roleLabel}` : ""}
              </option>
            ))}
          </select>
        )}

        {!picked && (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.signin.namePlaceholder}
            aria-label={t.signin.namePlaceholder}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#D4A855]/60 sm:text-sm"
          />
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.signin.emailPlaceholder}
          aria-label={t.signin.emailAria}
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-base text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#D4A855]/60 sm:text-sm"
        />

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !email.trim() || !effectiveName.trim()}
          className="w-full rounded-lg bg-[#D4A855] px-3 py-2.5 text-sm font-semibold text-neutral-950 transition hover:bg-[#e0bb6f] disabled:opacity-50"
        >
          {saving ? t.signin.entering : t.signin.enter}
        </button>
      </form>
    </Card>
  );
}
