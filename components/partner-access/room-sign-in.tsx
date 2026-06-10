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
  // `playing` reflects whether sound is ACTUALLY audible (browsers block
  // un-gestured autoplay), so the control never lies about its state.
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState<"intro" | "pin" | "identity" | "done">("intro");

  // Attempt the sting once, hold the intro, then advance + stop the audio so it
  // never outlives the screen (WCAG 1.4.2 — audio doesn't exceed the moment).
  useEffect(() => {
    if (step !== "intro") return;
    const el = audioRef.current;
    el?.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    const id = setTimeout(() => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.currentTime = 0;
      }
      setPlaying(false);
      setStep(needsPin ? "pin" : needsIdentity ? "identity" : "done");
    }, 2800);
    return () => clearTimeout(id);
  }, [step, needsPin, needsIdentity]);

  useEffect(() => {
    if (step === "done") router.refresh();
  }, [step, router]);

  function toggleSound() {
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
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-neutral-950 px-5 text-white">
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
          aria-label={playing ? "Silenciar" : "Reproducir sonido"}
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
              Abriendo la sala…
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
      setError(data.error ?? "Ese código no coincide.");
      setCode("");
      inputRef.current?.focus();
    } catch {
      setError("Algo salió mal. Inténtalo de nuevo.");
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
        <p className="mt-1 text-sm text-white/70">Ingresa tu código de 4 dígitos.</p>
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
          <p className="mt-3 text-sm text-white/70">{ok ? "Listo…" : "Verificando…"}</p>
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
      setError(data.error ?? "No pudimos registrarte.");
    } catch {
      setError("No pudimos registrarte. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{roomName}</h1>
        <p className="mt-1 text-sm text-white/70">
          Confirma quién eres para entrar.
          {seatsLeft !== null && seatsLeft <= 3 && seatsLeft > 0 && (
            <span className="text-white/40"> {seatsLeft} {seatsLeft === 1 ? "lugar" : "lugares"} disponible{seatsLeft === 1 ? "" : "s"}.</span>
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
            placeholder="Tu nombre"
            aria-label="Tu nombre"
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
          {saving ? "Entrando…" : "Entrar a la sala"}
        </button>
      </form>
    </Card>
  );
}
