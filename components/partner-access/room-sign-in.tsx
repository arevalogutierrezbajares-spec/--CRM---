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

const BOLIVAR_QUOTE = "Dios concede la victoria a la perseverancia";
const SIGN_IN_AUDIO = "/partner-room/sign-in.mp3";

/**
 * Branded, animated sign-in for a managed partner room. Sequence:
 *   intro (Bolívar quote + 5s sting) → PIN (if set) → identity (if seat-managed).
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
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const [step, setStep] = useState<"intro" | "pin" | "identity" | "done">("intro");

  // Play the sting + hold the intro, then advance to the first required step.
  useEffect(() => {
    if (step !== "intro") return;
    if (!muted) audioRef.current?.play().catch(() => {});
    const id = setTimeout(() => {
      setStep(needsPin ? "pin" : needsIdentity ? "identity" : "done");
    }, 2600);
    return () => clearTimeout(id);
  }, [step, muted, needsPin, needsIdentity]);

  useEffect(() => {
    if (step === "done") router.refresh();
  }, [step, router]);

  function afterPin() {
    setStep(needsIdentity ? "identity" : "done");
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-neutral-950 px-5 text-white">
      <audio ref={audioRef} src={SIGN_IN_AUDIO} preload="auto" />

      {/* Ambient gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(212,168,85,0.18), transparent 70%), radial-gradient(50% 50% at 50% 100%, rgba(56,80,140,0.22), transparent 70%)",
        }}
      />

      <button
        type="button"
        onClick={() => {
          setMuted((m) => {
            const next = !m;
            if (next) audioRef.current?.pause();
            else audioRef.current?.play().catch(() => {});
            return next;
          });
        }}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20"
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

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
              <motion.blockquote
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 1.1, ease: "easeOut" }}
                className="font-serif text-2xl italic leading-relaxed text-white/90 sm:text-3xl"
              >
                &ldquo;{BOLIVAR_QUOTE}&rdquo;
              </motion.blockquote>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.8 }}
                className="mt-4 text-xs uppercase tracking-[0.3em] text-[#D4A855]"
              >
                Simón Bolívar
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
              Opening the room…
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
      setError(data.error ?? "That code didn't match.");
      setCode("");
      inputRef.current?.focus();
    } catch {
      setError("Something went wrong. Try again.");
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
        <p className="mt-1 text-sm text-white/50">Enter your 4-digit access code.</p>
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
          aria-label="4-digit access code"
          className="w-40 rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white outline-none focus:ring-2 focus:ring-[#D4A855]/60 disabled:opacity-50"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {error}
          </p>
        )}
        {(checking || ok) && (
          <p className="mt-3 text-sm text-white/50">{ok ? "Unlocked…" : "Checking…"}</p>
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
      setError(data.error ?? "Could not sign you in.");
    } catch {
      setError("Could not sign you in. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{roomName}</h1>
        <p className="mt-1 text-sm text-white/50">
          Confirm who you are to enter.
          {seatsLeft !== null && seatsLeft <= 3 && seatsLeft > 0 && (
            <span className="text-white/40"> {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left.</span>
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
            aria-label="Choose your name"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-[#D4A855]/60"
          >
            <option value="" className="bg-neutral-900">
              I&rsquo;m not listed…
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
            placeholder="Your name"
            aria-label="Your name"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#D4A855]/60"
          />
        )}

        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Your email"
          className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:ring-2 focus:ring-[#D4A855]/60"
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
          {saving ? "Entering…" : "Enter room"}
        </button>
      </form>
    </Card>
  );
}
